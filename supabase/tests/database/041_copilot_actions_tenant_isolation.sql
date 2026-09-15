-- Tenant-isolation test for public.copilot_actions (Copilot Action
-- Lifecycle v2 -- select/insert/update for authenticated, NO delete grant
-- at all, since a copilot_actions row is permanent history, transitioned
-- only via UPDATE to `status`, same "history should never disappear"
-- posture as workflow_runs). Same fixture/session-simulation style as
-- 040_copilot_dismissals_tenant_isolation.sql, plus coverage this table
-- adds: the check constraints on action_type/status/the snoozed_until-
-- matches-status invariant, and the partial unique index that prevents
-- more than one active (open/snoozed) row per (business_id, customer_id,
-- action_type) while still allowing multiple resolved rows for the same
-- key (real history, e.g. a completed confirm_appointment from last
-- month coexisting with a fresh one this month).

begin;
select plan(12);
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

insert into public.copilot_actions (id, business_id, customer_id, action_type, status, reason_keys, title, recommended_action)
values
  ('d0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'follow_up', 'open', array['lead_score'], 'Follow up with prospect', 'Follow up and offer a consultation'),
  ('d0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', 'follow_up', 'open', array['lead_score'], 'Follow up with prospect', 'Follow up and offer a consultation');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select id from public.copilot_actions order by id $$,
  $$ values ('d0000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s copilot_actions row'
);

insert into _tap_results select throws_ok(
  $$ insert into public.copilot_actions (business_id, customer_id, action_type, reason_keys, title, recommended_action)
     values ('00000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', 'follow_up', array['stalled'], 'Follow up with prospect', 'Follow up') $$,
  '42501',
  null,
  'org_a session cannot create a copilot_actions row claiming org_b''s business_id'
);

update public.copilot_actions set priority = 999 where id = 'd0000000-0000-0000-0000-00000000000b';

insert into _tap_results select throws_ok(
  $$ delete from public.copilot_actions where id = 'd0000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'authenticated has no DELETE grant on copilot_actions at all -- a row is permanent history, transitioned only via UPDATE'
);

reset role;
insert into _tap_results select is(
  (select priority from public.copilot_actions where id = 'd0000000-0000-0000-0000-00000000000b'),
  0,
  'org_a session cannot mutate org_b''s copilot_actions row (no rows affected, not an error)'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

update public.copilot_actions set status = 'completed', completed_at = now(), completed_by = 'user_test_a' where id = 'd0000000-0000-0000-0000-00000000000a';

reset role;
insert into _tap_results select is(
  (select status from public.copilot_actions where id = 'd0000000-0000-0000-0000-00000000000a'),
  'completed',
  'org_a session can update its own copilot_actions row (e.g. completing it)'
);

insert into _tap_results select throws_ok(
  $$ insert into public.copilot_actions (business_id, customer_id, action_type, reason_keys, title, recommended_action)
     values ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'not_a_real_action', array['lead_score'], 'x', 'y') $$,
  '23514',
  null,
  'an invalid action_type is rejected by the check constraint'
);

insert into _tap_results select throws_ok(
  $$ insert into public.copilot_actions (business_id, customer_id, action_type, status, reason_keys, title, recommended_action)
     values ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'follow_up', 'not_a_real_status', array['lead_score'], 'x', 'y') $$,
  '23514',
  null,
  'an invalid status is rejected by the check constraint'
);

insert into _tap_results select throws_ok(
  $$ insert into public.copilot_actions (business_id, customer_id, action_type, status, reason_keys, title, recommended_action, snoozed_until)
     values ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'handle_attention', 'snoozed', array['needs_attention'], 'x', 'y', null) $$,
  '23514',
  null,
  'a "snoozed" row with no snoozed_until is rejected -- the two fields must never drift out of sync'
);

-- Duplicate-prevention: the completed row above already freed up
-- (business_id, customer_id, follow_up) for a fresh active occurrence --
-- a real "same problem happened again" case, not a duplicate.
insert into public.copilot_actions (id, business_id, customer_id, action_type, status, reason_keys, title, recommended_action)
values ('d0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'follow_up', 'open', array['stalled'], 'Follow up with prospect', 'Follow up');

insert into _tap_results select throws_ok(
  $$ insert into public.copilot_actions (business_id, customer_id, action_type, status, reason_keys, title, recommended_action)
     values ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'follow_up', 'open', array['stalled'], 'Follow up with prospect', 'Follow up') $$,
  '23505',
  null,
  'a second ACTIVE (open) action for the same (business_id, customer_id, action_type) is rejected -- at most one active occurrence at a time'
);

insert into _tap_results select lives_ok(
  $$ update public.copilot_actions set status = 'dismissed', dismissed_at = now(), dismissed_by = 'user_test_a'
     where id = 'd0000000-0000-0000-0000-00000000000c' $$,
  'resolving the newer active row (dismissing it) succeeds, coexisting with the earlier completed row for the same key as real history'
);

-- Regression coverage for a real bug this exact scenario caught live:
-- lib/copilot-actions.ts's supersedeCopilotActionRow/completeCopilotActionsForEvent/
-- supersedeCopilotActionsForEvent/syncCopilotActionOnDismiss all originally
-- resolved a `snoozed` row (which always carries a non-null snoozed_until)
-- to a terminal status without also clearing snoozed_until, tripping the
-- snoozed_until-matches-status check constraint and failing the whole
-- Today-tab reconciliation pass whenever a snoozed item's signal vanished.
insert into public.copilot_actions (id, business_id, customer_id, action_type, status, reason_keys, title, recommended_action, snoozed_until)
values ('d0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'confirm_appointment', 'snoozed', array['appointment_pending'], 'Confirm appointment', 'Confirm or decline the appointment', now() + interval '1 day');

insert into _tap_results select throws_ok(
  $$ update public.copilot_actions set status = 'superseded', superseded_at = now()
     where id = 'd0000000-0000-0000-0000-00000000000d' $$,
  '23514',
  null,
  'resolving a snoozed row to a terminal status WITHOUT clearing snoozed_until is rejected -- reproduces the exact bug that broke reconciliation live'
);

insert into _tap_results select lives_ok(
  $$ update public.copilot_actions set status = 'superseded', superseded_at = now(), snoozed_until = null
     where id = 'd0000000-0000-0000-0000-00000000000d' $$,
  'the fixed pattern -- clearing snoozed_until alongside the status change -- succeeds'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
