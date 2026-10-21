/**
 * The billing lifecycle emails, as a closed set of kinds plus the key each
 * one is claimed under in `public.billing_notice_sends`. Phase 17b
 * (STATE.md).
 *
 * Why this is its own module. The kinds are referenced by the webhook
 * state machine (lib/razorpay-webhook.ts, pure, unit-tested in plain
 * Node), by the daily sweep (lib/billing-lifecycle.ts) and by the email
 * bodies (lib/billing-emails.ts, which pulls in the `server-only`
 * template). Putting the union here keeps the pure modules pure.
 *
 * **At most once per period is a database guarantee**, the same mechanism
 * `lib/usage-reminders.ts` uses for quota emails: the row is claimed first
 * and the email is sent only if the claim created it. The claim key is
 * `(business_id, notice_key, period_end)`, so the ledger resets itself
 * every period with no sweeper job -- a new period is new key space.
 */

export const BILLING_NOTICE_KINDS = [
  /** The first successful charge: the trial has converted to a paid plan. */
  "subscription_active",
  /** A renewal charge failed. The 5-day grace period has started. */
  "payment_failed",
  /** A retry (or a new card) worked. The AI is back on. */
  "payment_recovered",
  /** Grace ran out, or Razorpay exhausted its retries. The AI has stopped. */
  "grace_lapsed",
  /** Cancelled, with access running to the end of the paid period. */
  "subscription_cancelled",
  /** Every billing cycle in the mandate was charged. Re-subscribe to continue. */
  "subscription_completed",
  /** An annual term is ending and will not renew itself. Sent twice, 14 and 3 days out. */
  "annual_renewal_14d",
  "annual_renewal_3d",
  /** The 14-day trial is ending and no payment method was ever authorised. */
  "trial_ending_3d",
] as const;

export type BillingNoticeKind = (typeof BILLING_NOTICE_KINDS)[number];

/**
 * The value stored in `billing_notice_sends.notice_key`. Identical to the
 * kind today, and deliberately a function rather than the kind itself so
 * that renaming a kind in TypeScript never silently re-sends every notice
 * already claimed under the old name.
 */
export function billingNoticeKey(kind: BillingNoticeKind): string {
  return kind;
}
