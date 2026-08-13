-- Tenant-isolation test for public.conversations (AGENTS.md §7 / Phase 10
-- exit criterion). Not run in this implementation environment (no Docker /
-- local Supabase instance available) -- written and reviewed only. Run
-- with: supabase test db
--
-- Same session-simulation technique as 001_businesses_tenant_isolation.sql.

begin;
select plan(3);

-- Fixture setup as postgres (bypasses RLS -- this is seeding, not the
-- thing under test).
insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.conversations (id, business_id, source)
values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'test'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'test');

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

select results_eq(
  $$ select id from public.conversations order by id $$,
  $$ values ('20000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s conversations, never org_b''s'
);

select lives_ok(
  $$ insert into public.conversations (business_id, source) values ('00000000-0000-0000-0000-00000000000a', 'test') $$,
  'org_a session can insert a conversation for its own business'
);

select throws_ok(
  $$ insert into public.conversations (business_id, source) values ('00000000-0000-0000-0000-00000000000b', 'forged') $$,
  '42501',
  null,
  'org_a session cannot insert a conversation claiming org_b''s business_id'
);

reset role;

select * from finish();
rollback;
