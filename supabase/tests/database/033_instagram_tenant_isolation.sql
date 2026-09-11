-- Tenant-isolation test for Phase 26's Instagram tables. instagram_connections
-- is the business-visible config table (grants select/insert/update/delete
-- to `authenticated`, RLS-scoped) -- covered the same way
-- 029_whatsapp_tenant_isolation.sql covers whatsapp_connections.
-- instagram_credentials/instagram_inbound_messages/instagram_outbound_messages/
-- instagram_oauth_states grant nothing to `authenticated` at all
-- (service-role only) -- proven here as a bare `select` denial, not just
-- RLS row-scoping.

begin;
select plan(7);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.conversations (id, business_id, source)
values
  ('60000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'instagram'),
  ('60000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000b', 'instagram');

insert into public.messages (id, business_id, conversation_id, role, content)
values
  ('70000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-00000000000c', 'assistant', 'hi a'),
  ('70000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000b', '60000000-0000-0000-0000-00000000000d', 'assistant', 'hi b');

insert into public.instagram_connections (id, business_id, instagram_business_account_id, status)
values
  ('90000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'ig_account_a', 'connected'),
  ('90000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'ig_account_b', 'connected');

insert into public.instagram_credentials (business_id, access_token)
values
  ('00000000-0000-0000-0000-00000000000a', 'token_a'),
  ('00000000-0000-0000-0000-00000000000b', 'token_b');

insert into public.instagram_inbound_messages (business_id, instagram_message_id)
values
  ('00000000-0000-0000-0000-00000000000a', 'ig_mid_a'),
  ('00000000-0000-0000-0000-00000000000b', 'ig_mid_b');

insert into public.instagram_outbound_messages (business_id, conversation_id, message_id, to_ig_id, instagram_business_account_id, content)
values
  ('00000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-00000000000c', '70000000-0000-0000-0000-00000000000c', 'ig_sender_a', 'ig_account_a', 'reply a'),
  ('00000000-0000-0000-0000-00000000000b', '60000000-0000-0000-0000-00000000000d', '70000000-0000-0000-0000-00000000000d', 'ig_sender_b', 'ig_account_b', 'reply b');

insert into public.instagram_oauth_states (state, business_id, initiated_by_user_id, expires_at)
values
  ('state_a', '00000000-0000-0000-0000-00000000000a', 'user_test_a', now() + interval '10 minutes'),
  ('state_b', '00000000-0000-0000-0000-00000000000b', 'user_test_b', now() + interval '10 minutes');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select business_id from public.instagram_connections order by business_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s instagram_connections row, never org_b''s'
);

insert into _tap_results select throws_ok(
  $$ insert into public.instagram_connections (business_id, instagram_business_account_id)
     values ('00000000-0000-0000-0000-00000000000b', 'forged_account') $$,
  '42501',
  null,
  'org_a session cannot create an instagram_connections row under org_b''s business id'
);

insert into _tap_results select throws_ok(
  $$ select * from public.instagram_credentials $$,
  '42501',
  null,
  'org_a session cannot select from instagram_credentials at all (zero authenticated grant)'
);

insert into _tap_results select throws_ok(
  $$ select * from public.instagram_inbound_messages $$,
  '42501',
  null,
  'org_a session cannot select from instagram_inbound_messages at all (zero authenticated grant)'
);

insert into _tap_results select throws_ok(
  $$ select * from public.instagram_outbound_messages $$,
  '42501',
  null,
  'org_a session cannot select from instagram_outbound_messages at all (zero authenticated grant)'
);

insert into _tap_results select throws_ok(
  $$ select * from public.instagram_oauth_states $$,
  '42501',
  null,
  'org_a session cannot select from instagram_oauth_states at all (zero authenticated grant)'
);

delete from public.instagram_connections where id = '90000000-0000-0000-0000-00000000000b';

reset role;
insert into _tap_results select is(
  (select count(*) from public.instagram_connections where id = '90000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'org_a session cannot delete org_b''s instagram_connections row (no rows affected, not an error)'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
