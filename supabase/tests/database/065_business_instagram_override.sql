-- businesses.instagram_enabled (migration 20261113000000): a customer's own
-- Clerk session can neither switch the override on for its business (no
-- UPDATE grant on the column) nor create a business with it already on
-- (restrictive INSERT policy). The service role can set it.

begin;
select plan(7);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated, service_role;

insert into public.businesses (id, clerk_org_id, name)
values ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A');

insert into _tap_results select is(
  (select instagram_enabled from public.businesses where id = '00000000-0000-0000-0000-00000000000a'),
  false,
  'businesses.instagram_enabled defaults to false'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select throws_ok(
  $$ update public.businesses set instagram_enabled = true where id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'org_a session cannot switch instagram_enabled on for its own business'
);

insert into _tap_results select lives_ok(
  $$ update public.businesses set description = 'still editable' where id = '00000000-0000-0000-0000-00000000000a' $$,
  'org_a session can still update its own granted profile columns'
);

reset role;
insert into _tap_results select is(
  (select instagram_enabled from public.businesses where id = '00000000-0000-0000-0000-00000000000a'),
  false,
  'instagram_enabled is still false after the customer update attempts'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_c', 'role', 'authenticated', 'o', json_build_object('id', 'org_c'))::text,
  true
);

insert into _tap_results select throws_ok(
  $$ insert into public.businesses (id, clerk_org_id, name, instagram_enabled)
     values ('00000000-0000-0000-0000-00000000000c', 'org_c', 'Business C', true) $$,
  '42501',
  null,
  'org_c session cannot create its business with instagram_enabled already on'
);

insert into _tap_results select lives_ok(
  $$ insert into public.businesses (id, clerk_org_id, name)
     values ('00000000-0000-0000-0000-00000000000c', 'org_c', 'Business C') $$,
  'org_c session can still create its own business normally'
);

-- The service role (the admin script's key) can set it.
reset role;
set local role service_role;
insert into _tap_results select lives_ok(
  $$ update public.businesses set instagram_enabled = true where id = '00000000-0000-0000-0000-00000000000a' $$,
  'the service role can switch instagram_enabled on'
);
reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
