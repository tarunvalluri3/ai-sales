-- WhatsApp Embedded Signup + template statuses (migration 20261124000000):
-- a business reads only its own template statuses and can never write them;
-- the new connection columns' checks hold; credentials stay unreadable.

begin;
select plan(7);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated, service_role;

insert into public.businesses (id, clerk_org_id, name) values
  ('00000000-0000-0000-0000-0000000075a1', 'org_075_a', 'Business A'),
  ('00000000-0000-0000-0000-0000000075b1', 'org_075_b', 'Business B');

insert into public.whatsapp_template_statuses (business_id, waba_id, template_name, language, status) values
  ('00000000-0000-0000-0000-0000000075a1', '111', 'appointment_confirmed', 'en', 'APPROVED'),
  ('00000000-0000-0000-0000-0000000075b1', '222', 'appointment_confirmed', 'en', 'PENDING');

insert into _tap_results select throws_ok(
  $$ insert into public.whatsapp_connections (business_id, phone_number_id, waba_id, display_phone_number, onboarding_method)
     values ('00000000-0000-0000-0000-0000000075a1', '999001', '111', '+91 1', 'magic') $$,
  '23514', null, 'onboarding_method is restricted'
);

insert into _tap_results select throws_ok(
  $$ insert into public.whatsapp_template_statuses (business_id, waba_id, template_name, language, status)
     values ('00000000-0000-0000-0000-0000000075a1', '111', 'Bad Name', 'en', 'PENDING') $$,
  '23514', null, 'template names must be Meta-shaped'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'user_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_075_a'))::text, true);

insert into _tap_results select is(
  (select count(*)::int from public.whatsapp_template_statuses),
  1, 'business A sees only its own template statuses'
);
insert into _tap_results select is(
  (select status from public.whatsapp_template_statuses limit 1),
  'APPROVED', 'and it is its own row'
);
insert into _tap_results select throws_ok(
  $$ update public.whatsapp_template_statuses set status = 'APPROVED' $$,
  '42501', null, 'a customer cannot change a template status'
);
insert into _tap_results select throws_ok(
  $$ insert into public.whatsapp_template_statuses (business_id, waba_id, template_name, language, status)
     values ('00000000-0000-0000-0000-0000000075a1', '111', 'appointment_reminder', 'en', 'APPROVED') $$,
  '42501', null, 'a customer cannot insert a template status'
);
insert into _tap_results select throws_ok(
  $$ select registration_pin_encrypted from public.whatsapp_credentials $$,
  '42501', null, 'the registration PIN stays unreadable from a customer session'
);

reset role;
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
