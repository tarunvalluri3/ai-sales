-- Fix for public.check_rate_limits() (migration 20261029000100), discovered
-- live immediately after deploy via a direct RPC probe against production:
--
--   {"code":"42702","message":"column reference \"scope\" is ambiguous"}
--
-- Root cause: the function's RETURNS TABLE output columns (scope, allowed,
-- request_count, retry_after_seconds) are implicitly declared as PL/pgSQL
-- variables with those exact names -- which COLLIDE with
-- rate_limit_counters' own column names (scope, request_count). Inside the
-- embedded `insert ... on conflict (scope, identifier, window_start) do
-- update set request_count = ...` statement, every bare `scope`/
-- `request_count` reference became ambiguous between "the table column" and
-- "the output parameter," and Postgres refuses to guess -- it errors on
-- every call, not just some.
--
-- Consequence while this was live: lib/rate-limit.ts's checkRateLimitsBatch()
-- treats a whole-call RPC error as every scope's counter being unreadable,
-- which for the pre-existing `ip` scope (not in FAIL_OPEN_SCOPES) means FAIL
-- CLOSED -- so every single /api/chat request was rejected with 429,
-- regardless of actual traffic, the moment 20261029000100 went live.
-- Caught before merge, via npm run eval against the deployed function
-- (every one of the 9 cases failed with the same 429, including on a
-- demonstrably fresh rate-limit window) -- not caught by pgTAP 055, which
-- is the gap this migration's own addition to that file closes.
--
-- Fix: `#variable_conflict use_column` as the function body's first line,
-- so an unqualified column name inside an embedded SQL command resolves to
-- the TABLE's column, not the output parameter -- exactly the behaviour
-- this function already relied on without stating it. The explicit
-- `scope := v_scope;`-style PL/pgSQL assignment statements are unaffected
-- (their left-hand side can only ever be a variable; there is no ambiguity
-- to resolve there). No signature, grant, or semantic change otherwise --
-- `create or replace function` on the identical signature keeps the
-- existing revoke/grant in force, but they are reasserted here anyway
-- (idempotent) for a self-contained migration file.
--
-- ROLLBACK: there is no meaningful rollback -- reverting to the broken body
-- would restore the "every request 429s" failure. If this function must be
-- removed entirely, use 20261029000100's own rollback
-- (`drop function if exists public.check_rate_limits(jsonb);`), which also
-- removes this fix.

create or replace function public.check_rate_limits(p_checks jsonb)
returns table (scope text, allowed boolean, request_count int, retry_after_seconds int)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
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
