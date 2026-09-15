/**
 * Pure Copilot decision logic -- deliberately has NO `server-only` import
 * and NO I/O (no Supabase, no fetch, no AI call). Every function here is
 * a plain, synchronous, unit-testable transformation from stored/computed
 * facts to a decision. `lib/copilot.ts` and `lib/copilot-actions.ts` do
 * all the actual database/AI work and call into this module for the
 * decisions themselves, so the decision rules can be tested directly with
 * Node's built-in test runner (`scripts/run-copilot-lifecycle-tests.mjs`)
 * without spinning up Next.js, Supabase, or Gemini.
 *
 * `CustomerSummary` is imported `type`-only from lib/customers.ts (which
 * *does* carry `server-only`) -- a type-only import is erased at compile
 * time and never executes that module, so this file stays safely
 * importable from a plain Node script.
 */
import { MAX_LEAD_SCORE } from "@/lib/lead-scoring";
import type { CustomerSummary } from "@/lib/customers";

/**
 * Stable identity for a priority reason, separate from its
 * human-readable `label` (which embeds live numbers like "Lead score
 * 7/9" and therefore can't be used as a stable identity -- it changes
 * every time the underlying number changes). Both the v1 dismissal
 * lifecycle (`copilot_dismissals`) and the v2 action lifecycle
 * (`copilot_actions`) key their suppression/reopening rules on this,
 * never on `label`.
 */
export type PriorityReasonKey =
  | "needs_attention"
  | "appointment_pending"
  | "appointment_soon"
  | "lead_score"
  | "stalled"
  | "human_controlled";

export type PriorityReason = { key: PriorityReasonKey; label: string; weight: number };

/** Static, number-free labels for history views -- deliberately not the live `label`, which embeds numbers that change. */
export const PRIORITY_REASON_KEY_LABELS: Record<PriorityReasonKey, string> = {
  needs_attention: "Conversation needs attention",
  appointment_pending: "Appointment awaiting confirmation",
  appointment_soon: "Appointment within 24 hours",
  lead_score: "High lead score",
  stalled: "No recent activity",
  human_controlled: "Currently human-controlled",
};

/** A dismissal older than this always resurfaces, regardless of whether any reason changed. Unchanged from v1. */
export const DISMISSAL_EXPIRY_DAYS = 7;

const STALLED_HOURS = 48;

/**
 * A small, deterministic action taxonomy based on what this product can
 * actually recommend today -- normalized from `computePriority()`'s
 * existing recommendedAction branch logic, not invented independently of
 * it. `title` is a stable, generic label per type (never customer-
 * specific, never AI-generated); `recommendedAction` (see
 * `DesiredCopilotAction`) is the specific next-step sentence.
 */
export type CopilotActionType =
  | "reply_to_prospect"
  | "confirm_appointment"
  | "follow_up"
  | "review_stalled_conversation"
  | "handle_attention";

export const ACTION_TYPE_TITLES: Record<CopilotActionType, string> = {
  reply_to_prospect: "Reply to prospect",
  confirm_appointment: "Confirm appointment",
  follow_up: "Follow up with prospect",
  review_stalled_conversation: "Review stalled conversation",
  handle_attention: "Review conversation",
};

export const COPILOT_ACTION_TYPES = Object.keys(ACTION_TYPE_TITLES) as CopilotActionType[];

export type CopilotActionStatus = "open" | "snoozed" | "completed" | "dismissed" | "superseded" | "expired";

type PriorityComputation = {
  priority: number;
  reasons: PriorityReason[];
  recommendedAction: string;
  actionType: CopilotActionType;
};

/**
 * The one deterministic scoring pass, shared by `computePriority()` (v1,
 * unchanged output shape) and `deriveDesiredAction()` (v2, adds the
 * stable `actionType`) so the branch logic that decides "what's the one
 * recommended action" is written exactly once. Every weight traces to a
 * real stored field -- nothing here is invented or AI-generated.
 */
function computePriorityInternal(customer: CustomerSummary, nowMs: number): PriorityComputation {
  const reasons: PriorityReason[] = [];
  let priority = 0;

  if (customer.needsAttention) {
    priority += 50;
    reasons.push({ key: "needs_attention", label: "Conversation needs attention", weight: 50 });
  }

  if (customer.latestAppointmentStatus === "pending") {
    priority += 40;
    reasons.push({ key: "appointment_pending", label: "Appointment awaiting confirmation", weight: 40 });
  } else if (customer.latestAppointmentStatus === "confirmed" && customer.latestAppointmentStartsAt) {
    const hoursUntil = (new Date(customer.latestAppointmentStartsAt).getTime() - nowMs) / (60 * 60 * 1000);
    if (hoursUntil >= 0 && hoursUntil <= 24) {
      priority += 25;
      reasons.push({ key: "appointment_soon", label: "Appointment within 24 hours", weight: 25 });
    }
  }

  if (customer.latestLead) {
    const scoreWeight = customer.latestLead.score * 5;
    priority += scoreWeight;
    if (scoreWeight > 0) {
      reasons.push({ key: "lead_score", label: `Lead score ${customer.latestLead.score}/${MAX_LEAD_SCORE}`, weight: scoreWeight });
    }
  }

  const hoursSinceActivity = (nowMs - new Date(customer.lastActivityAt).getTime()) / (60 * 60 * 1000);
  const isOpenLead = customer.latestLead && customer.latestLead.status !== "converted" && customer.latestLead.status !== "lost";
  const isStalled = Boolean(isOpenLead) && hoursSinceActivity > STALLED_HOURS;
  if (isStalled) {
    priority += 20;
    reasons.push({ key: "stalled", label: `No activity for ${Math.round(hoursSinceActivity)}h`, weight: 20 });
  }

  if (customer.humanControlled) {
    priority += 10;
    reasons.push({ key: "human_controlled", label: "Currently human-controlled", weight: 10 });
  }

  let recommendedAction = "Review";
  let actionType: CopilotActionType = "handle_attention";
  if (customer.needsAttention) {
    recommendedAction = "Review and respond";
    actionType = "reply_to_prospect";
  } else if (customer.latestAppointmentStatus === "pending") {
    recommendedAction = "Confirm or decline the appointment";
    actionType = "confirm_appointment";
  } else if (customer.latestAppointmentStatus === "confirmed" && reasons.some((r) => r.key === "appointment_soon")) {
    recommendedAction = "Confirm attendance";
    actionType = "confirm_appointment";
  } else if (isStalled) {
    recommendedAction = "Follow up";
    actionType = "review_stalled_conversation";
  } else if (customer.latestLead?.qualification === "hot") {
    recommendedAction = "Follow up and offer a consultation";
    actionType = "follow_up";
  } else if (customer.latestLead && !customer.latestAppointmentStatus) {
    recommendedAction = "Invite to book";
    actionType = "follow_up";
  }

  return { priority, reasons, recommendedAction, actionType };
}

/**
 * Deterministic priority score + one recommended action for a customer
 * snapshot. Pure function, no I/O. Unchanged signature/output from v1 --
 * `app/(dashboard)/dashboard/conversations/[id]/page.tsx`'s "Next best
 * action" banner calls this directly and must keep working exactly as
 * before.
 */
export function computePriority(customer: CustomerSummary, nowMs: number = Date.now()): { priority: number; reasons: PriorityReason[]; recommendedAction: string } {
  const { priority, reasons, recommendedAction } = computePriorityInternal(customer, nowMs);
  return { priority, reasons, recommendedAction };
}

export type DesiredCopilotAction = {
  actionType: CopilotActionType;
  title: string;
  recommendedAction: string;
  reasons: PriorityReason[];
  priority: number;
};

/**
 * v2: the same scoring pass as `computePriority()`, but also names the
 * stable `actionType` this customer's situation maps to, for
 * `copilot_actions` reconciliation. `null` when nothing is currently
 * actionable (priority 0). Because `computePriorityInternal()`'s branch
 * logic picks exactly one recommendation per customer today, this
 * currently ever proposes one desired action per customer per call --
 * `copilot_actions` still supports multiple *rows* per customer over
 * time (a resolved `confirm_appointment` from last week coexisting with
 * a new `follow_up` this week), just not multiple *simultaneously
 * desired* actions from a single scoring pass. Documented, not hidden.
 */
export function deriveDesiredAction(customer: CustomerSummary, nowMs: number = Date.now()): DesiredCopilotAction | null {
  const result = computePriorityInternal(customer, nowMs);
  if (result.priority <= 0) return null;
  return {
    actionType: result.actionType,
    title: ACTION_TYPE_TITLES[result.actionType],
    recommendedAction: result.recommendedAction,
    reasons: result.reasons,
    priority: result.priority,
  };
}

/** Minimal shape of a `copilot_dismissals` row this module needs -- avoids importing lib/supabase/types.ts's full `CopilotDismissal` (not needed for a pure decision). */
type DismissalSnapshot = { reason_keys: string[]; dismissed_at: string };

/**
 * v1 resurfacing rule, UNCHANGED: an item stays suppressed only if every
 * reason true right now was already known at dismiss time, and the
 * dismissal is younger than DISMISSAL_EXPIRY_DAYS. A genuinely new reason
 * key, or an expired dismissal, resurfaces the item immediately.
 */
export function isSuppressedByDismissal(
  reasons: PriorityReason[],
  dismissal: DismissalSnapshot | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!dismissal) return false;

  const ageMs = nowMs - new Date(dismissal.dismissed_at).getTime();
  if (ageMs > DISMISSAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000) return false;

  const dismissedKeys = new Set(dismissal.reason_keys);
  return reasons.every((reason) => dismissedKeys.has(reason.key));
}

/** A snoozed action becomes actionable again once its wake time has passed. */
export function isSnoozeDue(snoozedUntil: string, nowMs: number = Date.now()): boolean {
  return new Date(snoozedUntil).getTime() <= nowMs;
}

/** Minimal shape of a resolved (`completed`/`dismissed`/`superseded`/`expired`) `copilot_actions` row this module needs for the reopening decision. */
export type ResolvedActionSnapshot = {
  status: CopilotActionStatus;
  reasonKeys: PriorityReasonKey[];
  dismissedAt: string | null;
};

/**
 * v2 generalization of `isSuppressedByDismissal()`, for `copilot_actions`.
 * Same core principle everywhere in this file (section 12 of the spec):
 * "no meaningful new signal -> stay suppressed; new signal -> reopen."
 *
 * - `dismissed`: reason-subset check AND younger than DISMISSAL_EXPIRY_DAYS
 *   (identical rule to v1's `isSuppressedByDismissal`).
 * - `completed` / `superseded` / `expired`: reason-subset check only, no
 *   time-based expiry -- these mean the work is genuinely done or the
 *   recommendation is genuinely obsolete, not "remind me later," so they
 *   stay resolved indefinitely unless a *new* reason key actually shows up.
 */
export function isActionSuppressedByHistory(
  desiredReasonKeys: PriorityReasonKey[],
  resolved: ResolvedActionSnapshot,
  nowMs: number = Date.now(),
): boolean {
  if (resolved.status === "dismissed") {
    if (!resolved.dismissedAt) return false;
    const ageMs = nowMs - new Date(resolved.dismissedAt).getTime();
    if (ageMs > DISMISSAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000) return false;
  }

  const knownKeys = new Set(resolved.reasonKeys);
  return desiredReasonKeys.every((key) => knownKeys.has(key));
}

/** An `open` action sitting untouched this long is no longer actionable -- it expires rather than lingering on Today forever. */
export const COPILOT_ACTION_EXPIRY_DAYS = 30;

export type ExistingActionSnapshot = {
  status: CopilotActionStatus;
  reasonKeys: PriorityReasonKey[];
  snoozedUntil: string | null;
  dismissedAt: string | null;
  createdAt: string;
};

export type ReconciliationDecision =
  /** No existing row for this (customer, actionType) -- create a new `open` one. */
  | { op: "create" }
  /** Existing `open` row -- refresh its reasons/priority/presentation text in place. */
  | { op: "update" }
  /** Existing `open` row that has sat untouched past COPILOT_ACTION_EXPIRY_DAYS -- no longer actionable. */
  | { op: "expire" }
  /** Existing `snoozed` row whose `snoozedUntil` has passed -- wake it back to `open`. */
  | { op: "wake" }
  /** Existing `snoozed` row not yet due -- leave it alone, hidden from Today. */
  | { op: "keep_snoozed" }
  /** Existing terminal (`completed`/`dismissed`/`superseded`/`expired`) row, still suppressed -- do nothing. */
  | { op: "keep_suppressed" }
  /** Existing terminal row, but a genuinely new reason key appeared -- reopen it. */
  | { op: "reopen" };

/**
 * The single per-(customer, actionType) reconciliation decision, pure and
 * idempotent: given what's desired right now and what row (if any)
 * already exists, decide the one thing to do. Calling this repeatedly
 * with the same inputs always yields the same decision -- the property
 * that makes read-time reconciliation safe to run on every page load
 * without creating duplicates or fighting a concurrent request.
 */
export function decideReconciliation(
  desiredReasonKeys: PriorityReasonKey[],
  existing: ExistingActionSnapshot | undefined,
  nowMs: number = Date.now(),
): ReconciliationDecision {
  if (!existing) return { op: "create" };

  if (existing.status === "open") {
    const ageMs = nowMs - new Date(existing.createdAt).getTime();
    if (ageMs > COPILOT_ACTION_EXPIRY_DAYS * 24 * 60 * 60 * 1000) return { op: "expire" };
    return { op: "update" };
  }

  if (existing.status === "snoozed") {
    if (existing.snoozedUntil && isSnoozeDue(existing.snoozedUntil, nowMs)) return { op: "wake" };
    return { op: "keep_snoozed" };
  }

  const suppressed = isActionSuppressedByHistory(
    desiredReasonKeys,
    { status: existing.status, reasonKeys: existing.reasonKeys, dismissedAt: existing.dismissedAt },
    nowMs,
  );
  return suppressed ? { op: "keep_suppressed" } : { op: "reopen" };
}

export type SnoozePreset = "later_today" | "tomorrow" | "next_week";

const LATER_TODAY_HOURS = 4;
const SNOOZE_MORNING_HOUR = 9;

function localDateParts(dateMs: number, timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(dateMs));
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

/** How far ahead of UTC `timezone`'s wall clock reads at `dateMs`, in ms. Standard offset-by-formatting trick -- no date library needed. */
function timezoneOffsetMs(dateMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(dateMs));
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second));
  return asUtc - dateMs;
}

/** `SNOOZE_MORNING_HOUR`:00 local time in `timezone`, `daysAhead` calendar days from `nowMs`'s local date. */
function localMorning(nowMs: number, timezone: string, daysAhead: number): string {
  const { year, month, day } = localDateParts(nowMs, timezone);
  const naiveTargetMs = Date.UTC(year, month - 1, day + daysAhead, SNOOZE_MORNING_HOUR, 0, 0);
  const offsetMs = timezoneOffsetMs(naiveTargetMs, timezone);
  return new Date(naiveTargetMs - offsetMs).toISOString();
}

/**
 * Snooze quick-presets, in the business's own timezone (same
 * `businesses.timezone` convention `lib/business-hours.ts` already uses)
 * -- "Later today" is a plain relative offset (timezone doesn't change a
 * same-day bump), "Tomorrow"/"Next week" land on a fixed local morning
 * hour. A "pick date/time" custom snooze bypasses this entirely: the
 * client's `<input type="datetime-local">` already resolves in the
 * viewer's own local timezone, converted to an ISO string client-side.
 */
export function computeSnoozeUntil(preset: SnoozePreset, nowMs: number, timezone: string): string {
  switch (preset) {
    case "later_today":
      return new Date(nowMs + LATER_TODAY_HOURS * 60 * 60 * 1000).toISOString();
    case "tomorrow":
      return localMorning(nowMs, timezone, 1);
    case "next_week":
      return localMorning(nowMs, timezone, 7);
    default: {
      const exhaustive: never = preset;
      throw new Error(`Unknown snooze preset: ${exhaustive}`);
    }
  }
}
