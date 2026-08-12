-- Corrects an incomplete fix: 20260812191914_default_privileges_revoke_execute_on_functions.sql
-- revoked EXECUTE-on-new-functions from PUBLIC only, on the assumption
-- that PUBLIC was the sole source of the default grant (the SQL-standard
-- default, unlike the table case). Live verification disproved this: a
-- throwaway function created after that migration still showed
-- anon_can_execute = true and authenticated_can_execute = true via
-- has_function_privilege(). A pg_default_acl check confirmed this
-- project's default ACL for functions in schema public explicitly
-- includes anon and authenticated alongside postgres/service_role
-- (postgres=X,anon=X,authenticated=X,service_role=X) -- a
-- provisioning-time artifact, same root-cause class as the Phase 3
-- table-grants gap (20260811145006_tighten_businesses_grants.sql),
-- not just the SQL-standard PUBLIC default this project assumed it was.
--
-- Fix: name anon and authenticated explicitly, mirroring the table-level
-- precedent (20260811150450_default_privileges_least_privilege.sql:
-- "revoke all on tables from anon, authenticated;").
--
-- Not retroactive: does not affect match_knowledge_chunks (already fixed
-- individually, re-verified unaffected by this gap) or any function
-- created before this migration runs. service_role is untouched
-- (expected to bypass RLS / hold broad privileges by design). Each new
-- function's own migration remains responsible for its own explicit
-- `grant execute ... to authenticated` -- this migration only stops the
-- default from granting it automatically.

alter default privileges in schema public
revoke execute on functions from anon, authenticated;
