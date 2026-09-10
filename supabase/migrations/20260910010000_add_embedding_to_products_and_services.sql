-- Adds an embedding column to products and services, mirroring
-- 20260812161847_add_embedding_to_knowledge_chunks.sql exactly: same
-- 1536 dimensions (gemini-embedding-001 truncated from its 3072-dim
-- default, lib/embeddings.ts), same model/config as every other
-- embedding in this project -- no new provider, no new pipeline.
--
-- Nullable: existing approved rows won't get one until they're next
-- saved/approved (lib/products.ts / lib/services.ts compute it on
-- create/update/approve). A row with no embedding is simply excluded
-- by match_products/match_services' `embedding is not null` filter --
-- same no-backfill precedent as the knowledge_chunks migration.
--
-- No new grant needed: the existing table-level grants on products/
-- services already cover this column.

alter table public.products
  add column embedding extensions.vector(1536);

alter table public.services
  add column embedding extensions.vector(1536);

-- Follow-up, not built reflexively (docs/phases.md: "Create the vector
-- index when the data volume justifies it, not reflexively"). Add when
-- data volume justifies it:
--
-- create index products_embedding_idx on public.products
--   using hnsw (embedding extensions.vector_cosine_ops);
-- create index services_embedding_idx on public.services
--   using hnsw (embedding extensions.vector_cosine_ops);
