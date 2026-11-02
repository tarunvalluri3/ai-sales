-- Per-business Instagram override (2026-11-02). Instagram is on no plan
-- until Meta approves the app (lib/plans.ts), but specific businesses -- our
-- own and the Meta App Review test account -- need it now. Instagram is
-- allowed when the business's plan includes it OR this flag is true
-- (lib/subscription.ts getEntitlement()).
--
-- Only the service role (the admin script `npm run instagram:enable`, or a
-- platform admin) may set it. A customer's own Clerk session must never be
-- able to switch it on:
--   * UPDATE: `authenticated` only has column-level UPDATE grants on
--     businesses (20260811145006 revoked the table-wide grant), and this
--     column is deliberately left out of them. The explicit revoke below is
--     a no-op today; it documents the intent.
--   * INSERT: `authenticated` has a table-wide INSERT grant (a new business
--     creates its own row, 20260811151559), which would cover a new column.
--     A RESTRICTIVE policy forces the flag to false on any row a customer
--     inserts, whatever the permissive insert policy allows.
--
-- pgTAP: supabase/tests/database/065_business_instagram_override.sql.
--
-- ROLLBACK:
--   drop policy businesses_insert_instagram_disabled on public.businesses;
--   alter table public.businesses drop column instagram_enabled;

alter table public.businesses
  add column instagram_enabled boolean not null default false;

comment on column public.businesses.instagram_enabled is
  'Service-role-only override: Instagram is allowed for this business even when its plan does not include it.';

revoke update (instagram_enabled) on public.businesses from anon, authenticated;

create policy "businesses_insert_instagram_disabled" on public.businesses
  as restrictive
  for insert
  to authenticated
  with check (instagram_enabled = false);
