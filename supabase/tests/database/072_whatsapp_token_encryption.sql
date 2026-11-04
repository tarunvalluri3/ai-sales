-- WhatsApp token encryption (migration 20261120000000): a row may hold the
-- encrypted token instead of the plaintext one, but never neither, and the
-- table stays unreadable from a customer session.

begin;
select plan(4);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated, service_role;

insert into public.businesses (id, clerk_org_id, name) values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into _tap_results select lives_ok(
  $$ insert into public.whatsapp_credentials (business_id, access_token, access_token_encrypted)
     values ('00000000-0000-0000-0000-00000000000a', null, 'v1.iv.tag.ct') $$,
  'an encrypted-only row is accepted'
);

insert into _tap_results select lives_ok(
  $$ insert into public.whatsapp_credentials (business_id, access_token)
     values ('00000000-0000-0000-0000-00000000000b', 'legacy-plaintext') $$,
  'a legacy plaintext row is still accepted (re-encrypted lazily by the app)'
);

insert into _tap_results select throws_ok(
  $$ update public.whatsapp_credentials set access_token = null, access_token_encrypted = null
     where business_id = '00000000-0000-0000-0000-00000000000b' $$,
  '23514', null, 'a row can never hold no token at all'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'user_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text, true);
insert into _tap_results select throws_ok(
  $$ select access_token_encrypted from public.whatsapp_credentials $$, '42501', null, 'a customer session still cannot read credentials'
);

reset role;
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
