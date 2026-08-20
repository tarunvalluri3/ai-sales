-- Tenant-isolation test for public.webhook_endpoints (Phase 24,
-- AGENTS.md §7). webhook_deliveries (the queue table) grants nothing to
-- `authenticated` at all -- only the service role touches it, same
-- posture as ai_response_metrics/rate_limit_counters -- so it needs no
-- isolation test of its own; this covers the endpoint config table,
-- which does grant authenticated select/insert/delete.

begin;
select plan(3);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.webhook_endpoints (id, business_id, url, secret)
values
  ('50000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'https://a.example.com/hook', 'secret_a'),
  ('50000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'https://b.example.com/hook', 'secret_b');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select business_id from public.webhook_endpoints order by business_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s webhook endpoints, never org_b''s secret'
);

insert into _tap_results select throws_ok(
  $$ insert into public.webhook_endpoints (business_id, url, secret)
     values ('00000000-0000-0000-0000-00000000000b', 'https://evil.example.com', 'forged') $$,
  '42501',
  null,
  'org_a session cannot create a webhook endpoint under org_b''s business id'
);

delete from public.webhook_endpoints where id = '50000000-0000-0000-0000-00000000000b';

reset role;
insert into _tap_results select is(
  (select count(*) from public.webhook_endpoints where id = '50000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'org_a session cannot delete org_b''s webhook endpoint (no rows affected, not an error)'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
