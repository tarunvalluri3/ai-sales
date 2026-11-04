-- Production readiness, item 6 (LAUNCH_AUDIT.md §9, blocker B7): deleting a
-- business must cancel its Razorpay subscription, and a cancellation that
-- fails must be recorded, retried and alerted on, so a deleted customer can
-- never keep being charged.
--
-- public.billing_cancellations is written BEFORE the business row is
-- deleted. It deliberately has NO foreign key to businesses: the business
-- (and its subscriptions row) is cascade-deleted a moment later, and this
-- record must outlive it. The scheduler retries pending rows with backoff
-- (lib/billing-cancellation.ts); the Razorpay webhook uses it to recognise
-- events for a deleted business (a charge after deletion raises an alert).
--
-- status:
--   pending   -- not yet confirmed cancelled at Razorpay; retried
--   cancelled -- Razorpay says the subscription is cancelled/completed/expired
--   failed    -- retries exhausted; needs a human (alerted)
--
-- Service-role only: RLS forced, no client grants, explicit deny policy.
-- (A deleted tenant has no session to read it with anyway.)

create table public.billing_cancellations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  clerk_org_id text not null,
  business_name text,
  razorpay_subscription_id text not null unique,
  razorpay_customer_id text,
  reason text not null default 'business_deleted' check (reason in ('business_deleted')),
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  -- Charges Razorpay reported AFTER the deletion (subscription.charged for
  -- this id). Any value above 0 is money a deleted customer paid: alerted,
  -- and refunding it is a manual decision.
  charges_after_deletion integer not null default 0,
  last_charge_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create index billing_cancellations_pending_idx
  on public.billing_cancellations (next_attempt_at)
  where status = 'pending';

alter table public.billing_cancellations enable row level security;
alter table public.billing_cancellations force row level security;

revoke all on public.billing_cancellations from anon, authenticated;
create policy billing_cancellations_no_client_access
  on public.billing_cancellations
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
