-- Knowledge versioning with a draft/publish approval step (Phase 24).
-- `status` defaults to 'published' so every existing row (manual and
-- auto-generated alike) stays exactly as live as it is today -- this
-- migration must not silently take anything off the AI's reference
-- context. Only new manual documents (lib/knowledge.ts's
-- createKnowledgeDocument) start as 'draft' going forward; auto-generated
-- product/service/faq documents (lib/knowledge-sync.ts) have no draft
-- workflow at all -- they mirror a live catalog row, so there is nothing
-- to "review" before it goes live, and they keep inserting with no
-- explicit status (picking up the 'published' default).
--
-- `version` increments each time a document is published -- a simple
-- counter, not itself the history; `knowledge_document_versions` is the
-- append-only snapshot history, one row per publish.

alter table public.knowledge_documents
  add column status text not null default 'published' check (status in ('draft', 'published')),
  add column version int not null default 1,
  add column published_at timestamptz;

update public.knowledge_documents set published_at = created_at where status = 'published';

create table public.knowledge_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  version int not null,
  title text not null,
  content text not null,
  published_by text not null,
  published_at timestamptz not null default now()
);

create index knowledge_document_versions_document_id_idx
  on public.knowledge_document_versions (document_id, version desc);

alter table public.knowledge_document_versions enable row level security;
alter table public.knowledge_document_versions force row level security;

-- Immutable history: authenticated gets select + insert only, matching
-- audit_log's own immutability convention.
grant select, insert on public.knowledge_document_versions to authenticated;

create policy "knowledge_document_versions_select_own_business" on public.knowledge_document_versions
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "knowledge_document_versions_insert_own_business" on public.knowledge_document_versions
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

-- Retrieval must only ever surface published knowledge -- a draft is a
-- review-in-progress state, not approved business knowledge, and must
-- never ground an AI answer (AGENTS.md rule 4). Re-scoped from
-- knowledge_chunks alone (which has no status of its own) to join its
-- parent document's status.
create or replace function public.match_knowledge_chunks(
  p_business_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    knowledge_chunks.id,
    knowledge_chunks.document_id,
    knowledge_chunks.content,
    1 - (knowledge_chunks.embedding <=> p_query_embedding) as similarity
  from public.knowledge_chunks
  join public.knowledge_documents on knowledge_documents.id = knowledge_chunks.document_id
  where knowledge_chunks.business_id = p_business_id
    and knowledge_chunks.embedding is not null
    and knowledge_documents.status = 'published'
  order by knowledge_chunks.embedding <=> p_query_embedding
  limit p_match_count;
$$;

grant execute on function public.match_knowledge_chunks(uuid, extensions.vector(1536), int) to authenticated;
