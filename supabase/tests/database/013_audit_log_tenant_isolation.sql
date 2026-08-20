-- Tenant-isolation test for public.audit_log (AGENTS.md §7 / Phase 22
-- exit criterion). Unlike ai_response_metrics, `authenticated` is allowed
-- to insert here (the audit trail is written by the same session that
-- performs the action, not the service role) -- so this test also checks
-- that a session cannot forge an entry under another business's id.
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.

begin;
select plan(3);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

-- Fixture setup as postgres (bypasses RLS -- this is seeding, not the
-- thing under test).
insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.knowledge_documents (id, business_id, source_type, title, content)
values
  ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'manual', 'Doc A', 'content'),
  ('30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'manual', 'Doc B', 'content');

insert into public.audit_log (business_id, actor_user_id, action, target_type, target_id)
values
  ('00000000-0000-0000-0000-00000000000a', 'user_a', 'knowledge.deleted', 'knowledge_document', '30000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b', 'user_b', 'knowledge.deleted', 'knowledge_document', '30000000-0000-0000-0000-00000000000b');

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
  $$ select business_id from public.audit_log order by business_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s audit log entries, never org_b''s'
);

insert into _tap_results select lives_ok(
  $$ insert into public.audit_log (business_id, actor_user_id, action, target_type, target_id)
     values ('00000000-0000-0000-0000-00000000000a', 'user_test_a', 'conversation.attention_dismissed', 'conversation', '30000000-0000-0000-0000-00000000000a') $$,
  'org_a session can insert an audit log entry for its own business'
);

insert into _tap_results select throws_ok(
  $$ insert into public.audit_log (business_id, actor_user_id, action, target_type, target_id)
     values ('00000000-0000-0000-0000-00000000000b', 'user_test_a', 'conversation.attention_dismissed', 'conversation', '30000000-0000-0000-0000-00000000000b') $$,
  '42501',
  null,
  'org_a session cannot insert an audit log entry under org_b''s business id'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
