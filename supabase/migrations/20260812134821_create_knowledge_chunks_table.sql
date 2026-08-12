-- Knowledge chunks (Phase 6): the split pieces of a knowledge document's
-- content, produced by lib/chunking.ts. No embedding column yet -- Phase 7
-- adds pgvector storage. business_id is denormalized (not just reachable
-- via document_id) for direct tenant-scoped queries and RLS, matching the
-- products/services/faqs pattern.
--
-- Chunks are deleted and reinserted on every content change (see
-- lib/knowledge.ts's regenerateChunksForDocument), never updated in
-- place, so there is no update policy/grant on this table.

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  document_id uuid not null references public.knowledge_documents (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  char_count integer not null,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index knowledge_chunks_business_id_idx on public.knowledge_chunks (business_id);
create index knowledge_chunks_document_id_idx on public.knowledge_chunks (document_id);

alter table public.knowledge_chunks enable row level security;
alter table public.knowledge_chunks force row level security;

grant select, insert, delete on public.knowledge_chunks to authenticated;

create policy "knowledge_chunks_select_own_business" on public.knowledge_chunks
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "knowledge_chunks_insert_own_business" on public.knowledge_chunks
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "knowledge_chunks_delete_own_business" on public.knowledge_chunks
  for delete
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
