-- Instagram API with Unified Login (migration 20261112000000).
-- instagram_pending_selections holds a live (encrypted) token while a client
-- picks which shared Instagram account to connect: zero `authenticated`
-- grant, proven as a bare select/insert denial. The new identifying columns
-- on instagram_connections stay RLS-scoped to the caller's own business.

begin;
select plan(5);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.instagram_connections
  (business_id, instagram_business_account_id, status, meta_system_user_id, client_business_id)
values
  ('00000000-0000-0000-0000-00000000000a', 'ig_account_a', 'connected', 'su_a', 'cb_a'),
  ('00000000-0000-0000-0000-00000000000b', 'ig_account_b', 'connected', 'su_b', 'cb_b');

insert into public.instagram_pending_selections
  (business_id, initiated_by_user_id, access_token_encrypted, meta_system_user_id, client_business_id, accounts, expires_at)
values
  ('00000000-0000-0000-0000-00000000000b', 'user_test_b', 'v1.x.y.z', 'su_b', 'cb_b',
   '[{"id":"1","username":"b1"},{"id":"2","username":"b2"}]'::jsonb, now() + interval '15 minutes');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select throws_ok(
  $$ select * from public.instagram_pending_selections $$,
  '42501',
  null,
  'org_a session cannot select from instagram_pending_selections at all (zero authenticated grant)'
);

insert into _tap_results select throws_ok(
  $$ insert into public.instagram_pending_selections
       (business_id, initiated_by_user_id, access_token_encrypted, meta_system_user_id, accounts, expires_at)
     values ('00000000-0000-0000-0000-00000000000a', 'user_test_a', 't', 's', '[]'::jsonb, now()) $$,
  '42501',
  null,
  'org_a session cannot insert into instagram_pending_selections'
);

insert into _tap_results select results_eq(
  $$ select meta_system_user_id, client_business_id from public.instagram_connections $$,
  $$ values ('su_a'::text, 'cb_a'::text) $$,
  'org_a sees only its own system user id and client business id'
);

insert into _tap_results select throws_ok(
  $$ select access_token_encrypted from public.instagram_credentials $$,
  '42501',
  null,
  'org_a session cannot read encrypted Instagram tokens'
);

reset role;
insert into _tap_results select hasnt_column(
  'public', 'instagram_connections', 'token_expires_at',
  'the non-expiring system user token has no expiry column'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
