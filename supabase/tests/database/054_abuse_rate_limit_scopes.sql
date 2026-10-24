-- Phase 32 abuse rate-limit scopes (STATE.md, migration 20261029000000):
-- the three new values on public.rate_limit_counters.scope_check, and proof
-- that the table's zero-grant posture is unchanged.
--
-- Acceptance + positive control: each new scope value inserts cleanly (as
-- the table owner, which bypasses RLS -- we are testing the CONSTRAINT, not
-- the policy). Those lives_ok inserts double as the positive control for the
-- zero-grant assertion at the end: they prove the table IS usable, so the
-- denial is real and not a vacuous pass against an unreachable table (same
-- technique as 051/053).
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.

begin;
select plan(6);
create temporary table _tap_results (line text);

insert into _tap_results select lives_ok(
  $$ insert into public.rate_limit_counters (scope, identifier, window_start)
     values ('business_burst', 'biz-1', now()) $$,
  'the business_burst scope is accepted by rate_limit_counters_scope_check'
);

insert into _tap_results select lives_ok(
  $$ insert into public.rate_limit_counters (scope, identifier, window_start)
     values ('new_conversation_ip', '203.0.113.7', now()) $$,
  'the new_conversation_ip scope is accepted by rate_limit_counters_scope_check'
);

insert into _tap_results select lives_ok(
  $$ insert into public.rate_limit_counters (scope, identifier, window_start)
     values ('ip_subnet', '203.0.113.0/24', now()) $$,
  'the ip_subnet scope is accepted by rate_limit_counters_scope_check'
);

-- A value outside the allowed set is still refused (23514 = check_violation),
-- proving the constraint was recreated, not dropped or widened to anything.
insert into _tap_results select throws_ok(
  $$ insert into public.rate_limit_counters (scope, identifier, window_start)
     values ('definitely_not_a_scope', 'x', now()) $$,
  '23514',
  null,
  'an unknown scope value is still refused by the check constraint'
);

-- Regression: the recreate kept the pre-existing values working.
insert into _tap_results select lives_ok(
  $$ insert into public.rate_limit_counters (scope, identifier, window_start)
     values ('ip', '198.51.100.9', now()) $$,
  'a pre-existing scope (ip) is still accepted after the constraint recreate'
);

-- Zero-grant posture unchanged: no client role holds any privilege on the
-- counters table (RLS is enabled + forced with no policies; only the service
-- role, which bypasses RLS, ever touches it).
insert into _tap_results select ok(
  not has_table_privilege('authenticated', 'public.rate_limit_counters', 'select')
  and not has_table_privilege('authenticated', 'public.rate_limit_counters', 'insert')
  and not has_table_privilege('authenticated', 'public.rate_limit_counters', 'update')
  and not has_table_privilege('authenticated', 'public.rate_limit_counters', 'delete')
  and not has_table_privilege('anon', 'public.rate_limit_counters', 'select')
  and not has_table_privilege('anon', 'public.rate_limit_counters', 'insert'),
  'neither authenticated nor anon holds any privilege on rate_limit_counters'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
