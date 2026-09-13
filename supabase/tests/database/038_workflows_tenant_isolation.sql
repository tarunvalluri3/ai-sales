-- Tenant-isolation test for public.workflows and public.workflow_runs
-- (Phase 29). workflows is full CRUD for `authenticated` (RLS is the
-- floor, business match only -- same shape as segments/lead_tags).
-- workflow_runs additionally proves its insert policy's cross-entity
-- exists() check: a forged insert naming org_a's own business_id but
-- org_b's real workflow_id must still be denied, the same defense-in-depth
-- pattern 034_lead_tags_tenant_isolation.sql already proved for its own
-- join tables.

begin;
select plan(9);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.workflows (id, business_id, name, trigger_type, match_type, conditions, steps)
values
  ('c0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Notify on hot lead', 'lead_created', 'all', '[]'::jsonb, '[{"type":"internal_notification","message":"hi"}]'::jsonb),
  ('c0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Notify on hot lead', 'lead_created', 'all', '[]'::jsonb, '[{"type":"internal_notification","message":"hi"}]'::jsonb);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select id from public.workflows order by id $$,
  $$ values ('c0000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s workflow, never org_b''s'
);

insert into _tap_results select throws_ok(
  $$ insert into public.workflows (business_id, name, trigger_type, match_type, conditions, steps)
     values ('00000000-0000-0000-0000-00000000000b', 'Forged', 'lead_created', 'all', '[]'::jsonb, '[{"type":"flag_attention"}]'::jsonb) $$,
  '42501',
  null,
  'org_a session cannot create a workflow claiming org_b''s business_id'
);

insert into _tap_results select lives_ok(
  $$ insert into public.workflow_runs (business_id, workflow_id, trigger_event, target_type, target_id, status, steps)
     values ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'lead_created', 'lead', '30000000-0000-0000-0000-00000000000a', 'queued', '[]'::jsonb) $$,
  'org_a session can create a run for its own workflow'
);

insert into _tap_results select throws_ok(
  $$ insert into public.workflow_runs (business_id, workflow_id, trigger_event, target_type, target_id, status, steps)
     values ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000b', 'lead_created', 'lead', '30000000-0000-0000-0000-00000000000a', 'queued', '[]'::jsonb) $$,
  '42501',
  null,
  'org_a session cannot create a run naming org_b''s real workflow_id, even under its own business_id (the insert policy''s exists() check catches the mismatch)'
);

insert into _tap_results select results_eq(
  $$ select business_id from public.workflow_runs order by business_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s workflow_runs row'
);

update public.workflows set name = 'Hacked' where id = 'c0000000-0000-0000-0000-00000000000b';
delete from public.workflows where id = 'c0000000-0000-0000-0000-00000000000b';

reset role;
insert into _tap_results select is(
  (select name from public.workflows where id = 'c0000000-0000-0000-0000-00000000000b'),
  'Notify on hot lead',
  'org_a session cannot rename org_b''s workflow (no rows affected, not an error)'
);

insert into _tap_results select is(
  (select count(*) from public.workflows where id = 'c0000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'org_a session cannot delete org_b''s workflow (no rows affected)'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select throws_ok(
  $$ delete from public.workflow_runs where business_id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'no DELETE grant exists on workflow_runs for authenticated -- a run is cancelled via UPDATE, never removed'
);

insert into _tap_results select lives_ok(
  $$ update public.workflow_runs set status = 'cancelled' where business_id = '00000000-0000-0000-0000-00000000000a' $$,
  'org_a session can update (cancel) its own run'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
