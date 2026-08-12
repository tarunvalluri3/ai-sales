-- Knowledge documents (Phase 6): the retrievable unit of business
-- knowledge. Either manually pasted/typed by a business member
-- (source_type = 'manual'), or auto-generated from a product/service/FAQ
-- row (source_type = 'product'/'service'/'faq', source_id pointing at that
-- row). Same business_id/RLS shape as products/services/faqs (Phase 5) --
-- see that migration's comments.
--
-- source_id has no FK constraint: it references one of three different
-- tables depending on source_type, which Postgres can't express as a
-- single FK. Integrity for generated documents is maintained entirely by
-- the application layer (lib/knowledge-sync.ts is the only writer of
-- non-null source_id rows).

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  source_type text not null check (source_type in ('manual', 'product', 'service', 'faq')),
  source_id uuid,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_documents_business_id_idx on public.knowledge_documents (business_id);

-- Prevents duplicate generated documents per structured record. Manual
-- documents (source_type = 'manual', source_id null) are excluded --
-- multiple manual documents with null source_id are expected.
create unique index knowledge_documents_generated_source_idx
  on public.knowledge_documents (business_id, source_type, source_id)
  where source_type <> 'manual';

create trigger knowledge_documents_set_updated_at
  before update on public.knowledge_documents
  for each row
  execute function public.set_updated_at();

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_documents force row level security;

grant select, insert, update, delete on public.knowledge_documents to authenticated;

create policy "knowledge_documents_select_own_business" on public.knowledge_documents
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "knowledge_documents_insert_own_business" on public.knowledge_documents
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "knowledge_documents_update_own_business" on public.knowledge_documents
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

create policy "knowledge_documents_delete_own_business" on public.knowledge_documents
  for delete
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
