-- Tenant-isolation test for public.messages (AGENTS.md §7 / Phase 11
-- exit criterion).
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.
--
-- Same session-simulation technique as 009_conversations_tenant_isolation.sql.
-- messages has no authenticated INSERT policy at all (only the service
-- role writes, via lib/messages.ts) -- so this test only exercises SELECT
-- isolation and confirms INSERT is rejected outright for authenticated.

begin;
select plan(2);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

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

insert into _tap_results select results_eq(
  $$ select id from public.messages order by id $$,
  $$ values ('30000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s messages, never org_b''s'
);

insert into _tap_results select throws_ok(
  $$ insert into public.messages (business_id, conversation_id, role, content) values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'user', 'forged') $$,
  '42501',
  null,
  'org_a session cannot insert a message at all -- only the service role writes to this table'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
