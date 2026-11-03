-- Appointment lifecycle (migration 20261118000000): only overdue pending
-- bookings expire, an expired booking frees its slot, a second run expires
-- nothing new, the notice ledger refuses a duplicate, and neither the ledger
-- nor the expiry function is reachable from a customer session.

begin;
select plan(8);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated, service_role;

insert into public.businesses (id, clerk_org_id, name) values ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A');

-- overdue (booked 3 days ago, start in 5 days), fresh (booked now, start in 5 days),
-- near (booked 1 day ago, start in 90 min -> past "2 h before start"), confirmed (never expires)
insert into public.appointments (id, business_id, contact_email, starts_at, ends_at, status, created_at) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'a@example.com', now() + interval '5 days', now() + interval '5 days 30 minutes', 'pending', now() - interval '3 days'),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'b@example.com', now() + interval '6 days', now() + interval '6 days 30 minutes', 'pending', now()),
  ('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'c@example.com', now() + interval '90 minutes', now() + interval '120 minutes', 'pending', now() - interval '1 day'),
  ('50000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'd@example.com', now() + interval '7 days', now() + interval '7 days 30 minutes', 'confirmed', now() - interval '3 days');

insert into _tap_results select is(
  (select array_agg(id order by id) from public.expire_stale_pending_appointments(172800, 7200, 3600, 50)),
  array['50000000-0000-0000-0000-000000000001'::uuid, '50000000-0000-0000-0000-000000000003'::uuid],
  'only the overdue pending bookings expire'
);

insert into _tap_results select is(
  (select status from public.appointments where id = '50000000-0000-0000-0000-000000000004'),
  'confirmed',
  'a confirmed appointment is never expired'
);

insert into _tap_results select is(
  (select count(*)::int from public.expire_stale_pending_appointments(172800, 7200, 3600, 50)),
  0,
  'a second run expires nothing new'
);

insert into _tap_results select lives_ok(
  $$ insert into public.appointments (business_id, contact_email, starts_at, ends_at, status)
     select business_id, 'e@example.com', starts_at, ends_at, 'pending'
     from public.appointments where id = '50000000-0000-0000-0000-000000000001' $$,
  'an expired booking frees its slot for a new booking'
);

insert into public.appointment_notifications (business_id, appointment_id, kind, starts_at)
select business_id, id, 'reminder_24h', starts_at from public.appointments where id = '50000000-0000-0000-0000-000000000004';

insert into _tap_results select throws_ok(
  $$ insert into public.appointment_notifications (business_id, appointment_id, kind, starts_at)
     select business_id, id, 'reminder_24h', starts_at from public.appointments where id = '50000000-0000-0000-0000-000000000004' $$,
  '23505', null, 'the same reminder for the same start time can only be claimed once'
);

insert into _tap_results select lives_ok(
  $$ insert into public.appointment_notifications (business_id, appointment_id, kind, starts_at)
     select business_id, id, 'reminder_24h', starts_at + interval '1 day' from public.appointments where id = '50000000-0000-0000-0000-000000000004' $$,
  'a rescheduled appointment gets its own reminder'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'user_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text, true);
insert into _tap_results select throws_ok(
  $$ select * from public.appointment_notifications $$, '42501', null, 'a customer session cannot read the notice ledger'
);
insert into _tap_results select throws_ok(
  $$ select * from public.expire_stale_pending_appointments(1, 1, 1, 1) $$, '42501', null, 'a customer session cannot run the expiry'
);

reset role;
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
