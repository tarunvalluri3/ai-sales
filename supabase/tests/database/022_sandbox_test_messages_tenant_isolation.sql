-- Tenant-isolation test for the new messages_insert_sandbox_test RLS
-- policy (Phase 25c, 20260824010000_allow_sandbox_test_messages.sql) --
-- the first policy that ever lets `authenticated` insert a 'user'/
-- 'assistant' message (previously only 'human_agent', see
-- 011_messages_tenant_isolation.sql). Same session-simulation technique
-- as that file.

begin;
select plan(3);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.conversations (id, business_id, source)
values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'dashboard_test'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'dashboard_test'),
  ('20000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'chat_widget');

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

insert into _tap_results select lives_ok(
  $$ insert into public.messages (business_id, conversation_id, role, content)
     values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'user', 'hello, testing my own AI') $$,
  'org_a session can insert a user message into its own dashboard_test conversation'
);

insert into _tap_results select throws_ok(
  $$ insert into public.messages (business_id, conversation_id, role, content)
     values ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'user', 'forged from org_a') $$,
  '42501',
  null,
  'org_a session cannot insert a sandbox message into org_b''s dashboard_test conversation'
);

insert into _tap_results select throws_ok(
  $$ insert into public.messages (business_id, conversation_id, role, content)
     values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000c', 'user', 'sneaking into a real conversation') $$,
  '42501',
  null,
  'org_a session cannot insert into its own real (non-sandbox) conversation -- only source=dashboard_test qualifies'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
