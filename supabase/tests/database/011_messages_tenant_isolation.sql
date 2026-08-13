-- Tenant-isolation test for public.messages (AGENTS.md §7 / Phase 11
-- exit criterion). Not run in this implementation environment (no Docker /
-- local Supabase instance available) -- written and reviewed only. Run
-- with: supabase test db
--
-- Same session-simulation technique as 009_conversations_tenant_isolation.sql.
-- messages has no authenticated INSERT policy at all (only the service
-- role writes, via lib/messages.ts) -- so this test only exercises SELECT
-- isolation and confirms INSERT is rejected outright for authenticated.

begin;
select plan(2);

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

insert into public.messages (id, business_id, conversation_id, role, content)
values
  ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'user', 'hello from A'),
  ('30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'user', 'hello from B');

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
  $$ select id from public.messages order by id $$,
  $$ values ('30000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s messages, never org_b''s'
);

select throws_ok(
  $$ insert into public.messages (business_id, conversation_id, role, content) values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'user', 'forged') $$,
  '42501',
  null,
  'org_a session cannot insert a message at all -- only the service role writes to this table'
);

reset role;

select * from finish();
rollback;
