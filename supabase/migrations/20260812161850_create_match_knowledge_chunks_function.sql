-- Tenant-scoped similarity search function (Phase 7). SECURITY INVOKER
-- (the default, stated explicitly for clarity) -- runs with the calling
-- authenticated session's own privileges, so RLS still applies. The
-- explicit p_business_id filter in the query body is defense-in-depth on
-- top of RLS, matching every other tenant-scoped query in this project
-- (docs/security.md §9: never a global similarity search).
--
-- Cosine distance (<=>) is correct for L2-normalized embeddings
-- (lib/embeddings.ts normalizes every stored vector -- gemini-embedding-001
-- does not auto-normalize truncated output, unlike gemini-embedding-2).

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
  where knowledge_chunks.business_id = p_business_id
    and knowledge_chunks.embedding is not null
  order by knowledge_chunks.embedding <=> p_query_embedding
  limit p_match_count;
$$;

grant execute on function public.match_knowledge_chunks(uuid, extensions.vector(1536), int) to authenticated;
