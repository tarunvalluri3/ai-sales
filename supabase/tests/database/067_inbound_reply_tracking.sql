-- Inbound reply tracking (migration 20261115000000): the recovery sweep's
-- claim only takes 'pending' rows inside the stuck window, never NULL
-- (pre-migration) rows, never another channel's rows, and the claim function
-- and both inbound tables stay unavailable to a customer session.

begin;
select plan(9);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated, service_role;

insert into public.businesses (id, clerk_org_id, name)
values ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A');

-- stuck (10 min old, pending), fresh (1 min old), too old (2 days), legacy (NULL), already replied
insert into public.whatsapp_inbound_messages (id, business_id, whatsapp_message_id, reply_status, created_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'wamid.stuck', 'pending', now() - interval '10 minutes'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'wamid.fresh', 'pending', now() - interval '1 minute'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'wamid.old', 'pending', now() - interval '2 days'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'wamid.legacy', null, now() - interval '10 minutes'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 'wamid.done', 'replied', now() - interval '10 minutes');

insert into public.instagram_inbound_messages (id, business_id, instagram_message_id, reply_status, created_at) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'mid.stuck', 'pending', now() - interval '10 minutes');

insert into _tap_results select throws_ok(
  $$ insert into public.whatsapp_inbound_messages (business_id, whatsapp_message_id, reply_status)
     values ('00000000-0000-0000-0000-00000000000a', 'wamid.bad', 'sent') $$,
  '23514',
  null,
  'reply_status only accepts the documented values'
);

insert into _tap_results select is(
  (select array_agg(id order by id) from public.claim_stuck_inbound_replies('whatsapp', 300, 21600, 20)),
  array['10000000-0000-0000-0000-000000000001'::uuid],
  'whatsapp claim takes only the pending row inside the stuck window'
);

insert into _tap_results select is(
  (select reply_status from public.whatsapp_inbound_messages where id = '10000000-0000-0000-0000-000000000001'),
  'recovering',
  'a claimed row is marked recovering'
);

insert into _tap_results select is(
  (select count(*)::int from public.claim_stuck_inbound_replies('whatsapp', 300, 21600, 20)),
  0,
  'a second sweep claims nothing (no double recovery)'
);

insert into _tap_results select is(
  (select reply_status from public.whatsapp_inbound_messages where id = '10000000-0000-0000-0000-000000000004'),
  null,
  'pre-migration rows (NULL) are never claimed'
);

insert into _tap_results select is(
  (select array_agg(id) from public.claim_stuck_inbound_replies('instagram', 300, 21600, 20)),
  array['20000000-0000-0000-0000-000000000001'::uuid],
  'instagram claim reads only the instagram table'
);

insert into _tap_results select throws_ok(
  $$ select * from public.claim_stuck_inbound_replies('sms', 300, 21600, 20) $$,
  'P0001',
  null,
  'an unknown channel is an error'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select throws_ok(
  $$ select * from public.claim_stuck_inbound_replies('whatsapp', 300, 21600, 20) $$,
  '42501',
  null,
  'a customer session cannot execute the claim function'
);

insert into _tap_results select throws_ok(
  $$ select reply_status from public.whatsapp_inbound_messages $$,
  '42501',
  null,
  'a customer session still cannot read the inbound table'
);

reset role;
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
