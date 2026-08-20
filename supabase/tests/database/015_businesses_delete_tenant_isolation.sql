-- Tenant-isolation test for the new businesses DELETE policy (AGENTS.md
-- §7 / Phase 22e exit criterion): a session can delete its own
-- business (cascading to everything it owns), but never another
-- business's row.
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.

begin;
select plan(3);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.products (business_id, name)
values ('00000000-0000-0000-0000-00000000000a', 'Widget A');

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

insert into _tap_results select is(
  (with deleted as (
    delete from public.businesses where id = '00000000-0000-0000-0000-00000000000b' returning id
  ) select count(*)::int from deleted),
  0,
  'org_a session''s delete of org_b''s business row affects zero rows (RLS-filtered, not an error)'
);

insert into _tap_results select ok(
  exists (select 1 from public.businesses where id = '00000000-0000-0000-0000-00000000000b'),
  'org_b''s business row is untouched after org_a''s attempted delete'
);

delete from public.businesses where id = '00000000-0000-0000-0000-00000000000a';

reset role;

insert into _tap_results select ok(
  not exists (select 1 from public.products where business_id = '00000000-0000-0000-0000-00000000000a'),
  'deleting a business as its own org cascades to its products -- no residual row'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
