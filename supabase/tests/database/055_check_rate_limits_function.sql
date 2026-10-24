-- Phase 32, Stage B (STATE.md, migration 20261029000100): the batched
-- public.check_rate_limits() function -- its zero-grant posture and its
-- increment-then-compare behaviour.
--
-- The per-function revoke/grant is the only thing standing between this
-- function and PUBLIC execute (there is no schema-wide default-privileges
-- safety net for functions in this project -- STATE.md §8), so it is verified
-- live here with has_function_privilege(), the same way 051 verifies the
-- issuing functions. Assertion 1 is the positive control: it proves the
-- service role CAN execute it, so the denials that follow are real.
--
-- Run against the live, linked project via `npm test`.

begin;
select plan(5);
create temporary table _tap_results (line text);

insert into _tap_results select ok(
  has_function_privilege('service_role', 'public.check_rate_limits(jsonb)', 'execute'),
  'service_role may execute check_rate_limits (positive control)'
);

insert into _tap_results select ok(
  not has_function_privilege('authenticated', 'public.check_rate_limits(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.check_rate_limits(jsonb)', 'execute'),
  'neither authenticated nor anon may execute check_rate_limits'
);

insert into _tap_results select is(
  (select request_count from public.check_rate_limits(
     '[{"scope":"ip","identifier":"tap-ip-1","limit":5,"window_seconds":300}]'::jsonb)),
  1,
  'first call for a fresh (scope, identifier) returns request_count 1'
);

insert into _tap_results select is(
  (select request_count from public.check_rate_limits(
     '[{"scope":"ip","identifier":"tap-ip-1","limit":5,"window_seconds":300}]'::jsonb)),
  2,
  'a second call in the same window increments the same counter to 2'
);

insert into _tap_results select ok(
  not (select allowed from public.check_rate_limits(
     '[{"scope":"ip","identifier":"tap-ip-2","limit":0,"window_seconds":300}]'::jsonb)),
  'allowed is false once the count exceeds the limit'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
