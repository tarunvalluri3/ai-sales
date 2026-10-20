-- Tenant isolation and shape for public.notification_preferences
-- (2026-10-21, migration 20261022000000), the table that decides which
-- business-important events email which business.
--
-- A business able to read or write another's routing would learn what that
-- business is configured to care about, and could silence its alerts --
-- so this is a tenant-isolation test first and a shape test second.
--
-- Includes a positive control (assertion 9). An isolation test that only ever
-- proves denial will also pass against a table nobody can use at all, which
-- would hide a broken grant rather than reveal it.
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.
--
-- Same session-simulation technique as 001_businesses_tenant_isolation.sql.

begin;
select plan(9);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

-- Fixture setup as postgres (bypasses RLS -- this is seeding, not the
-- thing under test).
insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.notification_preferences (business_id, category, email_mode, in_app_enabled)
values
  ('00000000-0000-0000-0000-00000000000a', 'human_handover', 'immediate', true),
  -- org_b is seeded 'immediate' on purpose: the cross-tenant update below
  -- tries to set it to 'off', so a leak would be visible. Seeding it 'off'
  -- would make that assertion pass whether isolation held or not.
  ('00000000-0000-0000-0000-00000000000b', 'human_handover', 'immediate', false);

insert into _tap_results select is(
  (select email_mode from public.notification_preferences
     where business_id = '00000000-0000-0000-0000-00000000000a' and category = 'human_handover'),
  'immediate',
  'a preference row is stored and readable by the service role'
);

insert into _tap_results select throws_ok(
  $$ insert into public.notification_preferences (business_id, category, email_mode)
     values ('00000000-0000-0000-0000-00000000000a', 'human_handover', 'digest') $$,
  '23505',
  null,
  'a duplicate (business_id, category) is rejected by the primary key'
);

insert into _tap_results select throws_ok(
  $$ insert into public.notification_preferences (business_id, category, email_mode)
     values ('00000000-0000-0000-0000-00000000000a', 'lead_created', 'hourly') $$,
  '23514',
  null,
  'an unrecognized email_mode is rejected by the check constraint'
);

insert into _tap_results select throws_ok(
  $$ insert into public.notification_preferences (business_id, category)
     values ('00000000-0000-0000-0000-00000000000a', 'workflow') $$,
  '23514',
  null,
  'the workflow category is rejected -- workflow emails are authored per workflow and are never globally switchable'
);

insert into _tap_results select is(
  (select email_mode || ':' || in_app_enabled::text from public.notification_preferences
     where business_id = '00000000-0000-0000-0000-00000000000b' and category = 'human_handover'),
  'immediate:false',
  'in_app_enabled is independent of email_mode (the two switches are stored separately)'
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

insert into _tap_results select results_eq(
  $$ select business_id from public.notification_preferences order by business_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own preferences, never org_b''s'
);

insert into _tap_results select throws_ok(
  $$ insert into public.notification_preferences (business_id, category, email_mode)
     values ('00000000-0000-0000-0000-00000000000b', 'lead_created', 'off') $$,
  '42501',
  null,
  'org_a session cannot forge a preference row for org_b'
);

-- Silencing another business's alerts is the worst case this table allows, so
-- it gets its own assertion rather than riding on the SELECT one.
update public.notification_preferences set email_mode = 'off'
  where business_id = '00000000-0000-0000-0000-00000000000b';

update public.notification_preferences set in_app_enabled = false
  where business_id = '00000000-0000-0000-0000-00000000000a' and category = 'human_handover';

-- Checked via reset role (the unrestricted connecting role) -- see
-- 003_products_tenant_isolation.sql's comment for why (Phase 19b).
reset role;
insert into _tap_results select is(
  (select email_mode from public.notification_preferences
     where business_id = '00000000-0000-0000-0000-00000000000b' and category = 'human_handover'),
  'immediate',
  'org_a session cannot silence org_b''s alerts (still immediate -- no rows affected, not an error)'
);

insert into _tap_results select is(
  (select in_app_enabled from public.notification_preferences
     where business_id = '00000000-0000-0000-0000-00000000000a' and category = 'human_handover'),
  false,
  'positive control: org_a session CAN change its own routing, so the grant and policy actually work'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
