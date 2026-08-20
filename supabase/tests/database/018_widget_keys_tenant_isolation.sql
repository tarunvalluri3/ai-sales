-- Tenant-isolation test for public.widget_keys (Phase 24, AGENTS.md §7).
-- Confirms a session cannot see or insert/update another business's
-- widget keys -- the public chat widget's own resolution path
-- (lib/widget-auth.ts) uses the service role and bypasses RLS entirely,
-- so this test covers the dashboard-authenticated management path only.

begin;
select plan(4);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.widget_keys (id, business_id, allowed_origins)
values
  ('40000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', array['https://a.example.com']),
  ('40000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', array['https://b.example.com']);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select business_id from public.widget_keys order by business_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s widget keys, never org_b''s'
);

insert into _tap_results select lives_ok(
  $$ insert into public.widget_keys (business_id, allowed_origins)
     values ('00000000-0000-0000-0000-00000000000a', array['https://new.example.com']) $$,
  'org_a session can create a widget key for its own business'
);

insert into _tap_results select throws_ok(
  $$ insert into public.widget_keys (business_id, allowed_origins)
     values ('00000000-0000-0000-0000-00000000000b', array['https://evil.example.com']) $$,
  '42501',
  null,
  'org_a session cannot create a widget key under org_b''s business id'
);

update public.widget_keys set status = 'revoked' where id = '40000000-0000-0000-0000-00000000000b';

reset role;
insert into _tap_results select is(
  (select count(*) from public.widget_keys where id = '40000000-0000-0000-0000-00000000000b' and status = 'revoked'),
  0::bigint,
  'org_a session cannot revoke org_b''s widget key (no rows affected, not an error)'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
