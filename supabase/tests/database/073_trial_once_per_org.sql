-- One free trial per Clerk organisation, ever (migration 20261121000000):
-- the first business for an org gets a trial and a trial_grants row; deleting
-- it and creating another business for the same org gets an 'expired' row
-- (no paid access); a different org still gets its own trial; trial_grants is
-- unreadable from a customer session.

begin;
select plan(8);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated, service_role;

insert into public.businesses (id, clerk_org_id, name) values
  ('00000000-0000-0000-0000-0000000073a1', 'org_trial_a', 'Trial A');

insert into _tap_results select is(
  (select status from public.subscriptions where business_id = '00000000-0000-0000-0000-0000000073a1'),
  'trialing', 'the first business for an organisation gets a trial'
);

insert into _tap_results select is(
  (select count(*)::int from public.trial_grants where clerk_org_id = 'org_trial_a'),
  1, 'the trial grant is recorded for the organisation'
);

delete from public.businesses where id = '00000000-0000-0000-0000-0000000073a1';

insert into _tap_results select is(
  (select count(*)::int from public.trial_grants where clerk_org_id = 'org_trial_a'),
  1, 'the trial grant survives deleting the business'
);

insert into public.businesses (id, clerk_org_id, name) values
  ('00000000-0000-0000-0000-0000000073a2', 'org_trial_a', 'Trial A again');

insert into _tap_results select is(
  (select status from public.subscriptions where business_id = '00000000-0000-0000-0000-0000000073a2'),
  'expired', 'delete + recreate for the same organisation does not get a second trial'
);

insert into _tap_results select ok(
  (select trial_started_at is null from public.subscriptions where business_id = '00000000-0000-0000-0000-0000000073a2'),
  'the recreated business has no trial window'
);

insert into public.businesses (id, clerk_org_id, name) values
  ('00000000-0000-0000-0000-0000000073b1', 'org_trial_b', 'Trial B');

insert into _tap_results select is(
  (select status from public.subscriptions where business_id = '00000000-0000-0000-0000-0000000073b1'),
  'trialing', 'a different organisation still gets its own trial'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'user_b', 'role', 'authenticated', 'o', json_build_object('id', 'org_trial_b'))::text, true);
insert into _tap_results select throws_ok(
  $$ select * from public.trial_grants $$, '42501', null, 'a customer session cannot read trial_grants'
);
insert into _tap_results select throws_ok(
  $$ delete from public.trial_grants where clerk_org_id = 'org_trial_b' $$, '42501', null, 'a customer session cannot delete its trial grant'
);

reset role;
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
