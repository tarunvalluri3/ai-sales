-- Out-of-order Razorpay webhook protection.
--
-- Razorpay does not guarantee delivery order. Without a record of how recent
-- the last applied lifecycle event was, a delayed `subscription.pending`
-- arriving after the `subscription.charged` that recovered the payment would
-- put a paid-up business back into `past_due`, and an older `charged` would
-- move `current_period_end` backwards. `provider_event_at` is the provider
-- timestamp (`created_at` on the webhook body) of the newest lifecycle event
-- whose state change has been applied; lib/razorpay-webhook.ts refuses to
-- apply an older one.
--
-- Nullable: every existing row, and any event without a timestamp, behaves
-- exactly as before. No new grant is needed -- `authenticated` keeps SELECT
-- only on this table (20261024000000) and the webhook writes through the
-- service role.

alter table public.subscriptions
  add column if not exists provider_event_at timestamptz;

comment on column public.subscriptions.provider_event_at is
  'Provider timestamp of the newest Razorpay lifecycle event applied to this row. Older events are not applied (lib/razorpay-webhook.ts).';
