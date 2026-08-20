-- Phase 23: scheduled cleanup for expired rows in purely-operational
-- (non-business-data) tables, alongside the existing conversation-retention
-- job (20260820200000). pg_cron is already enabled by that migration.
--
-- rate_limit_counters: every window is <=5 minutes (docs/security.md §4),
-- so a row older than 1 day is unambiguously stale -- generous margin,
-- not a tight cutoff.
create function public.delete_expired_rate_limit_counters()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.rate_limit_counters where window_start < now() - interval '1 day';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- ai_response_cache: rows past their own expires_at are worthless (never
-- matched by lib/response-cache.ts's lookup) and would otherwise
-- accumulate forever.
create function public.delete_expired_ai_response_cache()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.ai_response_cache where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke execute on function public.delete_expired_rate_limit_counters() from public, anon, authenticated;
revoke execute on function public.delete_expired_ai_response_cache() from public, anon, authenticated;

-- Runs daily at 03:30 UTC -- same off-peak window as the 03:00 conversation
-- retention job, staggered slightly so they don't contend.
select cron.schedule(
  'delete-expired-rate-limit-counters',
  '30 3 * * *',
  'select public.delete_expired_rate_limit_counters()'
);

select cron.schedule(
  'delete-expired-ai-response-cache',
  '35 3 * * *',
  'select public.delete_expired_ai_response_cache()'
);
