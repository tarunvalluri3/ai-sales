-- Scheduler leases (migration 20261116000000): only one caller holds a job's
-- lease, an expired lease can be taken over, release only works for the
-- holder, failures are counted, stale queue claims are released, and nothing
-- is visible or executable from a customer session.

begin;
select plan(11);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated, service_role;

insert into _tap_results select is(
  public.try_acquire_scheduled_job('whatsapp_outbound', 'run_a', 120), true, 'first caller takes the lease'
);
insert into _tap_results select is(
  public.try_acquire_scheduled_job('whatsapp_outbound', 'run_b', 120), false, 'an overlapping caller is refused'
);
insert into _tap_results select is(
  public.release_scheduled_job('whatsapp_outbound', 'run_b', true, null, 10, '{}'::jsonb), -1, 'a non-holder cannot release'
);
insert into _tap_results select is(
  public.release_scheduled_job('whatsapp_outbound', 'run_a', false, 'boom', 10, null), 1, 'the holder releases; one failure counted'
);
insert into _tap_results select is(
  (select locked_by from public.scheduled_job_runs where job_name = 'whatsapp_outbound'), null, 'released lease is free'
);
insert into _tap_results select is(
  public.try_acquire_scheduled_job('whatsapp_outbound', 'run_c', 120), true, 'a free lease can be taken again'
);
insert into _tap_results select is(
  public.release_scheduled_job('whatsapp_outbound', 'run_c', true, null, 10, '{"processed":1}'::jsonb), 0, 'success resets the failure count'
);

-- An expired lease is taken over.
update public.scheduled_job_runs set locked_until = now() - interval '1 second', locked_by = 'dead_run' where job_name = 'whatsapp_outbound';
insert into _tap_results select is(
  public.try_acquire_scheduled_job('whatsapp_outbound', 'run_d', 120), true, 'an expired lease can be taken over'
);

-- A queue row stuck in 'processing' is put back to 'pending'.
insert into public.businesses (id, clerk_org_id, name) values ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A');
insert into public.webhook_endpoints (id, business_id, url, secret)
values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'https://example.com/hook', 'whsec_test');
insert into public.webhook_deliveries (id, business_id, endpoint_id, event_type, payload, status, updated_at)
values ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001',
        'lead.qualified', '{}'::jsonb, 'processing', now() - interval '1 hour');
insert into _tap_results select is(
  (select released from public.release_stale_queue_claims(900) where queue = 'webhook_deliveries'), 1, 'a stale processing claim is released'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'user_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text, true);
insert into _tap_results select throws_ok(
  $$ select * from public.scheduled_job_runs $$, '42501', null, 'a customer session cannot read scheduled_job_runs'
);
insert into _tap_results select throws_ok(
  $$ select public.try_acquire_scheduled_job('x_job', 'me', 60) $$, '42501', null, 'a customer session cannot take a lease'
);

reset role;
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
