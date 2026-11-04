-- billing_cancellations accepts the platform-admin delete reasons
-- (migration 20261122000000) and still rejects anything else.

begin;
select plan(3);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated, service_role;

insert into _tap_results select lives_ok(
  $$ insert into public.billing_cancellations (business_id, clerk_org_id, razorpay_subscription_id, reason)
     values ('00000000-0000-0000-0000-0000000074a1', 'org_074', 'sub_074_soft', 'admin_soft_deleted') $$,
  'an admin soft-delete cancellation is accepted'
);

insert into _tap_results select lives_ok(
  $$ insert into public.billing_cancellations (business_id, clerk_org_id, razorpay_subscription_id, reason)
     values ('00000000-0000-0000-0000-0000000074a1', 'org_074', 'sub_074_hard', 'admin_hard_deleted') $$,
  'an admin hard-delete cancellation is accepted'
);

insert into _tap_results select throws_ok(
  $$ insert into public.billing_cancellations (business_id, clerk_org_id, razorpay_subscription_id, reason)
     values ('00000000-0000-0000-0000-0000000074a1', 'org_074', 'sub_074_bad', 'refund_me') $$,
  '23514', null, 'an unknown reason is rejected'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
