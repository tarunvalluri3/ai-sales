-- public.businesses inherited broad default-privilege grants (anon and
-- authenticated both had full CRUD + TRUNCATE/REFERENCES/TRIGGER) from
-- this project's pre-existing ALTER DEFAULT PRIVILEGES, independent of
-- the explicit `grant select ... to authenticated` in the table's own
-- creation migration. RLS already blocked unauthorized row access (see
-- STATE.md), but TRUNCATE bypasses RLS entirely, so this closes a real
-- gap, not just a cosmetic one. Tighten to exactly what the RLS design
-- assumes: authenticated = SELECT only, anon = nothing.

revoke all on public.businesses from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.businesses from authenticated;
