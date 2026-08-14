-- Tenant-isolation test for public.products (AGENTS.md §7 / Phase 5 exit
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

-- Fixture setup as postgres (bypasses RLS — this is seeding, not the
-- thing under test).
insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.products (id, business_id, name)
values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Product A'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Product B');

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
  $$ select name from public.products order by name $$,
  $$ values ('Product A') $$,
  'org_a session sees only its own business''s products, never org_b''s'
);

insert into _tap_results select lives_ok(
  $$ update public.products set name = 'Product A updated' where id = '10000000-0000-0000-0000-00000000000a' $$,
  'org_a session can update its own product'
);

update public.products set name = 'Forged update' where id = '10000000-0000-0000-0000-00000000000b';

-- Checked via reset role (the unrestricted connecting role), not the
-- org_a-scoped session that just attempted the forged update -- that
-- session's own SELECT policy can never see org_b's row at all, so a
-- count(*) run under it would read 0 regardless of whether the update
-- actually succeeded, proving nothing (Phase 19b,
-- docs/phase-19-audit-findings.md's follow-up test-correctness fix).
reset role;
insert into _tap_results select is(
  (select count(*) from public.products where id = '10000000-0000-0000-0000-00000000000b' and name = 'Forged update'),
  0::bigint,
  'org_a session cannot mutate org_b''s product (no rows affected, not an error)'
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
  $$ insert into public.products (business_id, name) values ('00000000-0000-0000-0000-00000000000b', 'Forged product') $$,
  '42501',
  null,
  'org_a session cannot insert a product claiming org_b''s business_id'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
