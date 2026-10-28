import "server-only";
import { z } from "zod";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";
import { sendEmail } from "@/lib/email-sender";
import { recordSystemAuditLogEntry } from "@/lib/audit-log";
import { buildBillingNoticeEmail } from "@/lib/billing-emails";
import {
  createCreditNoteServiceDeps,
  createInvoiceServiceDeps,
} from "@/lib/invoice-store";
import { issueCreditNoteForRefund, issueInvoiceForPayment } from "@/lib/invoice-service";
import { billingNoticeKey, type BillingNoticeKind } from "@/lib/billing-notices";
import { PLAN_KEYS, type PlanKey } from "@/lib/plans";
import { SUBSCRIPTION_STATUSES } from "@/lib/subscription";
import type {
  BillingSubscriptionPatch,
  BillingSubscriptionRow,
  RazorpayWebhookDeps,
} from "@/lib/razorpay-webhook";

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Every read and write of `public.subscriptions` that happens **without a
 * Clerk session**: the Razorpay webhook and the daily billing sweep. Phase
 * 17b (STATE.md).
 *
 * **Why the service-role client.** `authenticated` has SELECT and nothing
 * else on `subscriptions`, decided deliberately in Phase 17a's migration:
 * every writable column on that table is one a tenant would benefit from
 * editing (`plan_key` -> free Scale, `status` -> active without paying,
 * `current_period_end` -> an endless period). The webhook has no session
 * to use anyway. Same shape as `ai_response_metrics`.
 *
 * **Every query here filters explicitly by `business_id`** (or by
 * `razorpay_subscription_id`, which is unique and resolves to exactly one
 * business). On the service-role path that filter is the *only* tenant
 * boundary there is, not defence in depth on top of RLS -- docs/security.md
 * section 3.
 *
 * The dashboard's own reads go through lib/subscription.ts with the
 * Clerk-session client instead, so a business reading its own plan is
 * still a policy-checked SELECT.
 */

/** Every column the lifecycle reads. Explicit, so a new column is an opt-in. */
const SUBSCRIPTION_COLUMNS =
  "business_id, plan_key, status, trial_started_at, trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, scheduled_plan_key, past_due_since, billing_interval, razorpay_subscription_id, razorpay_customer_id, razorpay_order_id, provider_event_at";

/**
 * Validated on read, for the same reason lib/subscription.ts validates its
 * own narrower row: a `plan_key` or `status` added to the database ahead of
 * the registry must not reach the lifecycle logic as a silent `undefined`.
 * A row this app cannot describe is treated as absent, not guessed at.
 */
const billingRowSchema = z.object({
  business_id: z.string(),
  plan_key: z.enum(PLAN_KEYS),
  status: z.enum(SUBSCRIPTION_STATUSES),
  trial_started_at: z.string().nullable(),
  trial_ends_at: z.string().nullable(),
  current_period_start: z.string().nullable(),
  current_period_end: z.string().nullable(),
  cancel_at_period_end: z.boolean(),
  scheduled_plan_key: z.enum(PLAN_KEYS).nullable(),
  past_due_since: z.string().nullable(),
  billing_interval: z.enum(["monthly", "annual"]).nullable(),
  razorpay_subscription_id: z.string().nullable(),
  razorpay_customer_id: z.string().nullable(),
  razorpay_order_id: z.string().nullable(),
  provider_event_at: z.string().nullable().default(null),
});

function parseRow(data: unknown, context: string): BillingSubscriptionRow | null {
  const parsed = billingRowSchema.safeParse(data);
  if (!parsed.success) {
    logEvent("billing_subscription_row_invalid", "unknown", { context }, "error");
    return null;
  }
  return parsed.data;
}

export async function readBillingSubscription(
  supabase: ServiceClient,
  businessId: string,
): Promise<BillingSubscriptionRow | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    logEvent("billing_subscription_read_failed", businessId, {}, "error");
    return null;
  }
  if (!data) return null;
  return parseRow(data, "readBillingSubscription");
}

export async function findBillingSubscriptionByRazorpayId(
  supabase: ServiceClient,
  razorpaySubscriptionId: string,
): Promise<BillingSubscriptionRow | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("razorpay_subscription_id", razorpaySubscriptionId)
    .maybeSingle();

  if (error) {
    logEvent("billing_subscription_lookup_failed", "unknown", {}, "error");
    return null;
  }
  if (!data) return null;
  return parseRow(data, "findBillingSubscriptionByRazorpayId");
}

/**
 * Applies a patch. Throws on failure, deliberately: this is the write that
 * makes the money and the entitlement agree, and a swallowed error here
 * would leave a paying customer on the wrong plan with nothing to show
 * that it happened. The webhook route turns the throw into a non-2xx so
 * Razorpay retries, which (with the event-id ledger claimed only on the
 * successful path) is exactly the behaviour we want.
 */
export async function updateBillingSubscription(
  supabase: ServiceClient,
  businessId: string,
  patch: BillingSubscriptionPatch,
): Promise<void> {
  const { error } = await supabase.from("subscriptions").update(patch).eq("business_id", businessId);
  if (error) {
    logEvent("billing_subscription_update_failed", businessId, { fields: Object.keys(patch).join(",") }, "error");
    throw new Error(`billing_subscription_update_failed ${error.code ?? "unknown"}`);
  }
}

/** Postgres unique-violation code -- a normal outcome for both claims below. */
const UNIQUE_VIOLATION = "23505";

/**
 * Claims a Razorpay event id in `public.razorpay_webhook_events`.
 *
 * Returns true only if this call created the row, so only the first
 * delivery of a given event id ever does the work. Razorpay retries until
 * it gets a 2xx, and a replayed `subscription.charged` that was not deduped
 * would be a free billing period per retry.
 *
 * **Claim failures other than a duplicate return false**, i.e. the event is
 * not processed. That is the safe direction: an unreadable ledger means we
 * cannot tell whether this event has already been applied, and applying a
 * money-moving event twice is worse than applying it late -- Razorpay will
 * retry, and the route answers non-2xx so that it does.
 */
export async function claimWebhookEvent(
  supabase: ServiceClient,
  eventId: string,
  event: string,
  businessId: string | null,
): Promise<boolean> {
  const { error } = await supabase.from("razorpay_webhook_events").insert({
    event_id: eventId,
    event,
    business_id: businessId,
  });

  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return false;

  logEvent("razorpay_webhook_claim_failed", businessId ?? "unknown", { event }, "error");
  throw new Error(`razorpay_webhook_claim_failed ${error.code ?? "unknown"}`);
}

/**
 * Removes a claim whose work then failed, so Razorpay's retry of that
 * event is a real second chance instead of a duplicate that gets skipped.
 *
 * Without this, claiming before doing the work -- which is what makes a
 * duplicate cheap to detect -- would turn any mid-transition database
 * failure into a permanently unapplied event: marked processed, never
 * actually processed, with nothing to show it. Best-effort, because the
 * caller is already failing and about to return a non-2xx; a release that
 * itself fails is logged and leaves the retry to be deduped, which is the
 * safe direction.
 */
export async function releaseWebhookEvent(supabase: ServiceClient, eventId: string): Promise<void> {
  const { error } = await supabase.from("razorpay_webhook_events").delete().eq("event_id", eventId);
  if (error) {
    logEvent("razorpay_webhook_release_failed", "unknown", { code: error.code ?? "unknown" }, "error");
  }
}

/**
 * Claims one billing notice for one period. Same mechanism and the same
 * reasoning as lib/usage-reminders.ts's `claimThreshold`: the row goes in
 * first and the email is sent only if the claim created it, so a cron that
 * runs twice or a retried webhook cannot mail a customer the same notice
 * repeatedly.
 *
 * Any error other than a duplicate sends nothing -- better one missed
 * notice than the same "your payment failed" email on every retry because
 * the ledger was unreadable.
 */
async function claimBillingNotice(
  supabase: ServiceClient,
  businessId: string,
  kind: BillingNoticeKind,
  periodEndIso: string,
): Promise<boolean> {
  const { error } = await supabase.from("billing_notice_sends").insert({
    business_id: businessId,
    notice_key: billingNoticeKey(kind),
    period_end: periodEndIso,
  });

  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return false;
  logEvent("billing_notice_claim_failed", businessId, { kind }, "error");
  return false;
}

/**
 * Sends one billing notice, at most once per (business, kind, period).
 *
 * Never throws: it is called from webhook handlers and from the daily
 * sweep, both of which have already done the work that matters by the time
 * the email is attempted. A business with no `contact_email` is logged and
 * **skipped without claiming**, so the notice still arrives once it sets
 * one -- the same choice lib/usage-reminders.ts makes.
 */
export async function sendBillingNotice(
  supabase: ServiceClient,
  kind: BillingNoticeKind,
  row: Pick<BillingSubscriptionRow, "business_id" | "billing_interval">,
  context: { periodEndIso: string; planKey: PlanKey },
): Promise<void> {
  const businessId = row.business_id;

  const { data: business, error } = await supabase
    .from("businesses")
    .select("name, contact_email")
    .eq("id", businessId)
    .maybeSingle();

  if (error || !business) {
    logEvent("billing_notice_business_read_failed", businessId, { kind }, "error");
    return;
  }

  if (!business.contact_email) {
    logEvent("billing_notice_skipped_no_contact_email", businessId, { kind });
    return;
  }

  if (!(await claimBillingNotice(supabase, businessId, kind, context.periodEndIso))) return;

  const { subject, email } = buildBillingNoticeEmail(kind, {
    businessName: business.name,
    planKey: context.planKey,
    billingInterval: row.billing_interval,
    periodEndIso: context.periodEndIso,
  });

  const outcome = await sendEmail({ to: business.contact_email, subject, email });

  logEvent(
    outcome === "sent" ? "billing_notice_sent" : `billing_notice_${outcome}`,
    businessId,
    { kind, planKey: context.planKey },
    outcome === "failed" ? "error" : "info",
  );
}

/**
 * Wires the pure webhook state machine (lib/razorpay-webhook.ts) to the
 * real database, the real mailer and the real audit log.
 *
 * The state machine takes its dependencies as an argument specifically so
 * that this is the only place any of that is decided -- and so that
 * scripts/run-razorpay-webhook-tests.mjs can drive the same transitions
 * against an in-memory store, which is how the idempotency test runs
 * without a database.
 *
 * Audit entries record `actor_user_id = 'system:razorpay'`: nobody signed
 * in caused them.
 */
export function createRazorpayWebhookDeps(supabase: ServiceClient): RazorpayWebhookDeps {
  return {
    claimEvent: (eventId, event, businessId) => claimWebhookEvent(supabase, eventId, event, businessId),
    releaseEvent: (eventId) => releaseWebhookEvent(supabase, eventId),
    findSubscriptionByRazorpayId: (id) => findBillingSubscriptionByRazorpayId(supabase, id),
    findSubscriptionByBusinessId: (businessId) => readBillingSubscription(supabase, businessId),
    updateSubscription: (businessId, patch) => updateBillingSubscription(supabase, businessId, patch),
    sendNotice: (kind, row, context) => sendBillingNotice(supabase, kind, row, context),
    recordAudit: (businessId, action, metadata) =>
      // target_id is a uuid column, so the business itself is the target:
      // a subscription has no surrogate id (its primary key IS business_id).
      recordSystemAuditLogEntry(businessId, action, "subscription", businessId, metadata),
    // Phase 17c: the legal record of each payment. The wiring lives in
    // lib/invoice-store.ts; this only hands the webhook the two entry points.
    issueInvoice: (payment) => issueInvoiceForPayment(createInvoiceServiceDeps(supabase), payment),
    issueCreditNote: (refund) => issueCreditNoteForRefund(createCreditNoteServiceDeps(supabase), refund),
    log: logEvent,
  };
}
