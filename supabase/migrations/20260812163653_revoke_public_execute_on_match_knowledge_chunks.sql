-- Postgres grants EXECUTE on new functions to PUBLIC by default. The
-- original migration (20260812161850_create_match_knowledge_chunks_function.sql)
-- granted execute to authenticated but never revoked the PUBLIC default,
-- so this function was callable by anon and by completely unauthenticated
-- connections -- the same class of gap Phase 3 hit with table grants
-- (20260811145006_tighten_businesses_grants.sql), now known to apply to
-- functions too (see docs/architecture.md's Database section).

revoke execute on function public.match_knowledge_chunks(uuid, extensions.vector(1536), int) from public;
revoke execute on function public.match_knowledge_chunks(uuid, extensions.vector(1536), int) from anon;

-- authenticated's execute grant (from the original migration) is
-- untouched by the above -- explicit per-role grants are independent of
-- the PUBLIC default and of each other.
