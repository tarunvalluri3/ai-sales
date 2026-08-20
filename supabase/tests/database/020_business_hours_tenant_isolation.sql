-- Tenant-isolation test for public.business_hours (Phase 24, AGENTS.md §7).

begin;
select plan(3);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.business_hours (business_id, day_of_week, is_open, start_time, end_time)
values
  ('00000000-0000-0000-0000-00000000000a', 1, true, '09:00', '17:00'),
  ('00000000-0000-0000-0000-00000000000b', 1, true, '10:00', '18:00');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select business_id from public.business_hours order by business_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s hours, never org_b''s'
);

insert into _tap_results select throws_ok(
  $$ insert into public.business_hours (business_id, day_of_week, is_open, start_time, end_time)
     values ('00000000-0000-0000-0000-00000000000b', 2, true, '08:00', '16:00') $$,
  '42501',
  null,
  'org_a session cannot insert business hours under org_b''s business id'
);

update public.business_hours set start_time = '00:00' where business_id = '00000000-0000-0000-0000-00000000000b';

reset role;
insert into _tap_results select is(
  (select start_time::text from public.business_hours where business_id = '00000000-0000-0000-0000-00000000000b' and day_of_week = 1),
  '10:00:00',
  'org_a session cannot mutate org_b''s business hours (no rows affected, not an error)'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
