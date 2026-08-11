-- Businesses: the tenant root table. clerk_org_id is the link to the
-- Clerk Organization that owns this business (Clerk is the source of
-- truth for membership; there is no separate members table here).

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  clerk_org_id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index businesses_clerk_org_id_key on public.businesses (clerk_org_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row
  execute function public.set_updated_at();

alter table public.businesses enable row level security;
alter table public.businesses force row level security;

-- Table-level privilege: required in addition to the RLS policy below.
-- New tables are not auto-exposed to Data API roles by default (see
-- config.toml's [api] auto_expose_new_tables note) — RLS alone is not
-- enough without this GRANT.
grant select on public.businesses to authenticated;

-- Row-level policy: a signed-in user may only see the business whose
-- clerk_org_id matches their active Clerk organization. Clerk's current
-- (v2, since 2025-04-14) session token nests org claims under "o"
-- (o.id / o.slg / o.rol), not the deprecated flat org_id/org_slug/org_role.
create policy "businesses_select_own_org" on public.businesses
  for select
  to authenticated
  using (
    clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
  );
