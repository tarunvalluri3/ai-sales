-- Functional tests for Phase 23's scheduled operational-table cleanup
-- (20260820221000) -- these are global sweeps, not tenant-isolation
-- checks, matching 014_delete_expired_conversations_function.sql's own
-- framing.

begin;
select plan(4);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A');

-- rate_limit_counters: one stale row (window_start 2 days ago), one fresh.
insert into public.rate_limit_counters (scope, identifier, window_start, request_count)
values
  ('ip', 'stale-ip', now() - interval '2 days', 5),
  ('ip', 'fresh-ip', now(), 1);

select public.delete_expired_rate_limit_counters();

insert into _tap_results select is_empty(
  $$ select id from public.rate_limit_counters where identifier = 'stale-ip' $$,
  'delete_expired_rate_limit_counters removes a window older than 1 day'
);
insert into _tap_results select isnt_empty(
  $$ select id from public.rate_limit_counters where identifier = 'fresh-ip' $$,
  'delete_expired_rate_limit_counters leaves a current window untouched'
);

-- ai_response_cache: one already-expired row, one still valid.
insert into public.ai_response_cache (business_id, question_hash, answer, used_context, expires_at)
values
  ('00000000-0000-0000-0000-00000000000a', 'stale-hash', 'stale answer', true, now() - interval '1 minute'),
  ('00000000-0000-0000-0000-00000000000a', 'fresh-hash', 'fresh answer', true, now() + interval '1 hour');

select public.delete_expired_ai_response_cache();

insert into _tap_results select is_empty(
  $$ select id from public.ai_response_cache where question_hash = 'stale-hash' $$,
  'delete_expired_ai_response_cache removes a row past its own expires_at'
);
insert into _tap_results select isnt_empty(
  $$ select id from public.ai_response_cache where question_hash = 'fresh-hash' $$,
  'delete_expired_ai_response_cache leaves an unexpired row untouched'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
