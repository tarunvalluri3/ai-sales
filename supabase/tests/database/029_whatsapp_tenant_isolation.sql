-- Tenant-isolation test for Phase 16's WhatsApp tables. whatsapp_connections
-- is the business-visible config table (grants select/insert/update/delete
-- to `authenticated`, RLS-scoped) -- covered the same way
-- 019_webhook_endpoints_tenant_isolation.sql covers webhook_endpoints.
-- whatsapp_credentials/whatsapp_inbound_messages/whatsapp_outbound_messages
-- grant nothing to `authenticated` at all (service-role only, same posture
-- as webhook_deliveries/rate_limit_counters) -- proven here as a bare
-- `select` denial, not just RLS row-scoping.

begin;
select plan(6);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.conversations (id, business_id, source)
values
  ('60000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'whatsapp'),
  ('60000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'whatsapp');

insert into public.messages (id, business_id, conversation_id, role, content)
values
  ('70000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-00000000000a', 'assistant', 'hi a'),
  ('70000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '60000000-0000-0000-0000-00000000000b', 'assistant', 'hi b');

insert into public.whatsapp_connections (id, business_id, phone_number_id, waba_id, display_phone_number, status)
values
  ('80000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'phone_a', 'waba_a', '+10000000001', 'connected'),
  ('80000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'phone_b', 'waba_b', '+10000000002', 'connected');

insert into public.whatsapp_credentials (business_id, access_token)
values
  ('00000000-0000-0000-0000-00000000000a', 'token_a'),
  ('00000000-0000-0000-0000-00000000000b', 'token_b');

insert into public.whatsapp_inbound_messages (business_id, whatsapp_message_id)
values
  ('00000000-0000-0000-0000-00000000000a', 'wamid.a'),
  ('00000000-0000-0000-0000-00000000000b', 'wamid.b');

insert into public.whatsapp_outbound_messages (business_id, conversation_id, message_id, to_wa_id, phone_number_id, content)
values
  ('00000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-00000000000a', '15550001', 'phone_a', 'reply a'),
  ('00000000-0000-0000-0000-00000000000b', '60000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-00000000000b', '15550002', 'phone_b', 'reply b');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select business_id from public.whatsapp_connections order by business_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s whatsapp_connections row, never org_b''s'
);

insert into _tap_results select throws_ok(
  $$ insert into public.whatsapp_connections (business_id, phone_number_id, waba_id, display_phone_number)
     values ('00000000-0000-0000-0000-00000000000b', 'forged_phone', 'forged_waba', '+19999999999') $$,
  '42501',
  null,
  'org_a session cannot create a whatsapp_connections row under org_b''s business id'
);

insert into _tap_results select throws_ok(
  $$ select * from public.whatsapp_credentials $$,
  '42501',
  null,
  'org_a session cannot select from whatsapp_credentials at all (zero authenticated grant)'
);

insert into _tap_results select throws_ok(
  $$ select * from public.whatsapp_inbound_messages $$,
  '42501',
  null,
  'org_a session cannot select from whatsapp_inbound_messages at all (zero authenticated grant)'
);

insert into _tap_results select throws_ok(
  $$ select * from public.whatsapp_outbound_messages $$,
  '42501',
  null,
  'org_a session cannot select from whatsapp_outbound_messages at all (zero authenticated grant)'
);

delete from public.whatsapp_connections where id = '80000000-0000-0000-0000-00000000000b';

reset role;
insert into _tap_results select is(
  (select count(*) from public.whatsapp_connections where id = '80000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'org_a session cannot delete org_b''s whatsapp_connections row (no rows affected, not an error)'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
