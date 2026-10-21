-- Phase 17b (2026-10-21): the Razorpay subscription lifecycle. Phase 17a
-- (20261024000000) built `public.subscriptions` as an entitlement record
-- with nothing writing to it; this migration gives it the columns a real
-- payment lifecycle needs, the two ledgers that make webhook handling and
-- renewal email sending idempotent, and -- the important one -- a trigger
-- that creates a trialing row the moment a business is created.
--
-- TEST MODE ONLY. Nothing in this phase charges a real customer: going
-- live is blocked on Phase 17c's GST invoices, because charging an Indian
-- customer without issuing a tax invoice is not lawful. See STATE.md.
--
-- Rollback (every change here is additive -- a clean reverse):
--   drop trigger businesses_create_trial_subscription on public.businesses;
--   drop function public.create_trial_subscription_for_new_business();
--   drop table public.billing_notice_sends;
--   drop table public.razorpay_webhook_events;
--   alter table public.subscriptions
--     drop constraint subscriptions_scheduled_plan_differs,
--     drop column billing_interval,
--     drop column past_due_since,
--     drop column scheduled_plan_key,
--     drop column razorpay_customer_id,
--     drop column razorpay_order_id,
--     drop column billing_state_code,
--     drop column gstin;
--   -- then re-add audit_log_action_check without this phase's values.

-- ===================================================================
-- 1. subscriptions -- the columns a payment lifecycle needs
-- ===================================================================

alter table public.subscriptions
  -- 'monthly' is a real Razorpay Subscription (a mandate Razorpay charges
  -- every month). 'annual' is a one-time Order, deliberately NOT a
  -- subscription: RBI's additional-factor-of-authentication rules make an
  -- annual mandate re-authenticate every cycle anyway, so an annual
  -- "subscription" buys nothing over an order and loses the ability to
  -- take the money in one authenticated transaction. NULL while trialing
  -- before checkout, and for every grandfathered (row-less) tenant.
  add column billing_interval text
    check (billing_interval is null or billing_interval in ('monthly', 'annual')),

  -- When a renewal payment first failed, i.e. when the 5-day grace period
  -- started (PAST_DUE_GRACE_DAYS in lib/plans.ts). Stored rather than
  -- derived from current_period_end because Razorpay retries a failed
  -- charge over several days and fires subscription.pending again on each
  -- retry: the grace has to be anchored to the FIRST failure, or every
  -- retry would silently restart the clock and a never-paying customer
  -- would keep serving forever. Cleared on a successful charge.
  add column past_due_since timestamptz,

  -- A downgrade that takes effect at period end (lib/billing-plan-change.ts).
  -- Held here rather than applied immediately so a business that has paid
  -- for Growth this period keeps Growth's quota and channels until the
  -- period it paid for actually ends.
  add column scheduled_plan_key text
    check (scheduled_plan_key is null or scheduled_plan_key in ('starter', 'growth', 'scale')),

  -- Razorpay's own customer record, created implicitly when a mandate is
  -- authenticated. Stored so a support question ("which Razorpay customer
  -- is this?") does not need a search by notes.
  add column razorpay_customer_id text,

  -- The most recent annual Order. The annual path has no
  -- razorpay_subscription_id by design, so without this an annual payment
  -- could only be correlated back through notes.
  add column razorpay_order_id text,

  -- THE CUSTOMER'S PLACE OF SUPPLY, as a GST state code ('36' = Telangana).
  -- Captured at checkout specifically because Phase 17c's invoices cannot
  -- be issued without it: the code decides CGST+SGST (intra-state, the
  -- customer's code equals the supplier's) versus a single IGST line
  -- (inter-state). Collected now rather than in 17c because collecting it
  -- later means chasing every customer who has already paid. Two digits
  -- only -- the state's name is derived in TypeScript from the closed
  -- registry in lib/india-states.ts, so a renamed state is a code change
  -- and never a stale string in a row.
  add column billing_state_code text
    check (billing_state_code is null or billing_state_code ~ '^[0-9]{2}$'),

  -- Optional: a registered business customer's GSTIN, so 17c can issue a
  -- B2B invoice it can claim input credit on. Format-checked here and not
  -- only in Zod, because a malformed GSTIN on an issued tax invoice is a
  -- problem for the customer, not just for us. The pattern also forces
  -- upper case, so a comparison never depends on how it was typed.
  add column gstin text
    check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');

-- An annual row has no subscription id and a monthly one has no order id,
-- but neither is worth a constraint: an upgrade on an annual plan creates
-- a pro-rata order, and a row that moved from annual to monthly keeps its
-- last order id as history. The one invariant that IS worth enforcing is
-- that a scheduled change never points at the plan already in effect --
-- that would be a no-op the period-end sweep would "apply" forever.
alter table public.subscriptions
  add constraint subscriptions_scheduled_plan_differs check (
    scheduled_plan_key is null or scheduled_plan_key <> plan_key
  );

-- ===================================================================
-- 2. razorpay_webhook_events -- idempotency, as a key
-- ===================================================================
--
-- Razorpay retries a webhook until it gets a 2xx, and a replayed
-- `subscription.charged` that was not deduped would extend a billing
-- period a second time -- i.e. hand out a free month per retry. The event
-- id Razorpay sends in `x-razorpay-event-id` is unique per event, so the
-- primary key IS the dedupe: the handler inserts first and does the work
-- only if that insert created the row. A duplicate is a normal outcome
-- answered with 200, not an error, so the retry stops.
--
-- Deliberately keyed on the event id alone, not on (event_id, event): one
-- id is one event, and a composite key would let a replay carrying the
-- same id with a different `event` string through.
create table public.razorpay_webhook_events (
  event_id text primary key,
  -- 'subscription.charged', 'order.paid', ... Recorded for support and for
  -- the audit trail; never trusted for routing, which reads the verified
  -- body instead.
  event text not null,
  -- Nullable: an event can be verified, deduped and acknowledged before we
  -- know (or can resolve) which business it belongs to, and losing the
  -- dedupe record because a lookup failed is the worse outcome. `set null`
  -- rather than `cascade`, so deleting a business never deletes the proof
  -- that its events were already processed.
  business_id uuid references public.businesses (id) on delete set null,
  received_at timestamptz not null default now()
);

-- Support reads this by business, not by id ("what did Razorpay tell us
-- about this customer, and when?").
create index razorpay_webhook_events_business_received_idx
  on public.razorpay_webhook_events (business_id, received_at desc);

alter table public.razorpay_webhook_events enable row level security;
alter table public.razorpay_webhook_events force row level security;

-- NO GRANTS AT ALL to anon or authenticated -- the same posture as
-- usage_reminder_sends and email_suppressions. A tenant able to delete
-- from this table could replay its own `subscription.charged` event and
-- extend its paid period for free, which makes a DELETE grant here a
-- direct route to free service. Service-role only.

-- ===================================================================
-- 3. billing_notice_sends -- at-most-once for lifecycle emails
-- ===================================================================
--
-- The same shape, and the same reasoning, as usage_reminder_sends: the row
-- is claimed before the email is sent, so a cron that runs twice or a
-- webhook retry slipping past the event dedupe cannot mail a customer the
-- same "your payment failed" notice repeatedly.
--
-- Keyed by period_end rather than period start because every notice here
-- is about an ending: a renewal falling due, a grace period running out. A
-- new period is new key space, so the ledger resets itself with no sweeper.
create table public.billing_notice_sends (
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- See BILLING_NOTICE_KEYS in lib/billing-notices.ts. Free text rather
  -- than an enumerated set so adding a notice is a code change, not a
  -- migration; the length cap only refuses something that is not a key.
  notice_key text not null check (length(notice_key) between 1 and 64),
  period_end timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (business_id, notice_key, period_end)
);

alter table public.billing_notice_sends enable row level security;
alter table public.billing_notice_sends force row level security;

-- No grants, for the same reason as usage_reminder_sends: nothing in the
-- dashboard reads it, and a tenant able to delete from it could make this
-- app re-send the same billing email indefinitely.

-- ===================================================================
-- 4. A trialing row the moment a business is created
-- ===================================================================
--
-- THE PROBLEM THIS FIXES. Phase 17a's default for a business with no
-- subscription row is grandfathered Scale entitlements, which was the
-- right call for the tenants that predate billing -- but it also meant
-- every NEW organisation would get Scale, free, forever, because nothing
-- in 17a created a row.
--
-- Done as a trigger rather than inside lib/business.ts's
-- createBusinessForOrg(), for two reasons that both matter:
--
-- 1. It runs in the same transaction as the business insert, so there is
--    no window in which a business exists without a subscription. A
--    best-effort insert after the fact would fail open into free Scale
--    exactly when something is already going wrong -- the worst possible
--    direction for a billing default to fail in.
-- 2. createBusinessForOrg() uses the Clerk-session client, which has no
--    INSERT grant on subscriptions (deliberately -- see 20261024000000's
--    grant comment). Writing the row from there would mean either granting
--    tenants INSERT on their own subscription or threading a service-role
--    client through onboarding. The trigger needs neither.
--
-- EXISTING TENANTS ARE UNTOUCHED: this fires on INSERT only, so no row is
-- created or backfilled for any business that already exists, and every
-- one of them keeps its grandfathered Scale behaviour exactly as 17a
-- shipped it.
--
-- plan_key 'starter' is a pre-checkout placeholder, not a sale. The trial
-- cap is TRIAL_REPLY_QUOTA (200) whatever the plan_key, so this choice
-- affects only which channels are open before the customer picks a plan --
-- and 'starter' is the honest answer to "which plan have they chosen?"
-- when they have not chosen one. Checkout sets plan_key to the plan they
-- actually subscribe to while keeping status 'trialing' and the same trial
-- window, so a Growth trialist gets Growth's channels from the moment the
-- mandate is authorised.
--
-- SECURITY DEFINER because the inserting role is whoever created the
-- business -- the Clerk-session role, which has no INSERT grant on
-- subscriptions. The function body is a single fixed INSERT with no
-- dynamic SQL and a pinned search_path, and it can only ever write a row
-- for the business row that was just inserted (new.id), so it grants no
-- capability a tenant could steer.
--
-- The 14-day interval must stay in step with TRIAL_DAYS in lib/plans.ts.
-- supabase/tests/database/049 asserts the interval this trigger actually
-- produces is exactly 14 days, so changing TRIAL_DAYS without changing
-- this migration fails CI rather than quietly giving new customers a
-- different trial from the one /pricing advertises.
create or replace function public.create_trial_subscription_for_new_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (
    business_id, plan_key, status, trial_started_at, trial_ends_at
  )
  values (
    new.id, 'starter', 'trialing', now(), now() + interval '14 days'
  )
  -- Belt and braces. The primary key makes a second row impossible and the
  -- write-once trial trigger would refuse to restart a trial anyway; this
  -- only guarantees that a row somehow already existing can never turn a
  -- business insert into an error.
  on conflict (business_id) do nothing;

  return new;
end;
$$;

-- AFTER, not BEFORE: the businesses row has to exist before a row
-- referencing it can be inserted, since the foreign key is checked
-- immediately.
create trigger businesses_create_trial_subscription
  after insert on public.businesses
  for each row
  execute function public.create_trial_subscription_for_new_business();

-- ===================================================================
-- 5. audit_log.action -- the lifecycle entries
-- ===================================================================
--
-- audit_log.action is a closed check constraint, last redefined by
-- 20261022000000. Extended the same way -- drop and re-add with the full
-- existing list plus this phase's values -- so that every plan and status
-- change leaves a durable record of what changed and what caused it. The
-- list below is 20261022000000's live definition plus nine entries.
--
-- Webhook-driven entries have no human actor, so they record
-- actor_user_id = 'system:razorpay' (recordSystemAuditLogEntry in
-- lib/audit-log.ts). actor_user_id is free text, so this needs no schema
-- change -- and a reader can tell at a glance which rows a person caused
-- and which Razorpay did.
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (
  action in (
    'conversation.control_changed',
    'conversation.attention_dismissed',
    'knowledge.deleted',
    'knowledge.published',
    'knowledge.unpublished',
    'widget_key.created',
    'widget_key.origins_updated',
    'widget_key.revoked',
    'webhook_endpoint.created',
    'webhook_endpoint.deleted',
    'business_hours.updated',
    'widget_branding.updated',
    'business.published',
    'widget_suggested_questions.updated',
    'ai_conversion_goal.updated',
    'appointment_settings.updated',
    'appointment.confirmed',
    'appointment.declined',
    'appointment.cancelled',
    'ai_capabilities.updated',
    'whatsapp_connection.created',
    'whatsapp_connection.deleted',
    'appointment_exception.created',
    'appointment_exception.deleted',
    'appointment.completed',
    'appointment.no_show',
    'appointment_slot_block.created',
    'appointment_slot_block.deleted',
    'instagram_connection.created',
    'instagram_connection.deleted',
    'customer.renamed',
    'segment.created',
    'segment.updated',
    'segment.deleted',
    'workflow.created',
    'workflow.updated',
    'workflow.deleted',
    'workflow.enabled',
    'workflow.disabled',
    'workflow_run.cancelled',
    'copilot.item_dismissed',
    'copilot.item_undismissed',
    'copilot.action_snoozed',
    'copilot.action_completed',
    'copilot.action_superseded',
    'notification_preferences.updated',
    'subscription.checkout_started',
    'subscription.activated',
    'subscription.charged',
    'subscription.payment_failed',
    'subscription.grace_lapsed',
    'subscription.cancellation_scheduled',
    'subscription.expired',
    'subscription.plan_changed',
    'subscription.plan_change_scheduled'
  )
);
