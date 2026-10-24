-- Phase 32, Stage B (STATE.md): one round trip for several fixed-window
-- counters instead of one RPC per scope. public.check_rate_limits() takes a
-- JSON array of {scope, identifier, limit, window_seconds} and returns one
-- row per entry with the new count, a naive allowed verdict (count <= limit)
-- and the seconds until the current window closes.
--
-- It preserves increment_rate_limit_counter()'s semantics EXACTLY -- the same
-- fixed window keyed on (scope, identifier, window_start), the same
-- increment-then-compare, always incrementing even for a rejected request.
-- increment_rate_limit_counter() is deliberately kept in place and working:
-- nothing requires a big-bang cutover, and the single-call function is the
-- fallback if this one ever needs to be rolled back without a migration.
--
-- The returned `allowed` is naive on purpose -- it does not know about the
-- Phase 32 log-only / fail-open scopes. The application layer
-- (lib/abuse-limits.ts resolveAbuseLimitVerdict, via lib/rate-limit.ts) is the
-- single place those rules live, and it re-derives the real verdict from the
-- returned `request_count`. Keeping that logic out of SQL is deliberate so a
-- scope's promotion from log-only to enforcing never needs a migration.
--
-- SECURITY INVOKER (stated explicitly), same posture as
-- increment_rate_limit_counter(). There is NO schema-wide default-privileges
-- safety net for functions in this project (attempted three times and
-- abandoned as a platform constraint -- see STATE.md §8), so this function
-- carries its own revoke/grant, per docs/architecture.md's standing
-- per-function-privilege rule. Verified live with has_function_privilege() in
-- pgTAP 055.
--
-- Deployment ordering: apply to production BEFORE merging the route code that
-- calls it (same rule as 20261029000000). The agent harness refuses
-- `db push`; the user applies it (see STATE.md's Phase 32 deployment entry).
--
-- ROLLBACK:
--   drop function if exists public.check_rate_limits(jsonb);

create or replace function public.check_rate_limits(p_checks jsonb)
returns table (scope text, allowed boolean, request_count int, retry_after_seconds int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_check jsonb;
  v_scope text;
  v_identifier text;
  v_limit int;
  v_window int;
  v_window_start timestamptz;
  v_count int;
begin
  for v_check in select * from jsonb_array_elements(p_checks)
  loop
    v_scope := v_check->>'scope';
    v_identifier := v_check->>'identifier';
    v_limit := (v_check->>'limit')::int;
    v_window := (v_check->>'window_seconds')::int;
    v_window_start := to_timestamp(floor(extract(epoch from now()) / v_window) * v_window);

    insert into public.rate_limit_counters (scope, identifier, window_start, request_count)
    values (v_scope, v_identifier, v_window_start, 1)
    on conflict (scope, identifier, window_start)
    do update set request_count = rate_limit_counters.request_count + 1
    returning rate_limit_counters.request_count into v_count;

    scope := v_scope;
    request_count := v_count;
    allowed := v_count <= v_limit;
    retry_after_seconds := greatest(
      0,
      ceil(extract(epoch from v_window_start) + v_window - extract(epoch from now()))::int
    );
    return next;
  end loop;
end;
$$;

revoke execute on function public.check_rate_limits(jsonb) from public;
revoke execute on function public.check_rate_limits(jsonb) from anon;
revoke execute on function public.check_rate_limits(jsonb) from authenticated;
grant execute on function public.check_rate_limits(jsonb) to service_role;
