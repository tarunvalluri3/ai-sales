-- Tenant-isolation test for public.appointment_blocked_slots (2026-09-10
-- follow-up -- per-slot manual blocking for the visual slot-grid UI),
-- same shape as 031_business_hours_exceptions_tenant_isolation.sql. Also
-- exercises the one-block-per-slot unique index.

begin;
select plan(4);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.appointment_blocked_slots (business_id, starts_at, reason)
values
  ('00000000-0000-0000-0000-00000000000a', '2030-12-25T09:00:00Z', 'Blocked'),
  ('00000000-0000-0000-0000-00000000000b', '2030-12-25T09:00:00Z', 'Blocked');

insert into _tap_results select throws_ok(
  $$ insert into public.appointment_blocked_slots (business_id, starts_at)
     values ('00000000-0000-0000-0000-00000000000a', '2030-12-25T09:00:00Z') $$,
  '23505',
  null,
  'a second block for the same business+slot is rejected by the unique index'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select business_id from public.appointment_blocked_slots order by business_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s blocked slots, never org_b''s'
);

insert into _tap_results select throws_ok(
  $$ insert into public.appointment_blocked_slots (business_id, starts_at)
     values ('00000000-0000-0000-0000-00000000000b', '2030-12-26T09:00:00Z') $$,
  '42501',
  null,
  'org_a session cannot insert a blocked slot under org_b''s business id'
);

delete from public.appointment_blocked_slots where business_id = '00000000-0000-0000-0000-00000000000b';

reset role;
insert into _tap_results select is(
  (select count(*) from public.appointment_blocked_slots where business_id = '00000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'org_a session cannot delete org_b''s blocked slot (no rows affected, not an error)'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
