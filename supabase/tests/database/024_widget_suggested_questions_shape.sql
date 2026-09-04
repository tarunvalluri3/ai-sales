-- Tests for businesses.widget_suggested_questions (Phase 25e) -- the
-- businesses_widget_suggested_questions_shape check constraint and the
-- column-scoped grant's tenant isolation, neither previously covered by
-- pgTAP (STATE.md backlog item 8). The AI-generation/save Server Action
-- flow itself (dashboard/widget-settings's "Generate with AI"/Save) is
-- plain TypeScript with no separate database object to test here -- this
-- file covers only the database-layer contract that flow writes through.
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.
--
-- Same session-simulation technique as 001_businesses_tenant_isolation.sql.

begin;
select plan(6);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

-- Fixture setup as postgres (bypasses RLS -- this is seeding, not the
-- thing under test).
insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into _tap_results select lives_ok(
  $$ update public.businesses set widget_suggested_questions = null where id = '00000000-0000-0000-0000-00000000000a' $$,
  'null is allowed by businesses_widget_suggested_questions_shape'
);

insert into _tap_results select lives_ok(
  $$ update public.businesses set widget_suggested_questions = '["q1","q2","q3","q4","q5","q6"]'::jsonb where id = '00000000-0000-0000-0000-00000000000a' $$,
  'a 6-element array (the max) is allowed by businesses_widget_suggested_questions_shape'
);

insert into _tap_results select throws_ok(
  $$ update public.businesses set widget_suggested_questions = '["q1","q2","q3","q4","q5","q6","q7"]'::jsonb where id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514',
  null,
  'a 7-element array is rejected by businesses_widget_suggested_questions_shape'
);

insert into _tap_results select throws_ok(
  $$ update public.businesses set widget_suggested_questions = '{"not":"an array"}'::jsonb where id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514',
  null,
  'a non-array jsonb value is rejected by businesses_widget_suggested_questions_shape'
);

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

insert into _tap_results select lives_ok(
  $$ update public.businesses set widget_suggested_questions = '["q1","q2"]'::jsonb where id = '00000000-0000-0000-0000-00000000000a' $$,
  'org_a session can update its own business''s widget_suggested_questions'
);

update public.businesses set widget_suggested_questions = '["forged"]'::jsonb
  where id = '00000000-0000-0000-0000-00000000000b';

-- Checked via reset role (the unrestricted connecting role) -- see
-- 003_products_tenant_isolation.sql's comment for why (Phase 19b).
reset role;
insert into _tap_results select is(
  (select widget_suggested_questions from public.businesses where id = '00000000-0000-0000-0000-00000000000b'),
  null::jsonb,
  'org_a session cannot set org_b''s widget_suggested_questions (no rows affected, not an error -- businesses_update_own_org RLS)'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
