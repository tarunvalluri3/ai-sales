-- Function-level equivalent of
-- 20260811150450_default_privileges_least_privilege.sql. Postgres grants
-- EXECUTE on every new function to PUBLIC by default (the SQL-standard
-- default, not a project-specific provisioning artifact like the table
-- case was) -- every role, including authenticated, inherits from
-- PUBLIC, so this was the root cause of the match_knowledge_chunks gap
-- fixed in 20260812163653_revoke_public_execute_on_match_knowledge_chunks.sql.
-- This closes it at the source for every function created from here on;
-- each function's own migration is still responsible for its own
-- explicit `grant execute ... to authenticated` (or whichever role
-- actually needs it), exactly as before -- this migration does not grant
-- anything, it only stops the automatic PUBLIC grant.
--
-- Not retroactive: does not affect match_knowledge_chunks (already fixed
-- individually) or any function created before this migration runs.
-- service_role is untouched (expected to bypass RLS / hold broad
-- privileges by design).

alter default privileges in schema public
revoke execute on functions from public;
