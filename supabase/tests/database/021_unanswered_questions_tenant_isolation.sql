-- Tenant-isolation test for public.unanswered_questions (AGENTS.md §7 /
-- Phase 25b). Same shape as 012_ai_response_metrics_tenant_isolation.sql.

begin;
select plan(2);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.conversations (id, business_id, source)
values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'test'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'test');

insert into public.unanswered_questions (business_id, conversation_id, question)
values
  ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Do you ship internationally?'),
  ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'What are your business hours?');

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
  $$ select business_id from public.unanswered_questions order by business_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s unanswered questions, never org_b''s'
);

insert into _tap_results select throws_ok(
  $$ insert into public.unanswered_questions (business_id, conversation_id, question)
     values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'test') $$,
  '42501',
  null,
  'org_a session cannot insert an unanswered question -- only the service role writes to this table'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
