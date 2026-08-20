-- Tenant-isolation test for the new businesses DELETE policy (AGENTS.md
-- §7 / Phase 22e exit criterion): a session can delete its own
-- business (cascading to everything it owns), but never another
-- business's row.
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.

begin;
select plan(2);
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

-- DIAGNOSTIC (temporary): confirm what this session actually resolves
-- before trusting the delete's outcome.
insert into _tap_results select diag(
  format(
    'jwt org=%s current_user=%s policies=%s',
    (select auth.jwt() -> 'o' ->> 'id'),
    current_user,
    (select string_agg(polname || ':' || polcmd::text, ',') from pg_policy pol join pg_class c on c.oid = pol.polrelid where c.relname = 'businesses')
  )
);

-- Plain top-level DELETE, not wrapped in any pgTAP helper -- RLS's
-- `using` clause makes org_b's row invisible to this DELETE, so it
-- affects zero rows without erroring (unlike the INSERT case, which
-- throws on a with-check violation).
delete from public.businesses where id = '00000000-0000-0000-0000-00000000000b';

insert into _tap_results select ok(
  exists (select 1 from public.businesses where id = '00000000-0000-0000-0000-00000000000b'),
  'org_a session cannot delete org_b''s business row -- it still exists afterward'
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
