import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTodayPriorityList } from "@/lib/copilot";
import {
  deriveDesiredAction,
  decideReconciliation,
  computeSnoozeUntil,
  type DesiredCopilotAction,
  type ExistingActionSnapshot,
  type CopilotActionType,
  type PriorityReasonKey,
  type PriorityReason,
  type SnoozePreset,
} from "@/lib/copilot-lifecycle";
import type { CustomerSummary } from "@/lib/customers";
import { getBusinessTimezone } from "@/lib/business-hours";
import { AppError } from "@/lib/errors";
import type { CopilotAction } from "@/lib/supabase/types";

/**
 * Copilot Action Lifecycle v2 -- the first-class, per-(customer,
 * action_type) `copilot_actions` entity, layered ON TOP of the existing
 * v1 `copilot_dismissals` mechanism (lib/copilot.ts), never replacing it.
 *
 * `reconcileTodayCopilotActions()` is the one place this file writes as a
 * side effect of a read: it takes `getTodayPriorityList()`'s already
 * dismissal-filtered output as its "desired state," diffs it against
 * whatever `copilot_actions` rows already exist, and creates/updates/
 * wakes/expires/supersedes exactly what's needed -- never duplicating an
 * active row (enforced doubly: `decideReconciliation()`'s pure logic, and
 * the database's own partial unique index as a race-safety net). Calling
 * it twice in a row with no underlying change is a no-op both times.
 *
 * Auto-completion/superseding from real domain events (a staff reply
 * sent, an appointment confirmed/cancelled/completed) is intentionally
 * NOT done here -- see `completeCopilotActionsForEvent()` /
 * `supersedeCopilotActionsForEvent()` below, called directly from the
 * actual mutation call sites (never inferred at read time).
 */

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const MAX_TODAY_ACTIONS = 50;

function rowKey(customerId: string, actionType: CopilotActionType): string {
  return `${customerId}:${actionType}`;
}

function toExistingSnapshot(row: CopilotAction): ExistingActionSnapshot {
  return {
    status: row.status,
    reasonKeys: row.reason_keys as PriorityReasonKey[],
    snoozedUntil: row.snoozed_until,
    dismissedAt: row.dismissed_at,
    createdAt: row.created_at,
  };
}

function dueAtFor(action: DesiredCopilotAction, customer: CustomerSummary): string | null {
  return action.actionType === "confirm_appointment" ? customer.latestAppointmentStartsAt : null;
}

async function insertCopilotAction(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string,
  customer: CustomerSummary,
  action: DesiredCopilotAction,
): Promise<CopilotAction> {
  const { data, error } = await supabase
    .from("copilot_actions")
    .insert({
      business_id: businessId,
      customer_id: customerId,
      action_type: action.actionType,
      status: "open",
      priority: action.priority,
      reason_keys: action.reasons.map((r) => r.key),
      title: action.title,
      recommended_action: action.recommendedAction,
      due_at: dueAtFor(action, customer),
    })
    .select()
    .single();

  if (error) {
    // A concurrent request (another staff member's page load) may have
    // already inserted the active row for this (business_id, customer_id,
    // action_type) between our read and this insert -- the partial unique
    // index rejects the duplicate (23505). Treat that as "someone else
    // just created it" and use that row instead of failing the read.
    if (error.code === "23505") {
      const { data: existing, error: reReadError } = await supabase
        .from("copilot_actions")
        .select("*")
        .eq("business_id", businessId)
        .eq("customer_id", customerId)
        .eq("action_type", action.actionType)
        .in("status", ["open", "snoozed"])
        .maybeSingle();
      if (!reReadError && existing) return existing as CopilotAction;
    }
    throw new AppError("Something went wrong updating your Copilot list. Please try again.", "insertCopilotAction failed", error);
  }

  return data as CopilotAction;
}

async function updateCopilotActionIfChanged(
  supabase: SupabaseClient,
  row: CopilotAction,
  action: DesiredCopilotAction,
  customer: CustomerSummary,
): Promise<CopilotAction> {
  const reasonKeys = action.reasons.map((r) => r.key);
  const dueAt = dueAtFor(action, customer);
  const unchanged =
    row.priority === action.priority &&
    row.title === action.title &&
    row.recommended_action === action.recommendedAction &&
    row.due_at === dueAt &&
    reasonKeys.length === row.reason_keys.length &&
    reasonKeys.every((key) => row.reason_keys.includes(key));

  if (unchanged) return row;

  const { data, error } = await supabase
    .from("copilot_actions")
    .update({ priority: action.priority, reason_keys: reasonKeys, title: action.title, recommended_action: action.recommendedAction, due_at: dueAt })
    .eq("id", row.id)
    .select()
    .single();

  if (error) {
    throw new AppError("Something went wrong updating your Copilot list. Please try again.", "updateCopilotActionIfChanged failed", error);
  }

  return data as CopilotAction;
}

async function wakeCopilotAction(
  supabase: SupabaseClient,
  row: CopilotAction,
  action: DesiredCopilotAction,
  customer: CustomerSummary,
): Promise<CopilotAction> {
  const { data, error } = await supabase
    .from("copilot_actions")
    .update({
      status: "open",
      snoozed_until: null,
      priority: action.priority,
      reason_keys: action.reasons.map((r) => r.key),
      title: action.title,
      recommended_action: action.recommendedAction,
      due_at: dueAtFor(action, customer),
    })
    .eq("id", row.id)
    .select()
    .single();

  if (error) {
    throw new AppError("Something went wrong waking a snoozed Copilot item. Please try again.", "wakeCopilotAction failed", error);
  }

  return data as CopilotAction;
}

async function expireCopilotActionRow(supabase: SupabaseClient, row: CopilotAction): Promise<void> {
  const { error } = await supabase
    .from("copilot_actions")
    .update({ status: "expired", expired_at: new Date().toISOString() })
    .eq("id", row.id);

  if (error) {
    throw new AppError("Something went wrong updating your Copilot list. Please try again.", "expireCopilotActionRow failed", error);
  }
}

async function supersedeCopilotActionRow(supabase: SupabaseClient, row: CopilotAction): Promise<void> {
  const { error } = await supabase
    .from("copilot_actions")
    .update({ status: "superseded", superseded_at: new Date().toISOString() })
    .eq("id", row.id);

  if (error) {
    throw new AppError("Something went wrong updating your Copilot list. Please try again.", "supersedeCopilotActionRow failed", error);
  }
}

export type TodayActionItem = {
  id: string;
  customer: CustomerSummary;
  actionType: CopilotActionType;
  priority: number;
  reasons: PriorityReason[];
  title: string;
  recommendedAction: string;
};

/**
 * Reconciles desired Copilot actions against persisted `copilot_actions`
 * rows and returns the current "Today" list -- open actions, highest
 * priority first, capped at MAX_TODAY_ACTIONS. This is the one function
 * in this file that writes as a side effect of a read; every write is a
 * narrowly-scoped, idempotent state transition (see the module doc
 * comment above), never a broad or destructive one.
 */
export async function reconcileTodayCopilotActions(businessId: string): Promise<TodayActionItem[]> {
  const supabase = createServerSupabaseClient();
  const nowMs = Date.now();

  // `getTodayPriorityList()` is v1, unchanged: it already applies the
  // existing `copilot_dismissals` suppression. Reconciliation only ever
  // sees customers that have already survived that filter.
  const priorityItems = await getTodayPriorityList(businessId);

  const desired = new Map<string, { customer: CustomerSummary; action: DesiredCopilotAction }>();
  for (const item of priorityItems) {
    const action = deriveDesiredAction(item.customer, nowMs);
    if (action) desired.set(item.customer.id, { customer: item.customer, action });
  }

  const desiredCustomerIds = [...desired.keys()];

  const [activeResult, historyResult] = await Promise.all([
    supabase.from("copilot_actions").select("*").eq("business_id", businessId).in("status", ["open", "snoozed"]),
    desiredCustomerIds.length > 0
      ? supabase
          .from("copilot_actions")
          .select("*")
          .eq("business_id", businessId)
          .in("customer_id", desiredCustomerIds)
          .in("status", ["completed", "dismissed", "superseded", "expired"])
      : Promise.resolve({ data: [] as CopilotAction[], error: null }),
  ]);

  if (activeResult.error) {
    throw new AppError("Something went wrong loading your Copilot list. Please try again.", "reconcileTodayCopilotActions active lookup failed", activeResult.error);
  }
  if (historyResult.error) {
    throw new AppError("Something went wrong loading your Copilot list. Please try again.", "reconcileTodayCopilotActions history lookup failed", historyResult.error);
  }

  const activeByKey = new Map<string, CopilotAction>();
  for (const row of activeResult.data as CopilotAction[]) {
    activeByKey.set(rowKey(row.customer_id, row.action_type), row);
  }

  const latestTerminalByKey = new Map<string, CopilotAction>();
  for (const row of historyResult.data as CopilotAction[]) {
    const key = rowKey(row.customer_id, row.action_type);
    const current = latestTerminalByKey.get(key);
    if (!current || row.created_at > current.created_at) latestTerminalByKey.set(key, row);
  }

  const results: TodayActionItem[] = [];

  for (const [customerId, { customer, action }] of desired) {
    const key = rowKey(customerId, action.actionType);
    const active = activeByKey.get(key);
    const existingSnapshot = active ? toExistingSnapshot(active) : (() => {
      const terminal = latestTerminalByKey.get(key);
      return terminal ? toExistingSnapshot(terminal) : undefined;
    })();

    const reasonKeys = action.reasons.map((r) => r.key);
    const decision = decideReconciliation(reasonKeys, existingSnapshot, nowMs);

    let resultRow: CopilotAction | null = null;
    switch (decision.op) {
      case "create":
      case "reopen":
        resultRow = await insertCopilotAction(supabase, businessId, customerId, customer, action);
        break;
      case "update":
        resultRow = await updateCopilotActionIfChanged(supabase, active as CopilotAction, action, customer);
        break;
      case "wake":
        resultRow = await wakeCopilotAction(supabase, active as CopilotAction, action, customer);
        break;
      case "expire":
        // Same fate as any other terminal state going forward: it stays
        // suppressed unless a genuinely new reason key appears next pass
        // (see lib/copilot-lifecycle.ts's isActionSuppressedByHistory) --
        // no special-cased immediate recreation here.
        await expireCopilotActionRow(supabase, active as CopilotAction);
        resultRow = null;
        break;
      case "keep_snoozed":
      case "keep_suppressed":
        resultRow = null;
        break;
    }

    if (active) activeByKey.delete(key);

    if (resultRow && resultRow.status === "open") {
      results.push({
        id: resultRow.id,
        customer,
        actionType: action.actionType,
        priority: action.priority,
        reasons: action.reasons,
        title: action.title,
        recommendedAction: action.recommendedAction,
      });
    }
  }

  // Whatever's left in activeByKey belongs to a (customer, action_type)
  // that is no longer desired at all -- the underlying signal genuinely
  // vanished (e.g. the conversation stopped needing attention some other
  // way, the lead was marked lost). That makes the recommendation
  // obsolete, not something a human or the app proved was completed --
  // superseded, never a false "completed" claim.
  for (const row of activeByKey.values()) {
    await supersedeCopilotActionRow(supabase, row);
  }

  return results.sort((a, b) => b.priority - a.priority).slice(0, MAX_TODAY_ACTIONS);
}

export type SnoozeChoice = { preset: SnoozePreset } | { preset: "custom"; until: string };

/** Resolves a snooze choice to a concrete ISO timestamp -- quick presets use the business's own timezone (lib/business-hours.ts's `getBusinessTimezone`); "custom" trusts the client's already-resolved ISO string (its `<input type="datetime-local">` already converts using the viewer's own local timezone). */
export async function resolveSnoozeUntil(businessId: string, choice: SnoozeChoice): Promise<string> {
  if (choice.preset === "custom") return choice.until;
  const timezone = await getBusinessTimezone(businessId);
  return computeSnoozeUntil(choice.preset, Date.now(), timezone);
}

/**
 * "Remind me at this time" -- distinct from "Mark as handled" (see
 * PRODUCT.md/STATE.md). Transitions a currently `open` OR `snoozed` row
 * (the latter is "Snooze again" from the Upcoming view, picking a new
 * wake time) -- a terminal row isn't something "Snooze" acts on. Boolean
 * return, not-found/not-open/not-snoozed => false.
 */
export async function snoozeCopilotAction(
  businessId: string,
  customerId: string,
  actionType: CopilotActionType,
  snoozedUntilIso: string,
): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("copilot_actions")
    .update({ status: "snoozed", snoozed_until: snoozedUntilIso })
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .eq("action_type", actionType)
    .in("status", ["open", "snoozed"])
    .select("id");

  if (error) {
    throw new AppError("Something went wrong snoozing this item. Please try again.", "snoozeCopilotAction failed", error);
  }

  return data.length > 0;
}

export type UpcomingActionItem = {
  id: string;
  customerId: string;
  customerName: string | null;
  actionType: CopilotActionType;
  title: string;
  recommendedAction: string;
  reasonKeys: PriorityReasonKey[];
  snoozedUntil: string;
};

async function loadCustomerNames(supabase: SupabaseClient, businessId: string, customerIds: string[]): Promise<Map<string, string | null>> {
  const uniqueIds = [...new Set(customerIds)];
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase.from("customers").select("id, display_name").eq("business_id", businessId).in("id", uniqueIds);
  if (error) {
    throw new AppError("Something went wrong loading customer names. Please try again.", "loadCustomerNames failed", error);
  }

  return new Map(data.map((row) => [row.id, row.display_name]));
}

/** Snoozed actions, soonest wake time first. Never includes completed/dismissed/superseded/expired rows. */
export async function listUpcomingCopilotActions(businessId: string, limit = 50): Promise<UpcomingActionItem[]> {
  const supabase = createServerSupabaseClient();
  const { data: rows, error } = await supabase
    .from("copilot_actions")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "snoozed")
    .order("snoozed_until", { ascending: true })
    .limit(limit);

  if (error) {
    throw new AppError("Something went wrong loading upcoming Copilot items. Please try again.", "listUpcomingCopilotActions failed", error);
  }
  if (rows.length === 0) return [];

  const nameById = await loadCustomerNames(supabase, businessId, rows.map((row) => row.customer_id));

  return (rows as CopilotAction[]).map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    customerName: nameById.get(row.customer_id) ?? null,
    actionType: row.action_type,
    title: row.title,
    recommendedAction: row.recommended_action,
    reasonKeys: row.reason_keys as PriorityReasonKey[],
    snoozedUntil: row.snoozed_until as string,
  }));
}

export type CompletedActionItem = {
  id: string;
  customerId: string;
  customerName: string | null;
  actionType: CopilotActionType;
  title: string;
  reasonKeys: PriorityReasonKey[];
  status: "completed" | "dismissed";
  completedAt: string | null;
  completedBy: string | null;
  dismissedAt: string | null;
  dismissedBy: string | null;
};

/**
 * Focused Copilot work history -- completed and dismissed actions only
 * (never superseded/expired, which are background bookkeeping, not "work
 * that got done"), most recent first. Deliberately kept small per the
 * task's own "not an enormous CRM history page" instruction.
 */
export async function listCompletedCopilotActions(businessId: string, limit = 20): Promise<CompletedActionItem[]> {
  const supabase = createServerSupabaseClient();
  // Over-fetch a little before re-sorting by the coalesced completion
  // instant (completed_at ?? dismissed_at) -- a plain `created_at` order
  // wouldn't reflect "when the work actually finished."
  const { data: rows, error } = await supabase
    .from("copilot_actions")
    .select("*")
    .eq("business_id", businessId)
    .in("status", ["completed", "dismissed"])
    .order("created_at", { ascending: false })
    .limit(limit * 2);

  if (error) {
    throw new AppError("Something went wrong loading completed Copilot items. Please try again.", "listCompletedCopilotActions failed", error);
  }
  if (rows.length === 0) return [];

  const sorted = (rows as CopilotAction[])
    .map((row) => ({ row, at: row.completed_at ?? row.dismissed_at ?? row.created_at }))
    .sort((a, b) => (a.at > b.at ? -1 : 1))
    .slice(0, limit)
    .map((entry) => entry.row);

  const nameById = await loadCustomerNames(supabase, businessId, sorted.map((row) => row.customer_id));

  return sorted.map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    customerName: nameById.get(row.customer_id) ?? null,
    actionType: row.action_type,
    title: row.title,
    reasonKeys: row.reason_keys as PriorityReasonKey[],
    status: row.status as "completed" | "dismissed",
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    dismissedAt: row.dismissed_at,
    dismissedBy: row.dismissed_by,
  }));
}

function logCopilotSyncFailure(event: string, businessId: string, customerId: string): void {
  console.error(JSON.stringify({ event, businessId, customerId, timestamp: new Date().toISOString() }));
}

/**
 * Keeps a `copilot_actions` row in sync when the existing v1 "Mark as
 * handled" flow (`dismissPriorityItem`, copilot_dismissals) fires -- pure
 * addition, does not change that function at all. `computePriority()`
 * only ever proposes one action_type per customer at a time, so there is
 * at most one active row to sync; a customer with none yet (e.g.
 * dismissed before this pass's reconciliation ever ran) is a silent
 * no-op. Best-effort: the v1 dismissal has already succeeded by the time
 * this runs, so a bookkeeping failure here must never surface as an
 * error to the user -- same convention as `recordAuditLogEntry`.
 */
export async function syncCopilotActionOnDismiss(businessId: string, customerId: string, dismissedBy: string): Promise<void> {
  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from("copilot_actions")
      .update({ status: "dismissed", dismissed_at: new Date().toISOString(), dismissed_by: dismissedBy })
      .eq("business_id", businessId)
      .eq("customer_id", customerId)
      .in("status", ["open", "snoozed"]);

    if (error) logCopilotSyncFailure("copilot_action_dismiss_sync_failed", businessId, customerId);
  } catch {
    logCopilotSyncFailure("copilot_action_dismiss_sync_failed", businessId, customerId);
  }
}

/**
 * The undo half of the above, for `undismissPriorityItem()`. Reopens the
 * most recently dismissed action row for this customer so it doesn't
 * stay permanently suppressed once its matching `copilot_dismissals` row
 * is gone. Silent no-op if none exists. Best-effort, same reasoning as
 * `syncCopilotActionOnDismiss()`.
 */
export async function reopenCopilotActionOnUndismiss(businessId: string, customerId: string): Promise<void> {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error: selectError } = await supabase
      .from("copilot_actions")
      .select("id")
      .eq("business_id", businessId)
      .eq("customer_id", customerId)
      .eq("status", "dismissed")
      .order("dismissed_at", { ascending: false })
      .limit(1);

    if (selectError) {
      logCopilotSyncFailure("copilot_action_undismiss_sync_failed", businessId, customerId);
      return;
    }
    if (!data || data.length === 0) return;

    const { error: updateError } = await supabase
      .from("copilot_actions")
      .update({ status: "open", dismissed_at: null, dismissed_by: null })
      .eq("id", data[0].id);

    if (updateError) logCopilotSyncFailure("copilot_action_undismiss_sync_failed", businessId, customerId);
  } catch {
    logCopilotSyncFailure("copilot_action_undismiss_sync_failed", businessId, customerId);
  }
}

/**
 * Auto-completion, called only from a real, unambiguous domain event
 * (a staff reply actually sent, an appointment actually confirmed) --
 * never inferred from a page view or a conversation being opened. Never
 * throws: a Copilot bookkeeping failure must not break the real action
 * that triggered it (the reply/confirmation has already succeeded by the
 * time this runs). Returns the action types that were actually
 * transitioned, so the caller can audit-log only when something
 * genuinely changed rather than on every call.
 */
export async function completeCopilotActionsForEvent(
  businessId: string,
  customerId: string | null,
  actionTypes: CopilotActionType[],
  completedBy: string,
): Promise<CopilotActionType[]> {
  if (!customerId || actionTypes.length === 0) return [];
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("copilot_actions")
      .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: completedBy })
      .eq("business_id", businessId)
      .eq("customer_id", customerId)
      .in("action_type", actionTypes)
      .in("status", ["open", "snoozed"])
      .select("action_type");

    if (error) {
      logCopilotSyncFailure("copilot_action_auto_complete_failed", businessId, customerId);
      return [];
    }
    return (data ?? []).map((row) => row.action_type as CopilotActionType);
  } catch {
    logCopilotSyncFailure("copilot_action_auto_complete_failed", businessId, customerId);
    return [];
  }
}

/**
 * Auto-superseding, called only from a real domain event that makes a
 * recommendation obsolete (an appointment cancelled/declined/already
 * past). Same never-throws contract as `completeCopilotActionsForEvent()`.
 */
export async function supersedeCopilotActionsForEvent(
  businessId: string,
  customerId: string | null,
  actionTypes: CopilotActionType[],
): Promise<CopilotActionType[]> {
  if (!customerId || actionTypes.length === 0) return [];
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("copilot_actions")
      .update({ status: "superseded", superseded_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("customer_id", customerId)
      .in("action_type", actionTypes)
      .in("status", ["open", "snoozed"])
      .select("action_type");

    if (error) {
      logCopilotSyncFailure("copilot_action_auto_supersede_failed", businessId, customerId);
      return [];
    }
    return (data ?? []).map((row) => row.action_type as CopilotActionType);
  } catch {
    logCopilotSyncFailure("copilot_action_auto_supersede_failed", businessId, customerId);
    return [];
  }
}
