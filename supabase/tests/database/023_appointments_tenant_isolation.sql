-- Tenant-isolation test for public.appointments (Phase C -- business_id-
-- scoped like every sibling table, per its own migration's RLS policies,
-- but never independently pgTAP-verified until now; STATE.md backlog
-- item 8).
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.
--
-- Same session-simulation technique as 010_leads_tenant_isolation.sql.
-- Also exercises the appointments_contact_required and
-- appointments_active_slot_idx (double-booking) constraints.

begin;
select plan(6);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

-- Fixture setup as postgres (bypasses RLS -- this is seeding, not the
-- thing under test).
insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.appointments (
  id, business_id, contact_email, starts_at, ends_at
)
values
  ('40000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'a@example.com', '2030-01-01T10:00:00Z', '2030-01-01T10:30:00Z'),
  ('40000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'b@example.com', '2030-01-01T10:00:00Z', '2030-01-01T10:30:00Z');

insert into _tap_results select throws_ok(
  $$ insert into public.appointments (business_id, starts_at, ends_at)
     values ('00000000-0000-0000-0000-00000000000a', '2030-01-02T10:00:00Z', '2030-01-02T10:30:00Z') $$,
  '23514',
  null,
  'an appointment with neither contact_email nor contact_phone is rejected by appointments_contact_required'
);

insert into _tap_results select throws_ok(
  $$ insert into public.appointments (business_id, contact_email, starts_at, ends_at)
     values ('00000000-0000-0000-0000-00000000000a', 'c@example.com', '2030-01-01T10:00:00Z', '2030-01-01T10:30:00Z') $$,
  '23505',
  null,
  'a second pending appointment at the same business+slot is rejected by appointments_active_slot_idx'
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
  $$ select id from public.appointments order by id $$,
  $$ values ('40000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s appointments, never org_b''s'
);

insert into _tap_results select lives_ok(
  $$ update public.appointments set status = 'confirmed' where id = '40000000-0000-0000-0000-00000000000a' $$,
  'org_a session can update its own appointment''s status'
);

update public.appointments set status = 'confirmed' where id = '40000000-0000-0000-0000-00000000000b';

-- Checked via reset role (the unrestricted connecting role) -- see
-- 003_products_tenant_isolation.sql's comment for why (Phase 19b).
reset role;
insert into _tap_results select is(
  (select count(*) from public.appointments where id = '40000000-0000-0000-0000-00000000000b' and status = 'confirmed'),
  0::bigint,
  'org_a session cannot mutate org_b''s appointment (no rows affected, not an error -- same silent-no-op contract as leads)'
);

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

insert into _tap_results select throws_ok(
  $$ insert into public.appointments (business_id, contact_email, starts_at, ends_at)
     values ('00000000-0000-0000-0000-00000000000b', 'forged@example.com', '2030-01-03T10:00:00Z', '2030-01-03T10:30:00Z') $$,
  '42501',
  null,
  'org_a session cannot insert an appointment claiming org_b''s business_id'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
