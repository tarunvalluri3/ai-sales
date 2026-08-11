-- Forward-looking fix for the same root cause behind the businesses
-- grants issue: this project's pre-existing ALTER DEFAULT PRIVILEGES
-- (from provisioning, predating Supabase's April-2026 auto-expose
-- opt-out default) auto-granted broad table privileges to anon and
-- authenticated on every new table in public. This revokes that default
-- going forward so every future table starts least-privilege, and each
-- table's own migration is what explicitly opens the access it needs —
-- not a redundant belt-and-suspenders statement.
--
-- Not retroactive: does not affect businesses or any table created
-- before this migration runs. service_role is untouched (expected to
-- bypass RLS / hold broad privileges by design).

alter default privileges in schema public
revoke all on tables from anon, authenticated;
