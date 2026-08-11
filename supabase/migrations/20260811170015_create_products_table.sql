-- Products: business-owned structured knowledge (Phase 5). Tenant-scoped
-- via business_id, not clerk_org_id directly (unlike businesses itself),
-- so RLS policies join through public.businesses to check org ownership.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  description text,
  price numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_business_id_idx on public.products (business_id);

-- Reuses public.set_updated_at(), already defined by the businesses migration.
create trigger products_set_updated_at
  before update on public.products
  for each row
  execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.products force row level security;

-- Table-level privilege: required in addition to RLS policies below. New
-- tables default to zero grants (see the default-privileges migration) —
-- an explicit GRANT is not optional here.
grant select, insert, update, delete on public.products to authenticated;

-- Any authenticated member of the owning org may CRUD their business's
-- products (resolved decision, STATE.md): no owner/admin restriction here,
-- unlike businesses_insert_own_org's role split enforced at the app layer.
create policy "products_select_own_business" on public.products
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "products_insert_own_business" on public.products
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "products_update_own_business" on public.products
  for update
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  )
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "products_delete_own_business" on public.products
  for delete
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
