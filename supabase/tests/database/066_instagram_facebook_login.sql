-- Instagram API with Facebook Login (migration 20261114000000).
-- The new Facebook ids on instagram_connections stay RLS-scoped to the
-- caller's own business; login_mode only accepts the two known values; the
-- Page token table and pending selections keep their zero authenticated grant.

begin;
select plan(5);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.instagram_connections
  (business_id, instagram_business_account_id, status, login_mode, facebook_user_id, facebook_page_id, facebook_page_name)
values
  ('00000000-0000-0000-0000-00000000000a', 'ig_account_a', 'connected', 'facebook', 'fb_user_a', 'page_a', 'Page A'),
  ('00000000-0000-0000-0000-00000000000b', 'ig_account_b', 'connected', 'facebook', 'fb_user_b', 'page_b', 'Page B');

insert into _tap_results select throws_ok(
  $$ update public.instagram_connections set login_mode = 'instagram'
     where business_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514',
  null,
  'login_mode only accepts unified or facebook'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select login_mode, facebook_user_id, facebook_page_id from public.instagram_connections $$,
  $$ values ('facebook'::text, 'fb_user_a'::text, 'page_a'::text) $$,
  'org_a sees only its own Facebook user and Page ids'
);

insert into _tap_results select is_empty(
  $$ update public.instagram_connections set facebook_page_id = 'hijack'
     where business_id = '00000000-0000-0000-0000-00000000000b' returning id $$,
  'org_a cannot change Business B''s Page id'
);

insert into _tap_results select throws_ok(
  $$ select access_token_encrypted from public.instagram_credentials $$,
  '42501',
  null,
  'org_a session cannot read stored Page access tokens'
);

insert into _tap_results select throws_ok(
  $$ select facebook_user_id from public.instagram_pending_selections $$,
  '42501',
  null,
  'org_a session cannot read pending selections (they hold a user token)'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
