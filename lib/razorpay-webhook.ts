import { z } from "zod";
import { PAST_DUE_GRACE_DAYS, PLAN_KEYS, type PlanKey } from "@/lib/plans";
import type { BillingNoticeKind } from "@/lib/billing-notices";
import type { CreditNoteReason, PaymentForInvoice } from "@/lib/invoice-core";
import type { IssueCreditNoteOutcome, IssueInvoiceOutcome } from "@/lib/invoice-service";

/**
 * Razorpay webhook handling: payload parsing, idempotency, and the state
 * machine that maps a verified event onto this app's own subscription
 * row. Phase 17b (STATE.md).
 *
 * **Signature verification is NOT here** -- it is in
 * app/api/webhooks/razorpay/route.ts, which reads the raw body and the
 * `X-Razorpay-Signature` header and refuses anything that does not verify,
 * exactly the shape app/api/webhooks/resend/route.ts already uses. The
 * HMAC itself lives in lib/razorpay-signature.ts. This module only ever
 * sees a body that has already been proved to come from Razorpay.
 *
 * **WEBHOOKS ARE THE SOURCE OF TRUTH for subscription state.** The
 * Checkout callback in the browser is treated as UI: it tells us the
 * customer got through the payment sheet, and it lets the dashboard show
 * the right thing immediately instead of making them refresh. It is not
 * allowed to be the only thing that moves state, because a customer who
 * closes the tab at the wrong moment would then leave us permanently
 * inconsistent with the money. Every transition below is therefore
 * written so that arriving twice, or arriving after the callback already
 * did the same thing, changes nothing the second time.
 *
 * **No `server-only`, and no I/O.** Everything this module needs from the
 * outside world arrives through `RazorpayWebhookDeps`. That is what makes
 * the state machine testable in plain Node with an in-memory store --
 * including the idempotency test that replays the same
 * `subscription.charged` twice and asserts the period moved once
 * (scripts/run-razorpay-webhook-tests.mjs).
 */

/* ------------------------------------------------------------------ *
 * The events this app acts on
 * ------------------------------------------------------------------ */

/**
 * Razorpay sends more event types than these (subscription.authenticated,
 * .updated, .paused, .resumed, payment.authorized, invoice.*, ...).
 * Anything not listed here is acknowledged with a 200 and ignored: a
 * non-2xx tells Razorpay to retry an event this app will never act on,
 * which turns an ignored event into an indefinite retry loop.
 */
export const HANDLED_RAZORPAY_EVENTS = [
  "subscription.activated",
  "subscription.charged",
  "subscription.pending",
  "subscription.halted",
  "subscription.cancelled",
  "subscription.completed",
  "payment.failed",
  "order.paid",
  // Phase 17c: a refund of a taxed invoice needs a credit note.
  "refund.processed",
] as const;

export type HandledRazorpayEvent = (typeof HANDLED_RAZORPAY_EVENTS)[number];

function isHandledEvent(value: string): value is HandledRazorpayEvent {
  return (HANDLED_RAZORPAY_EVENTS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ *
 * Payload schemas
 * ------------------------------------------------------------------ */

/**
 * Deliberately loose about everything this app does not read, and strict
 * about everything it does. Razorpay adds fields over time, and a schema
 * that rejected an unknown field would start failing on a provider-side
 * change that affects nothing here -- on a billing webhook, that means
 * silently falling behind the real state of the money.
 *
 * `notes` values are stringified by Razorpay but can be absent; they are
 * tenant-correlation hints only (see `resolveBusinessId`), never trusted
 * as authorization. A forged note cannot matter, because the body carrying
 * it has already been HMAC-verified as Razorpay's.
 */
const notesSchema = z.record(z.string(), z.unknown()).optional();

const subscriptionEntitySchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  plan_id: z.string().optional(),
  customer_id: z.string().nullable().optional(),
  /** Unix seconds. The period this charge covers -- absolute, not a delta. */
  current_start: z.number().nullable().optional(),
  current_end: z.number().nullable().optional(),
  charge_at: z.number().nullable().optional(),
  paid_count: z.number().optional(),
  remaining_count: z.number().optional(),
  notes: notesSchema,
});

const paymentEntitySchema = z.object({
  id: z.string(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  order_id: z.string().nullable().optional(),
  method: z.string().optional(),
  error_code: z.string().nullable().optional(),
  /** Unix seconds: when the payment was taken. Decides the invoice date and financial year. */
  created_at: z.number().optional(),
  notes: notesSchema,
});

const refundEntitySchema = z.object({
  id: z.string(),
  payment_id: z.string(),
  amount: z.number(),
  currency: z.string().optional(),
  status: z.string().optional(),
  /** Unix seconds. */
  created_at: z.number().optional(),
  notes: notesSchema,
});

const orderEntitySchema = z.object({
  id: z.string(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  notes: notesSchema,
});

const webhookBodySchema = z.object({
  event: z.string(),
  created_at: z.number().optional(),
  payload: z
    .object({
      subscription: z.object({ entity: subscriptionEntitySchema }).optional(),
      payment: z.object({ entity: paymentEntitySchema }).optional(),
      order: z.object({ entity: orderEntitySchema }).optional(),
      refund: z.object({ entity: refundEntitySchema }).optional(),
    })
    .default({}),
});

export type RazorpayWebhookBody = z.infer<typeof webhookBodySchema>;

/** Parses a verified raw body. Null for anything that is not a Razorpay event envelope. */
export function parseRazorpayWebhookBody(rawBody: string): RazorpayWebhookBody | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const parsed = webhookBodySchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/* ------------------------------------------------------------------ *
 * The row this module reads and writes
 * ------------------------------------------------------------------ */

export type BillingSubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled" | "expired";

/** The `public.subscriptions` columns the lifecycle reads. */
export type BillingSubscriptionRow = {
  business_id: string;
  plan_key: PlanKey;
  status: BillingSubscriptionStatus;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  scheduled_plan_key: PlanKey | null;
  past_due_since: string | null;
  billing_interval: "monthly" | "annual" | null;
  razorpay_subscription_id: string | null;
  razorpay_customer_id: string | null;
  razorpay_order_id: string | null;
  /**
   * Provider timestamp of the newest lifecycle event already applied; an
   * older event is not applied. Optional so a row read before the column
   * existed (or a test fixture) behaves as "nothing applied yet".
   */
  provider_event_at?: string | null;
};

/** Only the columns a transition actually changes are ever written. */
export type BillingSubscriptionPatch = Partial<
  Pick<
    BillingSubscriptionRow,
    | "plan_key"
    | "status"
    | "current_period_start"
    | "current_period_end"
    | "cancel_at_period_end"
    | "scheduled_plan_key"
    | "past_due_since"
    | "billing_interval"
    | "razorpay_subscription_id"
    | "razorpay_customer_id"
    | "razorpay_order_id"
    | "provider_event_at"
  >
>;

export type BillingAuditAction =
  | "subscription.activated"
  | "subscription.charged"
  | "subscription.payment_failed"
  | "subscription.grace_lapsed"
  | "subscription.cancellation_scheduled"
  | "subscription.expired"
  | "subscription.plan_changed";

export type RazorpayWebhookDeps = {
  /**
   * Inserts the event id into `public.razorpay_webhook_events`. Returns
   * true only if this call created the row -- i.e. only the first delivery
   * of a given event id ever gets true. A unique violation is a normal
   * outcome, not an error.
   */
  claimEvent(eventId: string, event: string, businessId: string | null): Promise<boolean>;
  /**
   * Deletes a claim that was taken but whose work then failed, so
   * Razorpay's retry is a real second chance rather than a duplicate that
   * gets skipped. See `processRazorpayEvent`.
   */
  releaseEvent(eventId: string): Promise<void>;
  findSubscriptionByRazorpayId(razorpaySubscriptionId: string): Promise<BillingSubscriptionRow | null>;
  findSubscriptionByBusinessId(businessId: string): Promise<BillingSubscriptionRow | null>;
  updateSubscription(businessId: string, patch: BillingSubscriptionPatch): Promise<void>;
  sendNotice(
    kind: BillingNoticeKind,
    row: BillingSubscriptionRow,
    context: { periodEndIso: string; planKey: PlanKey },
  ): Promise<void>;
  recordAudit(
    businessId: string,
    action: BillingAuditAction,
    metadata: Record<string, string | number | boolean | null>,
  ): Promise<void>;
  /**
   * Phase 17c: issues the GST tax invoice a successful payment is owed
   * (lib/invoice-service.ts). Idempotent on the payment id. Resolves for
   * every outcome that retrying cannot improve -- including parking the
   * payment because customer details are missing -- and THROWS only for a
   * transient failure, so the webhook answers non-2xx and Razorpay retries.
   */
  issueInvoice(payment: PaymentForInvoice): Promise<IssueInvoiceOutcome>;
  /** Phase 17c: issues the credit note a processed refund requires. Idempotent on the refund id. */
  issueCreditNote(refund: {
    paymentId: string;
    refundId: string;
    amountPaise: number;
    refundedAt: Date;
    reason: CreditNoteReason;
  }): Promise<IssueCreditNoteOutcome>;
  log(
    event: string,
    businessId: string,
    metadata?: Record<string, string | number | boolean | null>,
    level?: "info" | "error",
  ): void;
};

export type WebhookOutcome =
  /** Acted on. */
  | "processed"
  /** Already seen -- the dedupe ledger refused the claim. */
  | "duplicate"
  /** A verified event type this app does not act on. */
  | "ignored"
  /**
   * Verified and understood, but not applied: it belongs to a mandate this
   * business has since replaced, or it is older than a lifecycle event
   * already applied (Razorpay does not guarantee delivery order).
   */
  | "stale"
  /** Verified, but we could not tell which business it belongs to. */
  | "unresolved";

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function unixToIso(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function noteString(notes: Record<string, unknown> | undefined, key: string): string | null {
  const value = notes?.[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function notePlanKey(notes: Record<string, unknown> | undefined): PlanKey | null {
  const value = noteString(notes, "plan_key");
  return value && (PLAN_KEYS as readonly string[]).includes(value) ? (value as PlanKey) : null;
}

function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Finds the business a subscription event belongs to, **two independent
 * ways**, in this order:
 *
 * 1. Our own `razorpay_subscription_id`, which we stored when we created
 *    the subscription. This is the authoritative link.
 * 2. `notes.business_id`, which we set on the subscription at create time.
 *    This is the fallback for the one case the first cannot cover: the
 *    create call succeeded at Razorpay but our own write of the returned
 *    id did not land (a crash between the two).
 *
 * The note is only ever used to *find* a row, never to grant anything: the
 * row it finds is then the only thing written, and the body carrying the
 * note has already been HMAC-verified as Razorpay's own. A business id in
 * a note from a verified Razorpay body is not client input.
 */
async function resolveSubscriptionRow(
  deps: RazorpayWebhookDeps,
  razorpaySubscriptionId: string,
  notes: Record<string, unknown> | undefined,
): Promise<{ row: BillingSubscriptionRow; matchedBy: "stored_id" | "notes" } | null> {
  const byId = await deps.findSubscriptionByRazorpayId(razorpaySubscriptionId);
  if (byId) return { row: byId, matchedBy: "stored_id" };

  const businessId = noteString(notes, "business_id");
  if (!businessId) return null;

  const byNote = await deps.findSubscriptionByBusinessId(businessId);
  return byNote ? { row: byNote, matchedBy: "notes" } : null;
}

/* ------------------------------------------------------------------ *
 * The entry point
 * ------------------------------------------------------------------ */

/**
 * Handles one verified Razorpay event.
 *
 * Idempotency is enforced **before** any state change, by claiming the
 * event id in `public.razorpay_webhook_events`. Razorpay retries until it
 * receives a 2xx, so without this a replayed `subscription.charged` would
 * move the billing period forward a second time -- a free month per retry.
 *
 * There is a second, independent layer underneath it, and it is the one
 * that matters most: every transition **assigns absolute values Razorpay
 * sent** (`current_start` / `current_end`) rather than incrementing our
 * own. Applying the same charge event twice would therefore write the same
 * period twice even if the ledger were bypassed entirely. The ledger stops
 * duplicate *emails and audit rows*; the absolute assignment is what makes
 * the money correct.
 *
 * **A claim whose work then fails is released**, and that detail is not
 * incidental. Claiming before doing the work is what makes a duplicate
 * free to detect, but it also means a crash halfway through would
 * otherwise leave the event marked processed and the retry skipped -- the
 * state would never land, silently. So a thrown write releases the claim
 * and re-throws: the route answers non-2xx, Razorpay retries, and the
 * retry finds no claim.
 *
 * Resolves to an outcome for every provider-shaped problem, so the route
 * can answer 200 and stop the retries for anything verified. It throws
 * only for *our* failures (a database write), which is precisely the case
 * where a retry is worth having.
 */
export async function processRazorpayEvent(
  deps: RazorpayWebhookDeps,
  body: RazorpayWebhookBody,
  eventId: string,
  now: Date = new Date(),
): Promise<WebhookOutcome> {
  if (!isHandledEvent(body.event)) {
    deps.log("razorpay_webhook_ignored_event", "unknown", { event: body.event.slice(0, 64) });
    return "ignored";
  }

  const event: HandledRazorpayEvent = body.event;

  // `order.paid` and `payment.failed` carry no subscription entity, so the
  // business is resolved from the order/payment notes instead.
  const subscriptionEntity = body.payload.subscription?.entity ?? null;
  const resolved = subscriptionEntity
    ? await resolveSubscriptionRow(deps, subscriptionEntity.id, subscriptionEntity.notes)
    : null;

  const orderNotes = body.payload.order?.entity.notes ?? body.payload.payment?.entity.notes;
  const businessIdFromNotes = noteString(orderNotes, "business_id");
  const businessId = resolved?.row.business_id ?? businessIdFromNotes ?? null;

  // The claim happens here, after resolution, so the dedupe row can carry
  // the business it belongs to -- but before any write, so a duplicate can
  // never reach one.
  const claimed = await deps.claimEvent(eventId, event, businessId);
  if (!claimed) {
    deps.log("razorpay_webhook_duplicate", businessId ?? "unknown", { event });
    return "duplicate";
  }

  try {
    return await dispatch(deps, event, body, resolved, businessId, now);
  } catch (error) {
    await deps.releaseEvent(eventId);
    throw error;
  }
}

/**
 * The per-event work, split out so `processRazorpayEvent` can release the
 * event claim around all of it in one place rather than at every throw
 * site.
 */
async function dispatch(
  deps: RazorpayWebhookDeps,
  event: HandledRazorpayEvent,
  body: RazorpayWebhookBody,
  resolved: { row: BillingSubscriptionRow; matchedBy: "stored_id" | "notes" } | null,
  businessId: string | null,
  now: Date,
): Promise<WebhookOutcome> {
  const subscriptionEntity = body.payload.subscription?.entity ?? null;

  if (event === "payment.failed") {
    // Deliberately changes NO subscription state.
    //
    // For a subscription, the authoritative failure signal is
    // `subscription.pending`, which is what starts the grace period;
    // acting on payment.failed as well would start the grace twice and
    // double the emails. For a one-time order (the annual plan, or a
    // pro-rata upgrade charge), a failed payment means the purchase simply
    // did not happen -- there is nothing to downgrade, because nothing was
    // ever upgraded. Logged, because a run of these is a real signal about
    // a customer who cannot pay.
    deps.log(
      "razorpay_payment_failed",
      businessId ?? "unknown",
      {
        paymentId: body.payload.payment?.entity.id ?? null,
        errorCode: body.payload.payment?.entity.error_code ?? null,
        method: body.payload.payment?.entity.method ?? null,
      },
      "error",
    );
    return businessId ? "processed" : "unresolved";
  }

  if (event === "order.paid") {
    return handleOrderPaid(deps, body, now);
  }

  if (event === "refund.processed") {
    return handleRefundProcessed(deps, body, now);
  }

  if (!subscriptionEntity) {
    deps.log("razorpay_webhook_missing_subscription_entity", businessId ?? "unknown", { event }, "error");
    return "unresolved";
  }

  if (!resolved) {
    // Verified as Razorpay's, but belongs to no row here. The most likely
    // cause is a subscription created against these keys by something
    // other than this app (a dashboard experiment, another environment
    // sharing the test account). Logged at error level and acknowledged:
    // retrying will not make a row appear.
    deps.log(
      "razorpay_webhook_unresolved_subscription",
      "unknown",
      { event, razorpaySubscriptionId: subscriptionEntity.id },
      "error",
    );
    return "unresolved";
  }

  const { row, matchedBy } = resolved;

  // A mandate this business has since replaced (a re-authorised card, an
  // abandoned checkout) resolves here only through the `notes` fallback. Its
  // wind-down events -- we cancel the old mandate ourselves when a new one is
  // started -- must not touch the current subscription: a late
  // `subscription.cancelled` for the OLD id would otherwise cancel a business
  // that has just paid on the NEW one, and the repair below would overwrite
  // the stored id with the dead one. Only events that REMOVE access are
  // refused; `activated`/`charged` still adopt the id, so money that moved is
  // never ignored.
  if (
    matchedBy === "notes" &&
    row.razorpay_subscription_id !== null &&
    row.razorpay_subscription_id !== subscriptionEntity.id &&
    REMOVES_ACCESS_EVENTS.has(event)
  ) {
    deps.log("razorpay_webhook_superseded_mandate", row.business_id, { event }, "error");
    return "stale";
  }

  // Ordering: Razorpay does not guarantee delivery order, so an event older
  // than the newest one already applied must not overwrite newer state (a late
  // `pending` after the `charged` that recovered the payment, an older
  // `charged` moving the period backwards). Equal timestamps apply: the clock
  // is whole seconds and the writes are absolute, so re-applying is harmless.
  const eventAtIso = unixToIso(body.created_at);
  const appliedAtMs = row.provider_event_at ? Date.parse(row.provider_event_at) : null;
  const stale = eventAtIso !== null && appliedAtMs !== null && Date.parse(eventAtIso) < appliedAtMs;
  if (stale) {
    deps.log("razorpay_webhook_out_of_order", row.business_id, { event }, "error");
  }

  const outcome = await applySubscriptionEvent(deps, event, row, matchedBy, subscriptionEntity, body, now, stale);

  // Advance the high-water mark only after the transition itself succeeded; a
  // throw above releases the event claim and the retry re-applies it.
  if (outcome === "processed" && eventAtIso !== null && !stale) {
    await deps.updateSubscription(row.business_id, { provider_event_at: eventAtIso });
  }
  return outcome;
}

/** Events that take access away; refused when they belong to a replaced mandate. */
const REMOVES_ACCESS_EVENTS: ReadonlySet<HandledRazorpayEvent> = new Set<HandledRazorpayEvent>([
  "subscription.pending",
  "subscription.halted",
  "subscription.cancelled",
  "subscription.completed",
]);

async function applySubscriptionEvent(
  deps: RazorpayWebhookDeps,
  event: HandledRazorpayEvent,
  row: BillingSubscriptionRow,
  matchedBy: "stored_id" | "notes",
  subscriptionEntity: SubscriptionEntity,
  body: RazorpayWebhookBody,
  now: Date,
  stale: boolean,
): Promise<WebhookOutcome> {
  // An out-of-order `charged` is the one stale event with a side effect that
  // is still owed: the money moved, so its GST invoice must exist (idempotent
  // on the payment id). No state is written.
  if (stale) {
    if (event === "subscription.charged") {
      const period = periodFrom(subscriptionEntity);
      if (period) {
        await issueInvoiceFor(deps, row.business_id, {
          payment: body.payload.payment?.entity,
          eventCreatedAt: body.created_at,
          now,
          purpose: "subscription_charge",
          planKey: row.plan_key,
          period,
          orderId: null,
          subscriptionId: subscriptionEntity.id,
        });
      }
    }
    return "stale";
  }

  if (matchedBy === "notes") {
    // Worth knowing about: it means our stored id is missing, so the
    // primary correlation path is broken for this tenant.
    deps.log("razorpay_webhook_matched_by_notes", row.business_id, { event }, "error");
    // Repair it while we are here, so the next event matches on the id.
    await deps.updateSubscription(row.business_id, {
      razorpay_subscription_id: subscriptionEntity.id,
    });
  }

  switch (event) {
    case "subscription.activated":
      return handleActivated(deps, row, subscriptionEntity, now);
    case "subscription.charged":
      return handleCharged(deps, row, subscriptionEntity, body, now);
    case "subscription.pending":
      return handlePending(deps, row, now);
    case "subscription.halted":
      return handleHalted(deps, row, now);
    case "subscription.cancelled":
      return handleCancelled(deps, row, now);
    case "subscription.completed":
      return handleCompleted(deps, row, now);
    default:
      // Payment/order/refund events never reach here (dispatch handles them
      // before a subscription row is resolved).
      return "ignored";
  }
}

/* ------------------------------------------------------------------ *
 * Transitions
 * ------------------------------------------------------------------ */

type SubscriptionEntity = z.infer<typeof subscriptionEntitySchema>;

/**
 * The period Razorpay says this subscription is in, or null when it has
 * not started one yet.
 *
 * Null is a real case and not an error: a subscription whose `start_at` is
 * in the future (ours always is -- the first charge lands at trial end) is
 * `authenticated` with no current period at all. Writing `status =
 * 'active'` with no period would violate
 * `subscriptions_period_dates_present`, and more importantly it would make
 * the quota period uncountable, so the transition below declines to move
 * the row rather than writing a half-state.
 */
/**
 * `{ status: 'cancelled' }`, except on a row that has no billing period
 * yet -- where it is `{}`, leaving the row `trialing`.
 *
 * `subscriptions_period_dates_present` refuses any non-trialing status
 * without `current_period_start`/`current_period_end`, so a mandate
 * cancelled or completed before it ever charged cannot be written as
 * `cancelled`. Returning an empty patch fragment instead of forcing it is
 * what keeps a webhook from retrying an impossible write forever -- and it
 * is also the truthful state: the trial is still running, it just will not
 * convert now. The daily sweep expires it on its own end date.
 */
function terminalStatusFor(row: BillingSubscriptionRow): { status?: "cancelled" } {
  const hasPeriod = row.current_period_start !== null && row.current_period_end !== null;
  return hasPeriod ? { status: "cancelled" } : {};
}

function periodFrom(entity: SubscriptionEntity): { start: string; end: string } | null {
  const start = unixToIso(entity.current_start);
  const end = unixToIso(entity.current_end);
  return start && end ? { start, end } : null;
}

/**
 * `subscription.activated`: the subscription became active, either from
 * its first charge or by recovering from `pending`/`halted`.
 *
 * Also the moment a trialing row converts to a paid one. The write-once
 * trial trigger freezes `trial_started_at` only, exactly so this is
 * possible (asserted in supabase/tests/database/048).
 */
async function handleActivated(
  deps: RazorpayWebhookDeps,
  row: BillingSubscriptionRow,
  entity: SubscriptionEntity,
  now: Date,
): Promise<WebhookOutcome> {
  const period = periodFrom(entity);
  if (!period) {
    deps.log("razorpay_subscription_activated_without_period", row.business_id, {
      razorpaySubscriptionId: entity.id,
      status: entity.status ?? null,
    });
    // Nothing to write that would be true. The charge event that follows
    // carries the period, and that is what moves the row.
    return "processed";
  }

  const recovering = row.status === "past_due" || row.status === "expired";

  await deps.updateSubscription(row.business_id, {
    status: "active",
    current_period_start: period.start,
    current_period_end: period.end,
    past_due_since: null,
    billing_interval: "monthly",
    razorpay_subscription_id: entity.id,
    ...(entity.customer_id ? { razorpay_customer_id: entity.customer_id } : {}),
  });

  await deps.recordAudit(row.business_id, "subscription.activated", {
    planKey: row.plan_key,
    previousStatus: row.status,
    periodEnd: period.end,
  });

  await deps.sendNotice(recovering ? "payment_recovered" : "subscription_active", row, {
    periodEndIso: period.end,
    planKey: row.plan_key,
  });

  deps.log("razorpay_subscription_activated", row.business_id, {
    planKey: row.plan_key,
    previousStatus: row.status,
    recovering,
  });
  void now;
  return "processed";
}

/**
 * `subscription.charged`: a recurring charge succeeded.
 *
 * **The period is assigned, never incremented.** `current_start` and
 * `current_end` come from Razorpay as absolute timestamps for the period
 * the charge covers, so applying this event twice writes the same two
 * values twice. That is the structural half of the idempotency guarantee
 * -- the event-id ledger is the other half, and it is what keeps the email
 * and the audit row from being duplicated.
 *
 * **A scheduled downgrade is applied here**, because a period boundary is
 * precisely when a deferred plan change becomes true: the customer has now
 * paid for the next period, and what they paid for is the new plan. The
 * entitlement (quota and channels) therefore steps down exactly when the
 * fresh period starts, with the reply count starting from zero -- so a
 * downgrade can never leave a business over its new plan's quota
 * mid-period.
 */
async function handleCharged(
  deps: RazorpayWebhookDeps,
  row: BillingSubscriptionRow,
  entity: SubscriptionEntity,
  body: RazorpayWebhookBody,
  now: Date,
): Promise<WebhookOutcome> {
  const period = periodFrom(entity);
  if (!period) {
    deps.log(
      "razorpay_subscription_charged_without_period",
      row.business_id,
      { razorpaySubscriptionId: entity.id },
      "error",
    );
    return "processed";
  }

  const appliedPlanKey = row.scheduled_plan_key ?? row.plan_key;
  const planChanged = appliedPlanKey !== row.plan_key;
  const recovering = row.status === "past_due" || row.status === "expired";

  await deps.updateSubscription(row.business_id, {
    status: "active",
    plan_key: appliedPlanKey,
    scheduled_plan_key: null,
    current_period_start: period.start,
    current_period_end: period.end,
    past_due_since: null,
    billing_interval: "monthly",
    razorpay_subscription_id: entity.id,
    ...(entity.customer_id ? { razorpay_customer_id: entity.customer_id } : {}),
  });

  await deps.recordAudit(row.business_id, "subscription.charged", {
    planKey: appliedPlanKey,
    previousPlanKey: row.plan_key,
    paidCount: entity.paid_count ?? null,
    periodEnd: period.end,
  });

  if (planChanged) {
    await deps.recordAudit(row.business_id, "subscription.plan_changed", {
      planKey: appliedPlanKey,
      previousPlanKey: row.plan_key,
      trigger: "scheduled_downgrade_applied",
    });
  }

  // A receipt on every single monthly charge is mail nobody asked for: the
  // GST invoice issued at the end of this handler is the document that
  // arrives for each one. Only the two charges a business genuinely needs
  // told about are mailed here: the first one (the trial converting to a
  // paid plan) and a recovery after a failure, where the business is waiting
  // to hear that its AI is back on.
  if (row.status === "trialing") {
    await deps.sendNotice("subscription_active", row, { periodEndIso: period.end, planKey: appliedPlanKey });
  } else if (recovering) {
    await deps.sendNotice("payment_recovered", row, { periodEndIso: period.end, planKey: appliedPlanKey });
  }

  deps.log("razorpay_subscription_charged", row.business_id, {
    planKey: appliedPlanKey,
    previousStatus: row.status,
    planChanged,
    periodEnd: period.end,
  });

  // LAST, on purpose. The money has moved and the row says so; only now is
  // the legal record of it written (Phase 17c: one GST tax invoice per
  // successful charge, for the amount actually collected). It is the one
  // step here that can THROW on a transient failure -- which makes Razorpay
  // retry, and on that retry this row is already `active`, so a notice
  // placed after it would never be sent. Everything that must happen
  // exactly once is therefore done before it.
  await issueInvoiceFor(deps, row.business_id, {
    payment: body.payload.payment?.entity,
    eventCreatedAt: body.created_at,
    now,
    purpose: "subscription_charge",
    planKey: appliedPlanKey,
    period,
    orderId: null,
    subscriptionId: entity.id,
  });
  return "processed";
}

/**
 * `subscription.pending`: a charge failed and Razorpay is retrying. The
 * start of the confirmed 5-day grace period.
 *
 * **`past_due_since` is set only once.** Razorpay fires this event again
 * on every failed retry, and re-stamping it each time would restart the
 * 5-day clock on every retry -- a customer whose card never works would
 * then serve indefinitely. Anchored to the first failure instead.
 *
 * Access is **unchanged** during grace: full quota, AI still replying.
 * That is the point of a grace period. A failed card is a billing problem
 * worth absorbing for a few days; switching off a prospect-facing widget
 * on a customer's live website the hour a renewal fails is not a
 * proportionate response, and it punishes the prospect rather than the
 * customer.
 */
async function handlePending(
  deps: RazorpayWebhookDeps,
  row: BillingSubscriptionRow,
  now: Date,
): Promise<WebhookOutcome> {
  const pastDueSince = row.past_due_since ?? now.toISOString();
  const graceEnds = addDaysIso(pastDueSince, PAST_DUE_GRACE_DAYS);

  await deps.updateSubscription(row.business_id, {
    status: "past_due",
    past_due_since: pastDueSince,
  });

  await deps.recordAudit(row.business_id, "subscription.payment_failed", {
    planKey: row.plan_key,
    pastDueSince,
    graceEnds,
  });

  await deps.sendNotice("payment_failed", row, {
    // Keyed on the grace deadline, so the warning is claimed once per
    // failure episode rather than once per retry.
    periodEndIso: graceEnds,
    planKey: row.plan_key,
  });

  deps.log("razorpay_subscription_pending", row.business_id, {
    planKey: row.plan_key,
    pastDueSince,
    graceEnds,
    firstFailure: row.past_due_since === null,
  }, "error");
  return "processed";
}

/**
 * `subscription.halted`: Razorpay exhausted its retries.
 *
 * This is the end of the road for the payment, so the row moves to the
 * restricted state. **That is not a hard shutdown**: `expired` makes
 * `lib/subscription.ts` report `serving: false`, and the chat path treats
 * that exactly as an exhausted quota -- the prospect is told a person will
 * follow up, the conversation is flagged `needs_attention`, and the widget
 * keeps working. Nothing on a customer's website breaks and nothing is
 * invented (lib/rag.ts's `USAGE_QUOTA_EXCEEDED_MESSAGE`). The business is
 * emailed, because it is the party that can fix this.
 */
async function handleHalted(
  deps: RazorpayWebhookDeps,
  row: BillingSubscriptionRow,
  now: Date,
): Promise<WebhookOutcome> {
  await deps.updateSubscription(row.business_id, { status: "expired" });

  await deps.recordAudit(row.business_id, "subscription.grace_lapsed", {
    planKey: row.plan_key,
    trigger: "razorpay_halted",
    pastDueSince: row.past_due_since,
  });

  await deps.sendNotice("grace_lapsed", row, {
    periodEndIso: row.past_due_since ?? now.toISOString(),
    planKey: row.plan_key,
  });

  deps.log("razorpay_subscription_halted", row.business_id, { planKey: row.plan_key }, "error");
  return "processed";
}

/**
 * `subscription.cancelled`: the mandate is cancelled, by the customer in
 * our dashboard or by anyone in the Razorpay dashboard.
 *
 * The row becomes `cancelled`, which `lib/subscription.ts` keeps serving
 * until `current_period_end` and then stops -- the confirmed decision, and
 * the only treatment consistent with /refunds: fees already paid are not
 * refunded, so access to the period they paid for cannot be taken away.
 */
async function handleCancelled(
  deps: RazorpayWebhookDeps,
  row: BillingSubscriptionRow,
  now: Date,
): Promise<WebhookOutcome> {
  await deps.updateSubscription(row.business_id, {
    // A mandate cancelled before it ever charged belongs to a row that is
    // still `trialing` and so has no billing period at all. Writing
    // `cancelled` there would violate `subscriptions_period_dates_present`
    // -- the update would throw, the route would answer 500, and Razorpay
    // would retry the same impossible write forever. The trial keeps its
    // own end date and the daily sweep expires it on that date, which is
    // also the honest outcome: a cancelled trial still has its trial.
    ...terminalStatusFor(row),
    cancel_at_period_end: true,
    // A plan change that was waiting for the next period will never get
    // one. Left set, a later event would apply it to a subscription that
    // no longer exists.
    scheduled_plan_key: null,
  });

  const periodEnd = row.current_period_end ?? row.trial_ends_at ?? now.toISOString();

  await deps.recordAudit(row.business_id, "subscription.cancellation_scheduled", {
    planKey: row.plan_key,
    accessUntil: periodEnd,
  });

  await deps.sendNotice("subscription_cancelled", row, { periodEndIso: periodEnd, planKey: row.plan_key });

  deps.log("razorpay_subscription_cancelled", row.business_id, { planKey: row.plan_key, accessUntil: periodEnd });
  return "processed";
}

/**
 * `subscription.completed`: every billing cycle in `total_count` has been
 * charged (SUBSCRIPTION_TOTAL_COUNT, ten years of monthly charges).
 *
 * Handled rather than ignored precisely because the alternative is the
 * silent failure that constant's comment warns about: a subscription that
 * simply stops producing revenue with a customer still using the product.
 * Treated like a cancellation -- the final period is paid for, so access
 * runs to its end -- and the business is emailed to re-subscribe.
 */
async function handleCompleted(
  deps: RazorpayWebhookDeps,
  row: BillingSubscriptionRow,
  now: Date,
): Promise<WebhookOutcome> {
  await deps.updateSubscription(row.business_id, {
    ...terminalStatusFor(row),
    cancel_at_period_end: true,
    scheduled_plan_key: null,
  });

  const periodEnd = row.current_period_end ?? row.trial_ends_at ?? now.toISOString();

  await deps.recordAudit(row.business_id, "subscription.expired", {
    planKey: row.plan_key,
    trigger: "razorpay_completed",
    accessUntil: periodEnd,
  });

  await deps.sendNotice("subscription_completed", row, { periodEndIso: periodEnd, planKey: row.plan_key });

  deps.log("razorpay_subscription_completed", row.business_id, { planKey: row.plan_key }, "error");
  return "processed";
}

/**
 * `order.paid`: a one-time payment landed -- the annual plan, or the
 * pro-rated difference for a mid-period upgrade.
 *
 * This is the **webhook half** of the annual path, and it does the same
 * work as the Checkout callback does (`activateFromPaidOrder` in
 * lib/billing-store.ts calls into the same function). Whichever arrives
 * first wins and the other is a no-op, which is exactly the property the
 * "webhooks are the source of truth, the callback is UI" rule needs: a
 * customer who closes the tab before the callback fires still ends up
 * active.
 *
 * `purpose` and `plan_key` come from the order's own notes, which we set
 * when we created it. The *amount* is never read from here: it is always
 * re-derived from `lib/plans.ts` when the order is created, so there is no
 * path by which a payment of the wrong size could grant the wrong plan.
 */
async function handleOrderPaid(
  deps: RazorpayWebhookDeps,
  body: RazorpayWebhookBody,
  now: Date,
): Promise<WebhookOutcome> {
  const order = body.payload.order?.entity;
  if (!order) {
    deps.log("razorpay_order_paid_without_order_entity", "unknown", {}, "error");
    return "unresolved";
  }

  const businessId = noteString(order.notes, "business_id");
  const purpose = noteString(order.notes, "purpose");
  const planKey = notePlanKey(order.notes);

  if (!businessId || !planKey || (purpose !== "annual" && purpose !== "upgrade_prorata")) {
    deps.log(
      "razorpay_order_paid_unrecognised",
      businessId ?? "unknown",
      { orderId: order.id, purpose: purpose ?? null },
      "error",
    );
    return "unresolved";
  }

  const row = await deps.findSubscriptionByBusinessId(businessId);
  if (!row) {
    deps.log("razorpay_order_paid_no_subscription_row", businessId, { orderId: order.id }, "error");
    return "unresolved";
  }

  const invoiceBase = {
    payment: body.payload.payment?.entity,
    eventCreatedAt: body.created_at,
    now,
    purpose,
    planKey,
    orderId: order.id,
    subscriptionId: null,
    orderAmountPaise: order.amount,
  } as const;

  // Already applied -- by the Checkout callback, or by an earlier delivery
  // of a different event carrying the same order. Not an error, and NOT the
  // end of the road: the callback only ever moves the plan, so the invoice
  // for this payment may still be owed. It is issued here, idempotently on
  // the payment id, whichever of the two paths applied the plan first.
  if (row.razorpay_order_id === order.id && row.plan_key === planKey && row.status === "active") {
    deps.log("razorpay_order_paid_already_applied", businessId, { orderId: order.id });
    await issueInvoiceFor(deps, businessId, {
      ...invoiceBase,
      period:
        row.current_period_start && row.current_period_end
          ? { start: row.current_period_start, end: row.current_period_end }
          : null,
    });
    return "processed";
  }

  if (purpose === "annual") {
    const period = annualPeriodFrom(now);
    await deps.updateSubscription(businessId, annualActivationPatch(planKey, order.id, now));
    await deps.recordAudit(businessId, "subscription.activated", {
      planKey,
      billingInterval: "annual",
      periodEnd: period.end,
      orderId: order.id,
    });
    await deps.sendNotice("subscription_active", row, { periodEndIso: period.end, planKey });
    deps.log("razorpay_annual_order_applied", businessId, { planKey, periodEnd: period.end });
    // Last: the only step that can throw on a transient failure (see
    // handleCharged), so everything that must happen once is done first.
    await issueInvoiceFor(deps, businessId, { ...invoiceBase, period });
    return "processed";
  }

  // An upgrade's pro-rata order: the period is untouched (the customer is
  // paying for the remainder of the period they already have), only the
  // plan moves, and it moves immediately.
  await deps.updateSubscription(businessId, prorataActivationPatch(planKey, order.id));
  await deps.recordAudit(businessId, "subscription.plan_changed", {
    planKey,
    previousPlanKey: row.plan_key,
    trigger: "prorata_upgrade_paid",
    orderId: order.id,
  });
  deps.log("razorpay_prorata_upgrade_applied", businessId, { planKey, previousPlanKey: row.plan_key });
  await issueInvoiceFor(deps, businessId, {
    ...invoiceBase,
    period:
      row.current_period_start && row.current_period_end
        ? { start: row.current_period_start, end: row.current_period_end }
        : null,
  });
  return "processed";
}

/**
 * Issues the invoice for one payment, from the `payment` entity of the
 * event -- **the amount actually collected, never the plan's list price.**
 * A pro-rated upgrade charges a sum that is no plan's price, and an invoice
 * stating the list price when a different amount was taken would be wrong.
 *
 * A payment entity with no usable amount cannot be invoiced and is logged
 * at error level (it reaches Sentry) rather than guessed at; the state
 * change that triggered this has already been applied and is not undone.
 * A payment that is present but not `captured` is not a payment yet and
 * gets no invoice.
 */
async function issueInvoiceFor(
  deps: RazorpayWebhookDeps,
  businessId: string,
  input: {
    payment: z.infer<typeof paymentEntitySchema> | undefined;
    eventCreatedAt: number | undefined;
    now: Date;
    purpose: PaymentForInvoice["purpose"];
    planKey: PlanKey;
    period: { start: string; end: string } | null;
    orderId: string | null;
    subscriptionId: string | null;
    orderAmountPaise?: number;
  },
): Promise<void> {
  const payment = input.payment;
  if (!payment || typeof payment.amount !== "number") {
    deps.log(
      "razorpay_payment_without_amount_no_invoice",
      businessId,
      { purpose: input.purpose, paymentId: payment?.id ?? null },
      "error",
    );
    return;
  }
  if (payment.status !== undefined && payment.status !== "captured") {
    deps.log("razorpay_payment_not_captured_no_invoice", businessId, {
      paymentId: payment.id,
      status: payment.status,
    });
    return;
  }
  if (input.orderAmountPaise !== undefined && input.orderAmountPaise !== payment.amount) {
    // Invoice what was actually collected, and say so loudly.
    deps.log(
      "razorpay_payment_differs_from_order",
      businessId,
      { paymentId: payment.id, paidPaise: payment.amount, orderPaise: input.orderAmountPaise },
      "error",
    );
  }

  const paidAtSeconds = payment.created_at ?? input.eventCreatedAt;
  const paidAt = paidAtSeconds ? new Date(paidAtSeconds * 1000) : input.now;

  await deps.issueInvoice({
    businessId,
    paymentId: payment.id,
    orderId: input.orderId ?? payment.order_id ?? null,
    subscriptionId: input.subscriptionId,
    amountPaise: payment.amount,
    currency: payment.currency ?? "INR",
    paidAt,
    purpose: input.purpose,
    planKey: input.planKey,
    period: input.period,
  });
}

/**
 * `refund.processed`: money went back to the customer, so the tax invoice
 * it was taken against needs a credit note. Idempotent on the refund id,
 * so the manual script (scripts/issue-credit-note.mjs), this webhook and a
 * refund made by hand in the Razorpay dashboard can all arrive for the same
 * refund and produce one note.
 *
 * A refund for a payment this app never invoiced -- the small
 * authentication charge Razorpay refunds itself, or a payment from before
 * invoicing existed -- has no invoice to credit and is acknowledged
 * quietly. A refund that would take the credit notes past the invoice is
 * refused by the service and logged at error level; retrying cannot fix it,
 * so it is acknowledged rather than retried.
 */
async function handleRefundProcessed(
  deps: RazorpayWebhookDeps,
  body: RazorpayWebhookBody,
  now: Date,
): Promise<WebhookOutcome> {
  const refund = body.payload.refund?.entity;
  if (!refund) {
    deps.log("razorpay_refund_event_without_refund_entity", "unknown", {}, "error");
    return "unresolved";
  }

  const reason = noteString(refund.notes, "credit_note_reason");
  const outcome = await deps.issueCreditNote({
    paymentId: refund.payment_id,
    refundId: refund.id,
    amountPaise: refund.amount,
    refundedAt: refund.created_at ? new Date(refund.created_at * 1000) : now,
    reason: isCreditNoteReasonValue(reason) ? reason : "other",
  });

  deps.log("razorpay_refund_processed", "unknown", {
    refundId: refund.id,
    paymentId: refund.payment_id,
    outcome: outcome.status,
  });
  return "processed";
}

function isCreditNoteReasonValue(value: string | null): value is CreditNoteReason {
  return (
    value === "duplicate_or_incorrect_charge" ||
    value === "charge_after_cancellation" ||
    value === "sustained_outage" ||
    value === "other"
  );
}

/**
 * One year from `now`, as the annual billing period.
 *
 * Calendar arithmetic, not 365 days: a customer who pays on 29 February
 * renews on 28 February (the Date constructor normalises it), and a leap
 * year does not quietly give anyone a free day of service or charge them
 * for one they did not get.
 */
export function annualPeriodFrom(now: Date): { start: string; end: string } {
  const end = new Date(now.getTime());
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  return { start: now.toISOString(), end: end.toISOString() };
}

/**
 * The one definition of what a paid annual order does to a subscription
 * row.
 *
 * Exported because **two paths apply it**: this module's `order.paid`
 * webhook handler, and the Checkout callback in lib/billing-checkout.ts.
 * Whichever arrives first wins and the other is a no-op -- which is the
 * property that lets the callback be treated as UI (a customer who closes
 * the tab still ends up active) without the two drifting apart. Sharing
 * the patch rather than writing it twice is what guarantees they cannot.
 */
export function annualActivationPatch(
  planKey: PlanKey,
  orderId: string,
  now: Date,
): BillingSubscriptionPatch {
  const period = annualPeriodFrom(now);
  return {
    status: "active",
    plan_key: planKey,
    billing_interval: "annual",
    current_period_start: period.start,
    current_period_end: period.end,
    past_due_since: null,
    scheduled_plan_key: null,
    cancel_at_period_end: false,
    razorpay_order_id: orderId,
    // An annual plan is an order, not a mandate. A subscription id left
    // over from a previous monthly term would otherwise let a later
    // subscription webhook write this row.
    razorpay_subscription_id: null,
  };
}

/**
 * The one definition of what a paid pro-rata upgrade order does: the plan
 * moves immediately and the billing period is untouched, because the
 * customer has just paid for the remainder of the period they already
 * had. Shared by the webhook and the Checkout callback for the same reason
 * as `annualActivationPatch`.
 */
export function prorataActivationPatch(planKey: PlanKey, orderId: string): BillingSubscriptionPatch {
  return { plan_key: planKey, scheduled_plan_key: null, razorpay_order_id: orderId };
}
