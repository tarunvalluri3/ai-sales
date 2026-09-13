-- Tenant-isolation test for public.sales_tasks (full CRUD for
-- authenticated) and public.internal_notifications (select + insert +
-- update(read_at) only, no delete -- Phase 29). Also proves the
-- unique(workflow_run_id, step_index) idempotency constraint both tables
-- share: a second insert at the same (run, step) is rejected, the
-- concrete "must never execute twice" mechanism for workflow-created
-- rows, while two manually-created rows (both columns null) coexist
-- freely.

begin;
select plan(8);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.sales_tasks (id, business_id, title)
values
  ('d0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Call Alice'),
  ('d0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Call Bob');

insert into public.internal_notifications (id, business_id, message)
values
  ('e0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Hot lead: Alice'),
  ('e0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Hot lead: Bob');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select id from public.sales_tasks order by id $$,
  $$ values ('d0000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s sales_tasks row'
);

insert into _tap_results select results_eq(
  $$ select id from public.internal_notifications order by id $$,
  $$ values ('e0000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s internal_notifications row'
);

insert into _tap_results select throws_ok(
  $$ insert into public.sales_tasks (business_id, title) values ('00000000-0000-0000-0000-00000000000b', 'Forged') $$,
  '42501',
  null,
  'org_a session cannot create a sales_tasks row claiming org_b''s business_id'
);

insert into _tap_results select throws_ok(
  $$ update public.internal_notifications set message = 'hacked' where id = 'e0000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'org_a session cannot update internal_notifications.message -- only read_at is column-scoped for authenticated'
);

insert into _tap_results select lives_ok(
  $$ update public.internal_notifications set read_at = now() where id = 'e0000000-0000-0000-0000-00000000000a' $$,
  'org_a session can mark its own notification read'
);

update public.sales_tasks set title = 'Hacked' where id = 'd0000000-0000-0000-0000-00000000000b';

reset role;
insert into _tap_results select is(
  (select title from public.sales_tasks where id = 'd0000000-0000-0000-0000-00000000000b'),
  'Call Bob',
  'org_a session cannot mutate org_b''s sales_tasks row (no rows affected, not an error)'
);

-- Idempotency: two manually-created tasks (workflow_run_id/step_index
-- both null) coexist freely; a second insert at the same
-- (workflow_run_id, step_index) pair is rejected.
insert into _tap_results select lives_ok(
  $$ insert into public.sales_tasks (business_id, title) values ('00000000-0000-0000-0000-00000000000a', 'Another manual task') $$,
  'a second manually-created task (null workflow_run_id/step_index) is not blocked by the unique constraint'
);

insert into public.workflows (id, business_id, name, trigger_type, match_type, conditions, steps)
values ('c0000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-00000000000a', 'Idempotency test', 'lead_created', 'all', '[]'::jsonb, '[{"type":"create_task","title":"x","description":null}]'::jsonb);
insert into public.workflow_runs (id, business_id, workflow_id, trigger_event, target_type, target_id, status, steps)
values ('f0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-0000000000f0', 'lead_created', 'lead', '30000000-0000-0000-0000-00000000000a', 'running', '[]'::jsonb);
insert into public.sales_tasks (business_id, title, workflow_run_id, step_index)
values ('00000000-0000-0000-0000-00000000000a', 'Workflow task', 'f0000000-0000-0000-0000-00000000000a', 0);

insert into _tap_results select throws_ok(
  $$ insert into public.sales_tasks (business_id, title, workflow_run_id, step_index)
     values ('00000000-0000-0000-0000-00000000000a', 'Duplicate workflow task', 'f0000000-0000-0000-0000-00000000000a', 0) $$,
  '23505',
  null,
  'a second create_task at the same (workflow_run_id, step_index) is rejected -- the concrete duplicate-execution-prevention mechanism'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
