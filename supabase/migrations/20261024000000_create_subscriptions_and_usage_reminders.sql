-- Phase 17a (2026-10-21): the entitlement layer for billing. No Razorpay
-- code yet -- this migration only gives the app somewhere to record which
-- plan a business is on and how far through its billing period it is, so
-- that the quotas /pricing has advertised since 2026-10-19 (1,000 / 3,000
-- / 10,000 AI replies per month) become enforceable instead of decorative.
-- The plan definitions themselves (price, quota, channel entitlements)
-- live in lib/plans.ts, deliberately NOT in the database: they are code
-- this app ships, not tenant data, and keeping them in TypeScript is what
-- lets the public pricing page and the enforcement path share one literal
-- set of numbers with a compile-time drift check.
--
-- Two tables, one feature: `subscriptions` is the plan assignment and
-- lifecycle; `usage_reminder_sends` is the at-most-once ledger for the
-- 50/60/70/80/90/100% quota emails. They ship together because the
-- reminder ledger is keyed by the billing period the first table defines.
--
-- Rollback (both tables are new and nothing reads them before this
-- phase's code deploys, so this is a clean reverse):
--   drop trigger subscriptions_prevent_trial_restart on public.subscriptions;
--   drop trigger subscriptions_set_updated_at on public.subscriptions;
--   drop function public.prevent_subscription_trial_restart();
--   drop table public.usage_reminder_sends;
--   drop table public.subscriptions;
--   drop index public.ai_response_metrics_business_created_idx;

-- ===================================================================
-- 1. subscriptions -- one row per business, or none at all
-- ===================================================================
--
-- PRIMARY KEY IS business_id, no surrogate id. A business has exactly one
-- subscription at a time, and making that a key rather than a convention
-- is also half of "one trial per organisation, ever" (a business maps 1:1
-- to a Clerk organisation): there is no second row to start a second trial
-- in. The other half is the write-once trigger on trial_started_at below.
--
-- NO ROW IS CREATED FOR EXISTING TENANTS, AND NONE IS BACKFILLED. An
-- absent row means "grandfathered", resolved in lib/subscription.ts as
-- Scale-level entitlements on a calendar-month period. That default is
-- stated in code, with its reasoning, at GRANDFATHERED_PLAN_KEY: every
-- tenant that predates billing was never sold a plan, and at least one of
-- them is already using capabilities that only Growth and Scale include
-- (a live WhatsApp connection, workflows, Copilot). Defaulting such a
-- tenant to Starter would revoke, by migration, a working feature nobody
-- agreed to give up; defaulting it to "expired" would switch its AI off.
-- Phase 17b writes a real row at checkout, and from then on the absent-row
-- case only covers pre-billing tenants.
create table public.subscriptions (
  business_id uuid primary key references public.businesses (id) on delete cascade,

  -- Must match PLAN_KEYS in lib/plans.ts. Asserted from the database side
  -- by supabase/tests/database/048_subscriptions_tenant_isolation.sql, and
  -- validated on read by a Zod enum built from PLAN_KEYS, so an unknown
  -- key can never reach the entitlement logic as a silent `undefined`.
  plan_key text not null check (plan_key in ('starter', 'growth', 'scale')),

  -- 'trialing'  -- 14 days / 200 replies, never paid.
  -- 'active'    -- paid and current.
  -- 'past_due'  -- a payment failed; keeps serving for PAST_DUE_GRACE_DAYS
  --                (5) past current_period_end, then stops.
  -- 'cancelled' -- cancelled but paid through current_period_end.
  -- 'expired'   -- terminal. The AI does not reply.
  status text not null check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired')),

  trial_started_at timestamptz,
  trial_ends_at timestamptz,

  -- The billing period quota is counted against. Deliberately stored
  -- rather than derived from a signup date: Razorpay owns the real period
  -- boundaries, a plan change moves them, and the UTC calendar month this
  -- app used before Phase 17a is not what a customer is invoiced on.
  current_period_start timestamptz,
  current_period_end timestamptz,

  cancel_at_period_end boolean not null default false,

  -- Populated by Phase 17b. Unique so one Razorpay subscription can never
  -- end up attached to two businesses; nullable, and NULLs do not collide
  -- in a unique index, so every pre-Razorpay row can leave it empty.
  razorpay_subscription_id text unique,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A trialing row without trial dates would make the 200-reply cap
  -- uncountable; a paid row without period dates would make the quota
  -- period uncountable. Both are rejected here rather than papered over
  -- with a fallback in TypeScript.
  constraint subscriptions_trial_dates_present check (
    status <> 'trialing' or (trial_started_at is not null and trial_ends_at is not null)
  ),
  constraint subscriptions_period_dates_present check (
    status = 'trialing' or (current_period_start is not null and current_period_end is not null)
  ),
  constraint subscriptions_trial_window_ordered check (
    trial_ends_at is null or trial_started_at is null or trial_ends_at > trial_started_at
  ),
  constraint subscriptions_period_ordered check (
    current_period_end is null or current_period_start is null or current_period_end > current_period_start
  )
);

-- No secondary index. The primary key is the only access path there is
-- (one row, looked up by business_id, on every chat turn). Phase 17b's
-- webhook will look rows up by razorpay_subscription_id, which the unique
-- constraint above already indexes.

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row
  execute function public.set_updated_at();

-- "One trial per organisation, ever" as a database guarantee rather than a
-- comment. Once trial_started_at is set it can never be changed or
-- cleared, so a second trial cannot be granted by an UPDATE -- including
-- by the service-role client, which bypasses RLS but not triggers. The row
-- itself cannot be deleted and re-created either: no DELETE grant exists
-- (see below), and the only cascade is the business being deleted.
create or replace function public.prevent_subscription_trial_restart()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.trial_started_at is not null
     and (new.trial_started_at is null or new.trial_started_at <> old.trial_started_at)
  then
    raise exception 'subscriptions.trial_started_at is write-once: a business gets one trial, ever'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger subscriptions_prevent_trial_restart
  before update on public.subscriptions
  for each row
  execute function public.prevent_subscription_trial_restart();

alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;

-- READ/WRITE GRANTS, DECIDED DELIBERATELY: select only.
--
-- A business must be able to see its own plan (the dashboard shows which
-- plan it is on and how much quota is left), so `authenticated` gets
-- SELECT behind the usual clerk_org_id policy.
--
-- It gets no INSERT, UPDATE or DELETE at all. This table is the answer to
-- "what has this customer paid for", and every writable column is one a
-- tenant would benefit from editing: plan_key (self-upgrade to Scale for
-- free), status ('active' without paying), trial_ends_at (an endless
-- trial), current_period_end (an endless period). Authorization at the
-- Server Action layer would be the usual pattern, but there is no legitimate
-- tenant-initiated write here in the first place -- Phase 17b's Razorpay
-- webhook is the only writer, and it runs with the service-role client,
-- which bypasses grants and RLS entirely (same shape as
-- ai_response_metrics). Withholding the grant means a future Server Action
-- cannot create this hole by accident.
grant select on public.subscriptions to authenticated;

create policy "subscriptions_select_own_business" on public.subscriptions
  for select to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

-- ===================================================================
-- 2. usage_reminder_sends -- the at-most-once ledger for quota emails
-- ===================================================================
--
-- One row per (business, billing period, threshold). The composite primary
-- key IS the at-most-once guarantee: lib/usage-reminders.ts inserts the
-- row first and only sends the email if that insert actually created it,
-- so a burst of concurrent turns crossing 50% together, or a cron/function
-- restart replaying work, produces one email rather than several. A
-- boolean column per threshold on `subscriptions` would have needed a
-- read-modify-write and lost exactly that race.
--
-- period_start is part of the key, so the ledger resets itself every
-- billing period with no sweeper job: a new period is new key space, and
-- last period's rows simply stop matching.
create table public.usage_reminder_sends (
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- The billing period's start, exactly as lib/subscription.ts resolved it
  -- (the subscription's current_period_start, or the UTC month start for a
  -- grandfathered business).
  period_start timestamptz not null,
  -- 50, 60, 70, 80, 90 or 100 -- USAGE_REMINDER_THRESHOLDS in
  -- lib/usage-reminders.ts. Range-checked rather than enumerated so adding
  -- a 95% step is a code change, not a migration; the check still refuses
  -- anything that is not a percentage.
  threshold_percent smallint not null check (threshold_percent between 1 and 100),
  sent_at timestamptz not null default now(),
  primary key (business_id, period_start, threshold_percent)
);

alter table public.usage_reminder_sends enable row level security;
alter table public.usage_reminder_sends force row level security;

-- NO GRANTS AT ALL to anon or authenticated -- same posture as
-- email_suppressions (20261019120000). Nothing in the dashboard reads this
-- table, so SELECT would be a privilege granted "just in case", and a
-- tenant able to DELETE from it could make this app re-send the same quota
-- email indefinitely. Written and read exclusively by the service-role
-- client from the chat and channel-webhook paths.

-- ===================================================================
-- 3. One index on the table the quota count reads
-- ===================================================================
--
-- lib/usage-limit.ts now runs a COUNT over ai_response_metrics scoped to
-- (business_id, created_at >= period_start) on every single chat turn, in
-- the prospect's own wait path (measured at 58ms as a plain lookup,
-- 2026-10-21). The existing single-column business_id index makes that a
-- scan of every row that business has ever produced, which is fine today
-- (a few hundred) and is not fine for a Scale tenant a year in (120,000+).
-- This composite index answers it from the index alone, ordered.
--
-- Not CONCURRENTLY: the Supabase CLI runs each migration in a transaction,
-- which forbids it, and this table is small enough (259 rows at the time
-- of writing) that the brief write lock is not worth a separate procedure.
create index ai_response_metrics_business_created_idx
  on public.ai_response_metrics (business_id, created_at);
