-- Tenant-isolation test for public.ai_response_metrics (AGENTS.md §7 /
-- Phase 21 exit criterion).
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.

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

insert into public.ai_response_metrics (business_id, conversation_id, latency_ms, input_tokens, output_tokens)
values
  ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 1200, 500, 80),
  ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 900, 400, 60);

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
  $$ select business_id from public.ai_response_metrics order by business_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s AI response metrics, never org_b''s'
);

insert into _tap_results select throws_ok(
  $$ insert into public.ai_response_metrics (business_id, conversation_id, latency_ms, input_tokens, output_tokens)
     values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 100, 10, 10) $$,
  '42501',
  null,
  'org_a session cannot insert an AI response metric -- only the service role writes to this table'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
