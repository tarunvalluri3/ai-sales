-- Tenant-isolation test for public.ai_response_cache (Phase 23).
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

insert into public.ai_response_cache (business_id, question_hash, answer, used_context, expires_at)
values
  ('00000000-0000-0000-0000-00000000000a', 'hash_a', 'Answer A', true, now() + interval '1 hour'),
  ('00000000-0000-0000-0000-00000000000b', 'hash_b', 'Answer B', true, now() + interval '1 hour');

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

insert into _tap_results select throws_ok(
  $$ select id from public.ai_response_cache $$,
  '42501',
  null,
  'authenticated has no read access to ai_response_cache -- service role only'
);

insert into _tap_results select throws_ok(
  $$ insert into public.ai_response_cache (business_id, question_hash, answer, used_context, expires_at)
     values ('00000000-0000-0000-0000-00000000000a', 'hash_c', 'Answer C', true, now() + interval '1 hour') $$,
  '42501',
  null,
  'org_a session cannot insert into ai_response_cache -- only the service role writes to this table'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
