-- Fixes lib/knowledge-sync.ts's syncGeneratedDocument() upsert, which was
-- failing with Postgres error 42P10 ("no unique or exclusion constraint
-- matching the ON CONFLICT specification"). The original
-- knowledge_documents_generated_source_idx (see
-- 20260812134819_create_knowledge_documents_table.sql) was a PARTIAL
-- unique index (`where source_type <> 'manual'`). Postgres's ON CONFLICT
-- inference requires the inference specification to match the index's
-- predicate exactly, and supabase-js's upsert({ onConflict: '...' })
-- has no way to express a partial-index predicate -- it can only name
-- columns. Every syncGeneratedDocument() call has been failing since
-- Phase 6 shipped.
--
-- Fix: drop the partial predicate. Safe -- Postgres never treats
-- NULL = NULL as a match in a unique constraint, so manual documents
-- (source_id always null) still never conflict with each other or with
-- generated documents under a full (non-partial) index.

drop index public.knowledge_documents_generated_source_idx;

create unique index knowledge_documents_generated_source_idx
  on public.knowledge_documents (business_id, source_type, source_id);
