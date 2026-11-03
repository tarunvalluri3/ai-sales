-- billing_cancellations (migration 20261119000000): the record survives the
-- business's deletion (no FK), one record per Razorpay subscription, and it
-- is invisible to every customer session.

begin;
select plan(5);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated, service_role;

insert into public.businesses (id, clerk_org_id, name) values ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A');
insert into public.billing_cancellations (business_id, clerk_org_id, business_name, razorpay_subscription_id)
values ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A', 'sub_test_delete');

insert into _tap_results select lives_ok(
  $$ delete from public.businesses where id = '00000000-0000-0000-0000-00000000000a' $$,
  'the business can be deleted while its cancellation record exists'
);

insert into _tap_results select is(
  (select status from public.billing_cancellations where razorpay_subscription_id = 'sub_test_delete'),
  'pending',
  'the cancellation record survives the cascade'
);

insert into _tap_results select throws_ok(
  $$ insert into public.billing_cancellations (business_id, clerk_org_id, razorpay_subscription_id)
     values (gen_random_uuid(), 'org_b', 'sub_test_delete') $$,
  '23505', null, 'one record per Razorpay subscription'
);

insert into _tap_results select throws_ok(
  $$ update public.billing_cancellations set status = 'refunded' $$,
  '23514', null, 'status only accepts pending/cancelled/failed'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'user_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text, true);
insert into _tap_results select throws_ok(
  $$ select * from public.billing_cancellations $$, '42501', null, 'a customer session cannot read billing_cancellations'
);

reset role;
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
