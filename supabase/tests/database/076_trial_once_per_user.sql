-- One free trial per Clerk USER as well as per organisation (migration
-- 20261124000200). The user comes from the session JWT's `sub` claim.
--  - a user's first business gets a trial and a trial_user_grants row;
--  - the same user in a NEW organisation gets an 'expired' row, and that
--    organisation is NOT marked as having had a trial;
--  - after deleting the business the grant survives;
--  - a different user in another organisation still gets a trial;
--  - an insert with no `sub` keeps the org-only rule;
--  - trial_user_grants is unreadable/unwritable from a customer session.

begin;
select plan(10);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated, service_role;

select set_config('request.jwt.claims', json_build_object('sub', 'user_trial_1', 'o', json_build_object('id', 'org_u1_a'))::text, true);
insert into public.businesses (id, clerk_org_id, name) values
  ('00000000-0000-0000-0000-0000000076a1', 'org_u1_a', 'User 1 first');

insert into _tap_results select is(
  (select status from public.subscriptions where business_id = '00000000-0000-0000-0000-0000000076a1'),
  'trialing', 'a user''s first business gets a trial'
);
insert into _tap_results select is(
  (select clerk_org_id from public.trial_user_grants where clerk_user_id = 'user_trial_1'),
  'org_u1_a', 'the trial is recorded against the Clerk user'
);

-- The same user deletes it and starts a new organisation.
delete from public.businesses where id = '00000000-0000-0000-0000-0000000076a1';
insert into _tap_results select is(
  (select count(*)::int from public.trial_user_grants where clerk_user_id = 'user_trial_1'),
  1, 'the user grant survives deleting the business'
);

select set_config('request.jwt.claims', json_build_object('sub', 'user_trial_1', 'o', json_build_object('id', 'org_u1_b'))::text, true);
insert into public.businesses (id, clerk_org_id, name) values
  ('00000000-0000-0000-0000-0000000076a2', 'org_u1_b', 'User 1 second org');

insert into _tap_results select is(
  (select status from public.subscriptions where business_id = '00000000-0000-0000-0000-0000000076a2'),
  'expired', 'the same user in a new organisation gets no second trial'
);
insert into _tap_results select ok(
  (select trial_started_at is null from public.subscriptions where business_id = '00000000-0000-0000-0000-0000000076a2'),
  'no trial window on the refused business'
);
insert into _tap_results select is(
  (select count(*)::int from public.trial_grants where clerk_org_id = 'org_u1_b'),
  0, 'the new organisation is not marked as having had a trial'
);

-- A different user, a different organisation: still a trial.
select set_config('request.jwt.claims', json_build_object('sub', 'user_trial_2', 'o', json_build_object('id', 'org_u2'))::text, true);
insert into public.businesses (id, clerk_org_id, name) values
  ('00000000-0000-0000-0000-0000000076b1', 'org_u2', 'User 2');
insert into _tap_results select is(
  (select status from public.subscriptions where business_id = '00000000-0000-0000-0000-0000000076b1'),
  'trialing', 'a different user still gets their own trial'
);

-- No `sub` (service-role / SQL insert): the org-only rule applies.
select set_config('request.jwt.claims', '', true);
insert into public.businesses (id, clerk_org_id, name) values
  ('00000000-0000-0000-0000-0000000076c1', 'org_no_sub', 'No sub');
insert into _tap_results select is(
  (select status from public.subscriptions where business_id = '00000000-0000-0000-0000-0000000076c1'),
  'trialing', 'an insert without a user keeps the org-only rule'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'user_trial_2', 'role', 'authenticated', 'o', json_build_object('id', 'org_u2'))::text, true);
insert into _tap_results select throws_ok(
  $$ select * from public.trial_user_grants $$, '42501', null, 'a customer session cannot read trial_user_grants'
);
insert into _tap_results select throws_ok(
  $$ delete from public.trial_user_grants where clerk_user_id = 'user_trial_2' $$, '42501', null, 'a customer session cannot delete its trial grant'
);

reset role;
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
