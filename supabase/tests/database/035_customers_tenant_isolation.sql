-- Tenant-isolation test for public.customers (Phase 28: Customer
-- Intelligence foundation) plus the column-scoped grant decisions the
-- migration made: `authenticated` gets SELECT (whole row) and UPDATE
-- scoped to `display_name` only -- no INSERT/DELETE grant at all (only
-- the service-role identity-resolution path creates customers), and
-- `conversations.customer_id` deliberately has no `authenticated` grant
-- (service-role-write-only, same posture as `needs_attention`).
--
-- Same session-simulation technique as 001_businesses_tenant_isolation.sql.

begin;
select plan(8);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.customers (id, business_id, display_name, email, phone)
values
  ('90000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Alice A', 'alice@example.com', null),
  ('90000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Bob B', 'bob@example.com', null);

insert into public.conversations (id, business_id, source, customer_id)
values ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'test', '90000000-0000-0000-0000-00000000000a');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select id from public.customers order by id $$,
  $$ values ('90000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s customer, never org_b''s'
);

insert into _tap_results select throws_ok(
  $$ insert into public.customers (business_id, display_name)
     values ('00000000-0000-0000-0000-00000000000a', 'Forged') $$,
  '42501',
  null,
  'org_a session cannot insert a customer row at all -- no INSERT grant exists (only the service-role identity-resolution path creates customers)'
);

insert into _tap_results select lives_ok(
  $$ update public.customers set display_name = 'Alice Renamed' where id = '90000000-0000-0000-0000-00000000000a' $$,
  'org_a session can rename its own customer (display_name is the one column-scoped grant)'
);

insert into _tap_results select throws_ok(
  $$ update public.customers set email = 'hacked@example.com' where id = '90000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'org_a session cannot update its own customer''s email -- only display_name is grant-scoped for authenticated'
);

insert into _tap_results select throws_ok(
  $$ update public.conversations set customer_id = '90000000-0000-0000-0000-00000000000a' where id = '20000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'org_a session cannot set conversations.customer_id -- service-role-write-only, same posture as needs_attention'
);

update public.customers set display_name = 'Bob Hacked' where id = '90000000-0000-0000-0000-00000000000b';

reset role;
insert into _tap_results select is(
  (select display_name from public.customers where id = '90000000-0000-0000-0000-00000000000b'),
  'Bob B',
  'org_a session cannot rename org_b''s customer (no rows affected, not an error)'
);

insert into _tap_results select is(
  (select display_name from public.customers where id = '90000000-0000-0000-0000-00000000000a'),
  'Alice Renamed',
  'org_a session''s own rename from earlier genuinely persisted'
);

insert into _tap_results select is(
  (select customer_id from public.conversations where id = '20000000-0000-0000-0000-00000000000a'),
  '90000000-0000-0000-0000-00000000000a'::uuid,
  'the conversation''s customer_id set during fixture setup (as postgres) is untouched by the denied authenticated attempt'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
