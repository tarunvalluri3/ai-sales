-- Tenant-isolation test for public.business_readiness_dismissals
-- (feat/onboarding-readiness: the explicit "doesn't apply to us"
-- acknowledgement for a dismissible readiness item). Same
-- fixture/session-simulation style as
-- 040_copilot_dismissals_tenant_isolation.sql: cross-tenant read
-- isolation, a forged insert denied, cross-tenant update/delete affecting
-- zero rows, org_a clearing (restoring) its own acknowledgement, and the
-- primary-key uniqueness that backs the upsert-on-dismiss contract.

begin;
select plan(6);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.business_readiness_dismissals (business_id, item_key, dismissed_by)
values
  ('00000000-0000-0000-0000-00000000000a', 'catalog_present', 'user_test_a'),
  ('00000000-0000-0000-0000-00000000000b', 'catalog_present', 'user_test_b');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select business_id from public.business_readiness_dismissals order by business_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s readiness dismissal'
);

insert into _tap_results select throws_ok(
  $$ insert into public.business_readiness_dismissals (business_id, item_key, dismissed_by)
     values ('00000000-0000-0000-0000-00000000000b', 'catalog_present', 'user_test_a') $$,
  '42501',
  null,
  'org_a session cannot create a dismissal claiming org_b''s business_id'
);

update public.business_readiness_dismissals set dismissed_by = 'hijacked' where business_id = '00000000-0000-0000-0000-00000000000b';
delete from public.business_readiness_dismissals where business_id = '00000000-0000-0000-0000-00000000000b';

reset role;
insert into _tap_results select is(
  (select dismissed_by from public.business_readiness_dismissals where business_id = '00000000-0000-0000-0000-00000000000b'),
  'user_test_b',
  'org_a session cannot update org_b''s dismissal (no rows affected, not an error)'
);

insert into _tap_results select isnt_empty(
  $$ select business_id from public.business_readiness_dismissals where business_id = '00000000-0000-0000-0000-00000000000b' $$,
  'org_a session cannot delete org_b''s dismissal (no rows affected, not an error)'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select lives_ok(
  $$ delete from public.business_readiness_dismissals where business_id = '00000000-0000-0000-0000-00000000000a' $$,
  'org_a session can clear (restore) its own readiness dismissal'
);

insert into public.business_readiness_dismissals (business_id, item_key, dismissed_by)
values ('00000000-0000-0000-0000-00000000000a', 'catalog_present', 'user_test_a');

insert into _tap_results select throws_ok(
  $$ insert into public.business_readiness_dismissals (business_id, item_key, dismissed_by)
     values ('00000000-0000-0000-0000-00000000000a', 'catalog_present', 'user_test_a') $$,
  '23505',
  null,
  'a second dismissal at the same (business_id, item_key) is rejected by the primary key'
);

reset role;
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
