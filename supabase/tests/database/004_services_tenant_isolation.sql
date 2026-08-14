-- Tenant-isolation test for public.services (AGENTS.md §7 / Phase 5 exit
-- criterion).
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.
--
-- Same session-simulation technique as 001_businesses_tenant_isolation.sql.

begin;
select plan(4);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.services (id, business_id, name)
values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Service A'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Service B');

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
  $$ select name from public.services order by name $$,
  $$ values ('Service A') $$,
  'org_a session sees only its own business''s services, never org_b''s'
);

insert into _tap_results select lives_ok(
  $$ update public.services set name = 'Service A updated' where id = '20000000-0000-0000-0000-00000000000a' $$,
  'org_a session can update its own service'
);

update public.services set name = 'Forged update' where id = '20000000-0000-0000-0000-00000000000b';

-- Checked via reset role (the unrestricted connecting role) -- see
-- 003_products_tenant_isolation.sql's comment for why (Phase 19b).
reset role;
insert into _tap_results select is(
  (select count(*) from public.services where id = '20000000-0000-0000-0000-00000000000b' and name = 'Forged update'),
  0::bigint,
  'org_a session cannot mutate org_b''s service (no rows affected, not an error)'
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
  $$ insert into public.services (business_id, name) values ('00000000-0000-0000-0000-00000000000b', 'Forged service') $$,
  '42501',
  null,
  'org_a session cannot insert a service claiming org_b''s business_id'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
