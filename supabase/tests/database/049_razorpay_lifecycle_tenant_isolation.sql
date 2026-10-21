-- Shape and tenant isolation for Phase 17b's Razorpay lifecycle
-- (2026-10-21, migration 20261025000000): the new `public.subscriptions`
-- columns, `public.razorpay_webhook_events`,
-- `public.billing_notice_sends`, and the trigger that creates a trialing
-- subscription the moment a business is created.
--
-- This is a tenant-isolation test first and a shape test second, for the
-- same reason 048 is: these tables decide what a customer has paid for and
-- whether a payment event has already been applied. Two specific holes are
-- asserted shut:
--
--   * A tenant able to DELETE from `razorpay_webhook_events` could replay
--     its own `subscription.charged` and extend its paid period for free --
--     a direct route to unlimited free service. Zero grants, asserted.
--   * A tenant able to DELETE from `billing_notice_sends` could make this
--     app re-send the same billing email indefinitely. Zero grants,
--     asserted.
--
-- It is also where the registry and the database are held to the same story
-- about the trial: assertion 4 pins the interval the trigger actually
-- produces to exactly 14 days, so changing TRIAL_DAYS in lib/plans.ts
-- without changing the migration fails here rather than quietly giving new
-- customers a different trial from the one /pricing advertises.
--
-- Includes positive controls (assertions 3, 10, 15). An isolation test that
-- only ever proves denial will also pass against a table nobody can use at
-- all, which would hide a broken grant rather than reveal it.
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see
-- 001_businesses_tenant_isolation.sql's header for why this is wrapped in
-- a temporary results table. Same session-simulation technique.

begin;
select plan(21);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

-- ===================================================================
-- 1-4. The trigger: a trialing row appears with the business
-- ===================================================================
--
-- Inserted as postgres, which bypasses RLS -- but NOT triggers, which is
-- the point: this is the same path the service-role client takes, and the
-- row must appear regardless of who inserts the business.
insert into public.businesses (id, clerk_org_id, name)
values ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A');

insert into _tap_results select is(
  (select count(*)::int from public.subscriptions
     where business_id = '00000000-0000-0000-0000-00000000000a'),
  1,
  'creating a business creates exactly one subscription row (businesses_create_trial_subscription)'
);

insert into _tap_results select is(
  (select status from public.subscriptions where business_id = '00000000-0000-0000-0000-00000000000a'),
  'trialing',
  'the row the trigger creates is trialing -- a new organisation is not silently grandfathered onto Scale'
);

-- 3. Positive control for the trigger's own correctness: a trialing row
-- needs both trial dates (subscriptions_trial_dates_present), so if the
-- trigger set neither, the business INSERT above would have failed. This
-- asserts they are actually populated rather than merely non-null by luck.
insert into _tap_results select ok(
  (select trial_started_at is not null and trial_ends_at is not null
     from public.subscriptions where business_id = '00000000-0000-0000-0000-00000000000a'),
  'the trigger populates both trial dates, so the 200-reply trial cap is countable'
);

-- 4. THE DRIFT CHECK. TRIAL_DAYS in lib/plans.ts is 14, and /pricing
-- advertises a 14-day trial. Asserted against the interval the trigger
-- really produced, not against the migration's text.
insert into _tap_results select is(
  (select round(extract(epoch from (trial_ends_at - trial_started_at)) / 86400)::int
     from public.subscriptions where business_id = '00000000-0000-0000-0000-00000000000a'),
  14,
  'the trial the trigger grants is exactly 14 days -- TRIAL_DAYS in lib/plans.ts'
);

-- A second business, so the isolation assertions below have something to
-- be isolated from. Its trigger-created row is converted to a paid one,
-- which also re-proves that the write-once trial trigger freezes the
-- trial''s start and not the whole row.
insert into public.businesses (id, clerk_org_id, name)
values ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

update public.subscriptions
   set status = 'active',
       plan_key = 'growth',
       billing_interval = 'monthly',
       current_period_start = now() - interval '3 days',
       current_period_end = now() + interval '27 days',
       razorpay_subscription_id = 'sub_test_b',
       razorpay_customer_id = 'cust_test_b',
       billing_state_code = '36',
       gstin = '36AAAAA0000A1Z5'
 where business_id = '00000000-0000-0000-0000-00000000000b';

-- ===================================================================
-- 5-9. The new columns' constraints
-- ===================================================================

insert into _tap_results select throws_ok(
  $$ update public.subscriptions set billing_interval = 'weekly'
     where business_id = '00000000-0000-0000-0000-00000000000b' $$,
  '23514',
  null,
  'billing_interval accepts only monthly or annual -- annual is an order, monthly is a mandate'
);

-- The place of supply decides CGST+SGST versus IGST on Phase 17c's
-- invoices, so a code that is not a two-digit GST state code is refused
-- rather than stored and discovered at invoicing time.
insert into _tap_results select throws_ok(
  $$ update public.subscriptions set billing_state_code = 'TS'
     where business_id = '00000000-0000-0000-0000-00000000000b' $$,
  '23514',
  null,
  'billing_state_code must be two digits (a GST state code), not a name or an abbreviation'
);

-- A malformed GSTIN on an issued tax invoice is the customer's problem,
-- not just ours, so the format is enforced in the database and not only
-- in Zod.
insert into _tap_results select throws_ok(
  $$ update public.subscriptions set gstin = '36aaaaa0000a1z5'
     where business_id = '00000000-0000-0000-0000-00000000000b' $$,
  '23514',
  null,
  'gstin must be the canonical 15-character upper-case format'
);

insert into _tap_results select throws_ok(
  $$ update public.subscriptions set scheduled_plan_key = 'enterprise'
     where business_id = '00000000-0000-0000-0000-00000000000b' $$,
  '23514',
  null,
  'scheduled_plan_key accepts only the three plan keys the registry defines'
);

-- A scheduled change pointing at the plan already in effect would be a
-- no-op the period-end sweep would "apply" forever.
insert into _tap_results select throws_ok(
  $$ update public.subscriptions set scheduled_plan_key = 'growth'
     where business_id = '00000000-0000-0000-0000-00000000000b' $$,
  '23514',
  null,
  'scheduled_plan_key cannot equal the current plan_key (subscriptions_scheduled_plan_differs)'
);

-- 10. Positive control: a real downgrade schedules fine, and the identity
-- columns a 17c invoice needs really are writable.
insert into _tap_results select lives_ok(
  $$ update public.subscriptions
       set scheduled_plan_key = 'starter', past_due_since = now(), razorpay_order_id = 'order_test_b'
     where business_id = '00000000-0000-0000-0000-00000000000b' $$,
  'a genuine downgrade, a grace anchor and an order id can all be stored'
);

-- ===================================================================
-- 11-13. razorpay_webhook_events -- idempotency as a key
-- ===================================================================
--
-- This is the assertion that stops a replayed charge handing out a free
-- billing period: the second insert of the same Razorpay event id must
-- collide, which is what makes `claimWebhookEvent` return false.
insert into public.razorpay_webhook_events (event_id, event, business_id)
values ('evt_test_charged', 'subscription.charged', '00000000-0000-0000-0000-00000000000b');

insert into _tap_results select throws_ok(
  $$ insert into public.razorpay_webhook_events (event_id, event, business_id)
     values ('evt_test_charged', 'subscription.charged', '00000000-0000-0000-0000-00000000000b') $$,
  '23505',
  null,
  'the same Razorpay event id cannot be claimed twice (a replayed subscription.charged is a no-op)'
);

-- Nullable business_id: an event can be verified, deduped and acknowledged
-- before we can resolve which business it belongs to, and losing the
-- dedupe record because a lookup failed is the worse outcome.
insert into _tap_results select lives_ok(
  $$ insert into public.razorpay_webhook_events (event_id, event)
     values ('evt_test_unresolved', 'order.paid') $$,
  'an event with no resolvable business can still be recorded, so it is still deduped'
);

insert into _tap_results select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'razorpay_webhook_events'
      and indexname = 'razorpay_webhook_events_business_received_idx'
  ),
  'razorpay_webhook_events_business_received_idx exists (support reads these by business)'
);

-- ===================================================================
-- 14-15. billing_notice_sends -- at-most-once per period
-- ===================================================================
insert into public.billing_notice_sends (business_id, notice_key, period_end)
values ('00000000-0000-0000-0000-00000000000b', 'payment_failed', '2026-11-06T10:00:00Z');

insert into _tap_results select throws_ok(
  $$ insert into public.billing_notice_sends (business_id, notice_key, period_end)
     values ('00000000-0000-0000-0000-00000000000b', 'payment_failed', '2026-11-06T10:00:00Z') $$,
  '23505',
  null,
  'the same billing notice cannot be claimed twice for the same period (one email per failure, not one per retry)'
);

-- 15. Positive control: the next period is new key space, so the ledger
-- resets itself with no sweeper job.
insert into _tap_results select lives_ok(
  $$ insert into public.billing_notice_sends (business_id, notice_key, period_end)
     values ('00000000-0000-0000-0000-00000000000b', 'payment_failed', '2026-12-06T10:00:00Z') $$,
  'the same notice can be claimed again for a different period'
);

-- ===================================================================
-- 16-17. Zero grants on both ledgers
-- ===================================================================
insert into _tap_results select ok(
  not has_table_privilege('authenticated', 'public.razorpay_webhook_events', 'select')
  and not has_table_privilege('authenticated', 'public.razorpay_webhook_events', 'insert')
  and not has_table_privilege('authenticated', 'public.razorpay_webhook_events', 'update')
  and not has_table_privilege('authenticated', 'public.razorpay_webhook_events', 'delete'),
  'authenticated has no privileges at all on razorpay_webhook_events (a DELETE would allow replaying a charge for free service)'
);

insert into _tap_results select ok(
  not has_table_privilege('authenticated', 'public.billing_notice_sends', 'select')
  and not has_table_privilege('authenticated', 'public.billing_notice_sends', 'insert')
  and not has_table_privilege('authenticated', 'public.billing_notice_sends', 'update')
  and not has_table_privilege('authenticated', 'public.billing_notice_sends', 'delete'),
  'authenticated has no privileges at all on billing_notice_sends'
);

-- ===================================================================
-- 18. The audit action list the lifecycle writes
-- ===================================================================
--
-- Pinned as an exact count, the same technique 048 uses for plan keys: a
-- value this app never writes, left behind in the constraint, fails here.
-- 46 before this phase (20261022000000) plus 9 lifecycle actions.
insert into _tap_results select is(
  (select (length(pg_get_constraintdef(oid)) - length(replace(pg_get_constraintdef(oid), '::text', '')))
            / length('::text')
     from pg_constraint
     where conrelid = 'public.audit_log'::regclass and conname = 'audit_log_action_check'),
  55,
  'audit_log.action accepts exactly 55 actions -- 46 before Phase 17b plus its 9 subscription lifecycle entries'
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

-- ===================================================================
-- 19-21. Tenant isolation over the new columns
-- ===================================================================
--
-- Phase 17a already asserted that a tenant cannot read another's
-- subscription or write any subscription at all (048, assertions 14-18).
-- What is new here is that the row now carries billing identity -- a
-- GSTIN and a place of supply -- which is exactly the kind of data a
-- competitor would like, and a scheduled plan change, which is commercial
-- intent. Re-asserted against the new columns specifically.
insert into _tap_results select is(
  (select count(*)::int from public.subscriptions
     where business_id = '00000000-0000-0000-0000-00000000000b'),
  0,
  'org_a session cannot read org_b''s subscription row, including its GSTIN and place of supply'
);

insert into _tap_results select throws_ok(
  $$ update public.subscriptions set billing_state_code = '27', gstin = null
     where business_id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501',
  null,
  'org_a session cannot rewrite org_b''s billing identity (no UPDATE grant to authenticated)'
);

-- The one that would be free money: scheduling itself onto a bigger plan,
-- or clearing its own grace anchor to serve indefinitely after a failed
-- payment. Refused by a missing grant (42501), which is stronger than an
-- RLS policy that filters rows -- there is nothing for a future Server
-- Action to get wrong.
insert into _tap_results select throws_ok(
  $$ update public.subscriptions set scheduled_plan_key = 'scale', past_due_since = null
     where business_id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'org_a session cannot schedule its own plan change or clear its own grace anchor'
);

-- Back to the unrestricted connecting role before finishing, exactly as
-- 048 does. `_tap_results` is granted INSERT to `authenticated` and
-- nothing else, so `finish()` and the final SELECT below have to run as
-- the connecting role -- leaving the session as `authenticated` fails with
-- `permission denied for table _tap_results`.
reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
