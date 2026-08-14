-- Tenant-isolation test for public.businesses (AGENTS.md §7 requirement).
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs), not a local Docker stack -- see Phase
-- 19b's "pgTAP live wiring" (docs/phase-19-audit-findings.md §9,
-- prompts/phase-19b-production-hardening-remediation.md). Wrapped in a
-- temporary results table because `supabase db query --file` only
-- returns the *last* statement's result set, not every statement's --
-- without this, an early assertion's failure would be silently dropped.
--
-- Simulates two different Clerk organizations' sessions via
-- set_config('request.jwt.claims', ...) + `set local role authenticated`,
-- since this project uses Clerk as a third-party auth provider (custom
-- "o.id" claim, no auth.users rows) rather than Supabase's own auth model
-- — the basejump `tests.authenticate_as()` helper does not apply here.
--
-- Before trusting this technique, confirm auth.jwt() actually reads from
-- the `request.jwt.claims` GUC in your local Postgres instance, e.g.:
--   select prosrc from pg_proc where proname = 'jwt' and pronamespace = 'auth'::regnamespace;

begin;
select plan(2);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

-- Fixture setup as postgres (bypasses RLS — this is seeding, not the
-- thing under test).
insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

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
  $$ select clerk_org_id from public.businesses order by clerk_org_id $$,
  $$ values ('org_a') $$,
  'org_a session sees only its own business row, never org_b''s'
);

reset role;

-- Simulate a signed-in user whose active Clerk organization is org_b.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'user_test_b',
    'role', 'authenticated',
    'o', json_build_object('id', 'org_b')
  )::text,
  true
);

insert into _tap_results select results_eq(
  $$ select clerk_org_id from public.businesses order by clerk_org_id $$,
  $$ values ('org_b') $$,
  'org_b session sees only its own business row, never org_a''s'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
