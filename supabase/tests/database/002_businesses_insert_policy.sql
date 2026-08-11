-- Tenant-isolation test for the businesses INSERT policy (Phase 4,
-- AGENTS.md §7 requirement).
--
-- Not run in this implementation environment (no Docker / local Supabase
-- instance available) — written and reviewed only. Run with:
--   supabase test db
--
-- Same session-simulation technique as
-- 001_businesses_tenant_isolation.sql: set_config('request.jwt.claims', ...)
-- + `set local role authenticated`.

begin;
select plan(2);

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

select lives_ok(
  $$ insert into public.businesses (clerk_org_id, name) values ('org_a', 'Business A') $$,
  'org_a session can insert a business row for its own org'
);

select throws_ok(
  $$ insert into public.businesses (clerk_org_id, name) values ('org_b', 'Business B') $$,
  '42501',
  null,
  'org_a session cannot insert a business row for a different org'
);

reset role;

select * from finish();
rollback;
