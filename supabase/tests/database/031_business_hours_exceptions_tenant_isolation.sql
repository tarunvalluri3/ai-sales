-- Tenant-isolation test for public.business_hours_exceptions (2026-09-10
-- follow-up to Phase C -- admin-controlled per-date scheduling overrides),
-- same shape as 020_business_hours_tenant_isolation.sql. Also exercises
-- the one-override-per-date unique index.

begin;
select plan(4);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.business_hours_exceptions (business_id, date, is_closed, reason)
values
  ('00000000-0000-0000-0000-00000000000a', '2030-12-25', true, 'Holiday'),
  ('00000000-0000-0000-0000-00000000000b', '2030-12-25', true, 'Holiday');

insert into _tap_results select throws_ok(
  $$ insert into public.business_hours_exceptions (business_id, date, is_closed)
     values ('00000000-0000-0000-0000-00000000000a', '2030-12-25', true) $$,
  '23505',
  null,
  'a second override for the same business+date is rejected by the unique index'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select business_id from public.business_hours_exceptions order by business_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s schedule overrides, never org_b''s'
);

insert into _tap_results select throws_ok(
  $$ insert into public.business_hours_exceptions (business_id, date, is_closed)
     values ('00000000-0000-0000-0000-00000000000b', '2030-12-26', true) $$,
  '42501',
  null,
  'org_a session cannot insert a schedule override under org_b''s business id'
);

delete from public.business_hours_exceptions where business_id = '00000000-0000-0000-0000-00000000000b';

reset role;
insert into _tap_results select is(
  (select count(*) from public.business_hours_exceptions where business_id = '00000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'org_a session cannot delete org_b''s schedule override (no rows affected, not an error)'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
