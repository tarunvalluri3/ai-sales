-- WhatsApp templates/status columns (migration 20261117000000): a template
-- row must be complete, statuses are constrained, and the outbound table is
-- still invisible to a customer session.

begin;
select plan(5);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated, service_role;

insert into public.businesses (id, clerk_org_id, name) values ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A');
insert into public.conversations (id, business_id, visitor_id, source)
values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '919876543210', 'whatsapp');
insert into public.messages (id, business_id, conversation_id, role, content)
values ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001', 'human_agent', 'Your appointment is confirmed.');

insert into _tap_results select lives_ok(
  $$ insert into public.whatsapp_outbound_messages
       (business_id, conversation_id, message_id, to_wa_id, phone_number_id, content,
        template_kind, template_name, template_language, template_params)
     values ('00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
             '919876543210', '123', 'Your appointment is confirmed.',
             'appointment_confirmed', 'appointment_confirmed', 'en', '["Priya","A","Tue"]'::jsonb) $$,
  'a complete template row is accepted'
);

insert into _tap_results select lives_ok(
  $$ insert into public.whatsapp_outbound_messages
       (business_id, conversation_id, message_id, to_wa_id, phone_number_id, content, template_kind)
     values ('00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
             '919876543210', '123', 'x', 'appointment_reminder') $$,
  'a kind without a configured template is accepted (fails visibly at send time)'
);

insert into _tap_results select throws_ok(
  $$ insert into public.whatsapp_outbound_messages
       (business_id, conversation_id, message_id, to_wa_id, phone_number_id, content, template_name)
     values ('00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
             '919876543210', '123', 'x', 'appointment_confirmed') $$,
  '23514', null, 'a template name without language/params is rejected'
);

insert into _tap_results select throws_ok(
  $$ update public.whatsapp_outbound_messages set delivery_status = 'bounced' $$,
  '23514', null, 'delivery_status only accepts Meta''s statuses'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'user_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text, true);
insert into _tap_results select throws_ok(
  $$ select template_params from public.whatsapp_outbound_messages $$, '42501', null, 'a customer session still cannot read outbound rows'
);

reset role;
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
