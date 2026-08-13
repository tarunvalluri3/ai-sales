-- Public chat widget identity (Phase 11, resolved decision D4, STATE.md
-- §4). One widget key and one allowed origin per business -- no separate
-- widget_keys table, no rotation/multiple-keys support for v1.
--
-- widget_key: generated automatically via the column default, not
-- application code. A single v4 UUID is adequate entropy for a
-- *publishable* identifier (same trust class as a Stripe publishable
-- key, not a bearer secret) -- docs/security.md §4: "Publishable key
-- values are safe client-side." Postgres evaluates this volatile default
-- per row during the table rewrite, so existing businesses get a real,
-- distinct value too, not just new ones.
--
-- widget_allowed_origin: starts null. The widget fails closed
-- (lib/widget-auth.ts) until an owner explicitly sets this via
-- /dashboard/widget-settings -- no business receives widget traffic
-- before it's configured.

alter table public.businesses
  add column widget_key uuid not null default gen_random_uuid() unique,
  add column widget_allowed_origin text;

-- Lets a business owner set their own allowed origin from the dashboard,
-- without granting general row UPDATE (which would also allow renaming
-- the business or regenerating widget_key through this path). Column-level
-- GRANT is the mechanism Postgres provides for this -- RLS policies alone
-- cannot restrict which columns an UPDATE touches.
grant update (widget_allowed_origin) on public.businesses to authenticated;

create policy "businesses_update_own_org" on public.businesses
  for update
  to authenticated
  using (
    clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
  )
  with check (
    clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
  );
