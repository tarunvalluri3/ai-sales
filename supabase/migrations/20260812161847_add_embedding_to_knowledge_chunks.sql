-- Adds the embedding column to knowledge_chunks (Phase 7). 1536
-- dimensions -- resolved decision D3, STATE.md: gemini-embedding-001
-- truncated from its 3072-dim default, fits under pgvector's
-- 2000-dimension HNSW index limit with the standard vector type.
--
-- Nullable: existing rows created during Phase 6 testing (before this
-- migration) have no embedding and won't get one until their parent
-- document is re-saved (lib/knowledge.ts's regenerateChunksForDocument
-- now generates embeddings on every regeneration). No backfill script
-- this phase -- see the Phase 7 prompt's "Out of scope".
--
-- No new grant needed: table-level grant, insert/select/delete on
-- knowledge_chunks, is already in place from the Phase 6 migration and
-- covers this column too -- Postgres does not grant per-column by
-- default when a table grant already exists.

alter table public.knowledge_chunks
  add column embedding extensions.vector(1536);

-- Follow-up, not built reflexively (docs/phases.md: "Create the vector
-- index when the data volume justifies it, not reflexively"). Add when
-- data volume justifies it:
--
-- create index knowledge_chunks_embedding_idx on public.knowledge_chunks
--   using hnsw (embedding extensions.vector_cosine_ops);
