-- Tenant-isolation test for public.copilot_dismissals (full CRUD for
-- authenticated, same shape as sales_tasks -- Phase 30 follow-up: Copilot
-- item lifecycle dismiss/auto-resurface). Same fixture/session-simulation
-- style as 039_sales_tasks_and_notifications_tenant_isolation.sql: cross-
-- tenant read isolation, a forged insert denied, cross-tenant update/
-- delete affecting zero rows, org_a deleting its own row (the "Undo"
-- path), and the unique(business_id, customer_id) constraint that backs
-- the upsert-on-dismiss contract.

begin;
select plan(6);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.customers (id, business_id, display_name)
values
  ('c0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Alice'),
  ('c0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Bob');

insert into public.copilot_dismissals (id, business_id, customer_id, reason_keys, dismissed_by)
values
  ('d0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', array['lead_score'], 'user_test_a'),
  ('d0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', array['lead_score'], 'user_test_b');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select id from public.copilot_dismissals order by id $$,
  $$ values ('d0000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s copilot_dismissals row'
);

insert into _tap_results select throws_ok(
  $$ insert into public.copilot_dismissals (business_id, customer_id, reason_keys, dismissed_by)
     values ('00000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', array['stalled'], 'user_test_a') $$,
  '42501',
  null,
  'org_a session cannot create a copilot_dismissals row claiming org_b''s business_id'
);

update public.copilot_dismissals set reason_keys = array['human_controlled'] where id = 'd0000000-0000-0000-0000-00000000000b';
delete from public.copilot_dismissals where id = 'd0000000-0000-0000-0000-00000000000b';

reset role;
insert into _tap_results select is(
  (select reason_keys from public.copilot_dismissals where id = 'd0000000-0000-0000-0000-00000000000b'),
  array['lead_score'],
  'org_a session cannot update org_b''s copilot_dismissals row (no rows affected, not an error)'
);

insert into _tap_results select isnt_empty(
  $$ select id from public.copilot_dismissals where id = 'd0000000-0000-0000-0000-00000000000b' $$,
  'org_a session cannot delete org_b''s copilot_dismissals row (no rows affected, not an error)'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select lives_ok(
  $$ delete from public.copilot_dismissals where id = 'd0000000-0000-0000-0000-00000000000a' $$,
  'org_a session can delete (Undo) its own copilot_dismissals row'
);

insert into public.copilot_dismissals (id, business_id, customer_id, reason_keys, dismissed_by)
values ('d0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', array['needs_attention'], 'user_test_a');

insert into _tap_results select throws_ok(
  $$ insert into public.copilot_dismissals (business_id, customer_id, reason_keys, dismissed_by)
     values ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', array['stalled'], 'user_test_a') $$,
  '23505',
  null,
  'a second dismissal at the same (business_id, customer_id) is rejected by the unique constraint'
);

reset role;
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
