-- Business profile fields beyond `name` (Phase 13b). All four nullable --
-- optional at signup and after. Dashboard-display-only: not read by
-- lib/rag.ts's askSalesEmployee(), which still sources business-profile
-- context from `name` alone (Phase 9 Decision 1, unchanged by this
-- migration). Wiring these into the AI persona is a separate, later
-- decision.
alter table public.businesses
  add column description text,
  add column contact_email text,
  add column contact_phone text,
  add column website text;

-- The existing businesses_update_own_org RLS policy (Phase 11) already
-- permits UPDATE on org-matched rows at the row level -- only the
-- column-level GRANT restricts which columns, same mechanism already used
-- for widget_allowed_origin. org:admin-only enforcement happens at the
-- application layer (requireAuthContext({ role: "org:admin" })), since
-- Postgres GRANT has no concept of Clerk org roles.
grant update (name, description, contact_email, contact_phone, website)
  on public.businesses to authenticated;
