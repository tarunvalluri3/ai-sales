-- Atomic increment-and-check for public.rate_limit_counters (Phase 11).
-- A plain read-then-write from the client would race under concurrent
-- requests for the same (scope, identifier) -- this function does the
-- upsert-and-increment as one statement, avoiding that race entirely.
--
-- Fixed-window counting: window_start is the current time floored to the
-- nearest p_window_seconds boundary. Always increments, even for a
-- request that ends up rejected once the caller compares the returned
-- count against its own limit -- intentional, so retries can't reset it.
--
-- SECURITY INVOKER (the default, stated explicitly). Only the service
-- role calls this (lib/rate-limit.ts, via lib/supabase/service.ts's
-- client) -- Postgres grants EXECUTE on new functions to PUBLIC by
-- default, so this migration explicitly revokes it and grants only to
-- service_role, per the standing per-function-privilege rule
-- (docs/architecture.md's Database section, born from match_knowledge_chunks'
-- Phase 7 gap).

create or replace function public.increment_rate_limit_counter(
  p_scope text,
  p_identifier text,
  p_window_seconds int
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limit_counters (scope, identifier, window_start, request_count)
  values (p_scope, p_identifier, v_window_start, 1)
  on conflict (scope, identifier, window_start)
  do update set request_count = rate_limit_counters.request_count + 1
  returning request_count into v_count;

  return v_count;
end;
$$;

revoke execute on function public.increment_rate_limit_counter(text, text, int) from public;
revoke execute on function public.increment_rate_limit_counter(text, text, int) from anon;
revoke execute on function public.increment_rate_limit_counter(text, text, int) from authenticated;
grant execute on function public.increment_rate_limit_counter(text, text, int) to service_role;
