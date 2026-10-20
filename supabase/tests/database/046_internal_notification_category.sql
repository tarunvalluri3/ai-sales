-- Tests for internal_notifications.category (2026-10-21, migration
-- 20261021000000) -- the column that lets the table carry every
-- business-important event, not just the workflow engine's own action.
--
-- A separate file rather than an edit to 039, keeping the test suite
-- forward-only in the same way the migrations are.
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.
--
-- Same session-simulation technique as 001_businesses_tenant_isolation.sql.

begin;
select plan(5);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

-- Fixture setup as postgres (bypasses RLS -- this is seeding, not the
-- thing under test).
insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

-- Inserted WITHOUT naming category, i.e. exactly what every row written by
-- lib/workflow-engine.ts looks like, before and after the migration.
insert into public.internal_notifications (id, business_id, message)
values ('50000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Existing workflow notification');

insert into _tap_results select is(
  (select category from public.internal_notifications where id = '50000000-0000-0000-0000-00000000000a'),
  'workflow',
  'a row written without a category defaults to workflow (the no-backfill contract: every pre-existing row came from the workflow engine)'
);

insert into _tap_results select lives_ok(
  $$ insert into public.internal_notifications (business_id, category, message, link)
     values ('00000000-0000-0000-0000-00000000000a', 'human_handover', 'A conversation needs a human', '/dashboard/conversations/x') $$,
  'the new event categories are accepted'
);

insert into _tap_results select throws_ok(
  $$ insert into public.internal_notifications (business_id, category, message)
     values ('00000000-0000-0000-0000-00000000000a', 'bogus_category', 'nope') $$,
  '23514',
  null,
  'an unrecognized category is rejected by internal_notifications_category_check'
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

-- Asserts what is actually true, not what might be preferred: the UPDATE grant
-- from 20260914060000 is column-scoped to read_at, so a category cannot be
-- rewritten after the fact even by the owning business.
insert into _tap_results select throws_ok(
  $$ update public.internal_notifications set category = 'lead_created'
       where business_id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'an authenticated session cannot rewrite a category (the update grant covers read_at only)'
);

-- The exact statement the bell's "mark all read" performs.
insert into _tap_results select lives_ok(
  $$ update public.internal_notifications set read_at = now()
       where business_id = '00000000-0000-0000-0000-00000000000a' and read_at is null $$,
  'mark-all-read succeeds under the existing read_at column grant -- no migration was needed for it'
);

reset role;
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
