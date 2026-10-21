-- Tenant isolation and shape for public.subscriptions and
-- public.usage_reminder_sends (2026-10-21, migration 20261024000000) --
-- Phase 17a's entitlement layer.
--
-- This is a tenant-isolation test first and a shape test second, because
-- this table decides what a customer has paid for. A business able to
-- write its own row could grant itself Scale for free, extend its trial
-- forever, or push its billing period end into next year; a business able
-- to read another's would learn what a competitor pays. Both are asserted
-- against a simulated Clerk session below.
--
-- It is also where the plan registry and the database are held to the same
-- story: lib/plans.ts's PLAN_KEYS is the only definition of what plans
-- exist, and assertions 1-4 pin this table's check constraints to exactly
-- that set and to the five lifecycle statuses lib/subscription.ts handles.
-- Adding a plan in TypeScript without a migration (or the reverse) fails
-- here rather than in production.
--
-- Includes positive controls (assertions 10, 11 and 15). An isolation test
-- that only ever proves denial will also pass against a table nobody can
-- use at all, which would hide a broken grant rather than reveal it.
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.
--
-- Same session-simulation technique as 001_businesses_tenant_isolation.sql.

begin;
select plan(20);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

-- Fixture setup as postgres (bypasses RLS -- this is seeding, not the
-- thing under test).
insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

-- A paid row and a trialing row, so both branches of the date constraints
-- are represented by a real row rather than only by the rejections below.
--
-- UPDATED for Phase 17b (migration 20261025000000): both rows already
-- exist by the time we get here. `businesses_create_trial_subscription`
-- creates a trialing subscription in the same transaction as the business
-- insert above, so these are now UPDATEs rather than INSERTs -- an INSERT
-- would collide on the primary key, which is exactly what this file
-- asserts in assertion 7.
--
-- org_b needs no setup at all: the trigger already gives it precisely the
-- trialing starter row this test wanted (status 'trialing', plan_key
-- 'starter', both trial dates set). Writing it again would in fact be
-- *impossible* -- `trial_started_at` is write-once (assertion 9), so an
-- UPDATE re-stamping it would be refused by the very trigger this file
-- goes on to test.
update public.subscriptions
   set plan_key = 'growth',
       status = 'active',
       current_period_start = now() - interval '3 days',
       current_period_end = now() + interval '27 days',
       razorpay_subscription_id = 'sub_test_a'
 where business_id = '00000000-0000-0000-0000-00000000000a';

-- 1-2. The registry and the database agree on which plans and statuses
-- exist. Counting the quoted literals in the constraint definition pins
-- the *exact set*, not merely that the known values are accepted: an
-- unused fourth plan key left behind in the database would fail here even
-- though nothing ever inserts it.
insert into _tap_results select is(
  (select (length(pg_get_constraintdef(oid)) - length(replace(pg_get_constraintdef(oid), '::text', '')))
            / length('::text')
     from pg_constraint
     where conrelid = 'public.subscriptions'::regclass and conname = 'subscriptions_plan_key_check'),
  3,
  'subscriptions.plan_key accepts exactly 3 keys -- PLAN_KEYS in lib/plans.ts has 3 (starter, growth, scale)'
);

insert into _tap_results select is(
  (select (length(pg_get_constraintdef(oid)) - length(replace(pg_get_constraintdef(oid), '::text', '')))
            / length('::text')
     from pg_constraint
     where conrelid = 'public.subscriptions'::regclass and conname = 'subscriptions_status_check'),
  5,
  'subscriptions.status accepts exactly 5 statuses -- trialing, active, past_due, cancelled, expired'
);

-- 3-4. ...and rejects anything outside those sets, rather than coercing or
-- storing it.
insert into _tap_results select throws_ok(
  $$ insert into public.subscriptions (business_id, plan_key, status, current_period_start, current_period_end)
     values ('00000000-0000-0000-0000-00000000000b', 'enterprise', 'active', now(), now() + interval '30 days') $$,
  '23514',
  null,
  'a plan key the registry does not define is rejected by the check constraint'
);

insert into _tap_results select throws_ok(
  $$ insert into public.subscriptions (business_id, plan_key, status, current_period_start, current_period_end)
     values ('00000000-0000-0000-0000-00000000000b', 'scale', 'paused', now(), now() + interval '30 days') $$,
  '23514',
  null,
  'a lifecycle status lib/subscription.ts cannot handle is rejected by the check constraint'
);

-- 5-6. The quota period has to be countable. A trialing row with no trial
-- window, or a paid row with no billing period, would make the reply count
-- unmeasurable -- refused here rather than papered over in TypeScript.
insert into _tap_results select throws_ok(
  $$ insert into public.subscriptions (business_id, plan_key, status)
     values ('00000000-0000-0000-0000-00000000000b', 'starter', 'trialing') $$,
  '23514',
  null,
  'a trialing subscription without trial dates is rejected'
);

insert into _tap_results select throws_ok(
  $$ insert into public.subscriptions (business_id, plan_key, status)
     values ('00000000-0000-0000-0000-00000000000b', 'scale', 'active') $$,
  '23514',
  null,
  'an active subscription without a billing period is rejected'
);

-- 7. One subscription per business, enforced as a key. This is also half
-- of "one trial per organisation, ever": there is no second row to start a
-- second trial in.
insert into _tap_results select throws_ok(
  $$ insert into public.subscriptions (business_id, plan_key, status, current_period_start, current_period_end)
     values ('00000000-0000-0000-0000-00000000000a', 'scale', 'active', now(), now() + interval '30 days') $$,
  '23505',
  null,
  'a second subscription row for the same business is rejected by the primary key'
);

-- 8. Phase 17b will look rows up by this id, so the same Razorpay
-- subscription must never be attached to two businesses.
insert into _tap_results select throws_ok(
  $$ update public.subscriptions set razorpay_subscription_id = 'sub_test_a'
     where business_id = '00000000-0000-0000-0000-00000000000b' $$,
  '23505',
  null,
  'the same razorpay_subscription_id cannot be attached to two businesses'
);

-- 9-11. The other half of "one trial, ever": trial_started_at is
-- write-once, enforced by a trigger, so it survives even the service-role
-- client (which bypasses RLS but not triggers). Assertion 11 is the
-- control -- the trigger must freeze the trial's *start*, not the whole
-- row, or Phase 17b could not move a trialing business onto a paid plan.
-- `now() + interval '1 day'`, not `now()`, and the difference matters.
-- `now()` is the TRANSACTION's start time, and since Phase 17b the row
-- was created by `businesses_create_trial_subscription` inside this same
-- transaction, its `trial_started_at` IS `now()`. The write-once trigger
-- fires only when the value actually changes -- re-writing the identical
-- timestamp is a no-op and is deliberately allowed -- so testing with
-- `now()` would assert nothing and pass for the wrong reason. A different
-- value is what the rule is actually about.
insert into _tap_results select throws_ok(
  $$ update public.subscriptions set trial_started_at = now() + interval '1 day'
     where business_id = '00000000-0000-0000-0000-00000000000b' $$,
  '23514',
  null,
  'trial_started_at cannot be changed once set (a business gets one trial, ever)'
);

-- ...and it cannot be cleared either, which is the other way to try to
-- hand out a second trial.
insert into _tap_results select throws_ok(
  $$ update public.subscriptions set trial_started_at = null
     where business_id = '00000000-0000-0000-0000-00000000000b' $$,
  '23514',
  null,
  'trial_started_at cannot be cleared once set'
);

insert into _tap_results select lives_ok(
  $$ update public.subscriptions
       set status = 'active', current_period_start = now(), current_period_end = now() + interval '30 days'
     where business_id = '00000000-0000-0000-0000-00000000000b' $$,
  'a trialing subscription can still be converted to a paid one (the trigger freezes the trial start, not the row)'
);

-- 12. The at-most-once guarantee behind the quota reminder emails: the
-- second claim of the same threshold in the same period collides on the
-- primary key, which is what stops a burst of replies emailing a business
-- six times about 50%.
insert into public.usage_reminder_sends (business_id, period_start, threshold_percent)
values ('00000000-0000-0000-0000-00000000000a', '2026-10-01T00:00:00Z', 50);

insert into _tap_results select throws_ok(
  $$ insert into public.usage_reminder_sends (business_id, period_start, threshold_percent)
     values ('00000000-0000-0000-0000-00000000000a', '2026-10-01T00:00:00Z', 50) $$,
  '23505',
  null,
  'the same threshold cannot be claimed twice for the same business and period'
);

-- 13. ...while the next period is new key space, so the ledger resets
-- itself with no sweeper job.
insert into _tap_results select lives_ok(
  $$ insert into public.usage_reminder_sends (business_id, period_start, threshold_percent)
     values ('00000000-0000-0000-0000-00000000000a', '2026-11-01T00:00:00Z', 50) $$,
  'the same threshold can be claimed again in the next billing period'
);

-- 14. usage_reminder_sends is service-role-only: a tenant able to delete
-- from it could make this app re-send the same quota email indefinitely.
insert into _tap_results select ok(
  not has_table_privilege('authenticated', 'public.usage_reminder_sends', 'select')
  and not has_table_privilege('authenticated', 'public.usage_reminder_sends', 'insert')
  and not has_table_privilege('authenticated', 'public.usage_reminder_sends', 'update')
  and not has_table_privilege('authenticated', 'public.usage_reminder_sends', 'delete'),
  'authenticated has no privileges at all on usage_reminder_sends'
);

-- Simulate a signed-in user whose active Clerk organization is org_a.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'user_test_a',
    'role', 'authenticated',
    'o', json_build_object('id', 'org_a')
  )::text,
  true
);

-- 15. Positive control: a business can read its own plan. The dashboard
-- needs this, and without it assertion 15 would pass against a table
-- nobody can read.
insert into _tap_results select is(
  (select plan_key from public.subscriptions where business_id = '00000000-0000-0000-0000-00000000000a'),
  'growth',
  'org_a session can read its own subscription (subscriptions_select_own_business)'
);

-- 16. ...and only its own.
insert into _tap_results select is(
  (select count(*)::int from public.subscriptions
     where business_id = '00000000-0000-0000-0000-00000000000b'),
  0,
  'org_a session cannot read org_b''s subscription'
);

-- 17-19. No write path exists for a tenant at all -- not INSERT, not an
-- UPDATE of its own row, not an UPDATE of another business's. The refusal
-- is a missing grant (42501), which is deliberately stronger than an RLS
-- policy that filters rows: there is nothing for a future Server Action to
-- get wrong.
insert into _tap_results select throws_ok(
  $$ insert into public.subscriptions (business_id, plan_key, status, current_period_start, current_period_end)
     values ('00000000-0000-0000-0000-00000000000a', 'scale', 'active', now(), now() + interval '30 days') $$,
  '42501',
  null,
  'org_a session cannot insert a subscription (no INSERT grant to authenticated)'
);

insert into _tap_results select throws_ok(
  $$ update public.subscriptions set plan_key = 'scale'
     where business_id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'org_a session cannot upgrade its own plan (no UPDATE grant to authenticated)'
);

insert into _tap_results select throws_ok(
  $$ update public.subscriptions set status = 'expired'
     where business_id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501',
  null,
  'org_a session cannot write org_b''s subscription'
);

-- Checked via reset role (the unrestricted connecting role) -- see
-- 003_products_tenant_isolation.sql's comment for why (Phase 19b).
reset role;

-- 20. The index the per-turn quota count depends on. Asserted because it
-- is not cosmetic: lib/usage-limit.ts runs a COUNT scoped to
-- (business_id, created_at) on every chat turn, in the prospect's own wait.
insert into _tap_results select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'ai_response_metrics'
      and indexname = 'ai_response_metrics_business_created_idx'
  ),
  'ai_response_metrics_business_created_idx exists (the per-turn quota count reads it)'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
