-- Leads (Phase 10): the resolved decision D6 field specification,
-- PRODUCT.md §8. Same business_id-scoped RLS/grant shape as
-- products/services/faqs/knowledge_documents. conversation_id references
-- the minimal conversations stub created alongside this migration.
--
-- interest_id has no FK constraint: it references either products or
-- services depending on interest_type, which Postgres can't express as a
-- single FK -- same precedent as knowledge_documents.source_id (Phase 6).
-- Integrity is app-enforced: lib/lead-capture.ts resolves interest_id via
-- a tenant-scoped exact-name lookup, never from raw AI output.
--
-- qualification/qualification_reason are AI-generated, untrusted,
-- display-only fields (PRODUCT.md §8, same trust category as Phase 9's
-- escalate/usedContext) -- never used for authorization or tenant scoping.
--
-- The "at least one of contact_email/contact_phone" rule is enforced at
-- three layers project-wide (app logic, Zod refine, this check
-- constraint) -- this is the database layer, intentional redundancy.

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  contact_name text,
  contact_email text,
  contact_phone text,
  interest_type text check (interest_type in ('product', 'service', 'general')),
  interest_id uuid,
  notes text,
  qualification text not null check (qualification in ('hot', 'warm', 'cold')),
  qualification_reason text not null,
  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'lost')),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_contact_required check (contact_email is not null or contact_phone is not null)
);

create index leads_business_id_idx on public.leads (business_id);
create index leads_conversation_id_idx on public.leads (conversation_id);

-- Reuses public.set_updated_at(), already defined by the businesses migration.
create trigger leads_set_updated_at
  before update on public.leads
  for each row
  execute function public.set_updated_at();

alter table public.leads enable row level security;
alter table public.leads force row level security;

-- Table-level privilege: required in addition to RLS policies below. New
-- tables default to zero grants (see the default-privileges migration) --
-- an explicit GRANT is not optional here.
grant select, insert, update, delete on public.leads to authenticated;

-- Any authenticated member of the owning org may CRUD their business's
-- leads (resolved decision D7's precedent, applied here per the Phase 10
-- prompt -- no owner/admin restriction, same shape as products/services/faqs).
create policy "leads_select_own_business" on public.leads
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "leads_insert_own_business" on public.leads
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "leads_update_own_business" on public.leads
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

create policy "leads_delete_own_business" on public.leads
  for delete
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
