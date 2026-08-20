-- Answer citations (Phase 24): persists which knowledge chunks actually
-- grounded an assistant reply, so a staff member reviewing a conversation
-- can see what the AI's answer was based on. lib/rag.ts's
-- askSalesEmployee() already computes this per turn (sourceChunkIds,
-- since Phase 8) -- it was only ever written into the response-cache
-- table (Phase 23), never durably attached to the message itself. No
-- foreign key to knowledge_chunks: a cited chunk can later be edited or
-- deleted (regenerateChunksForDocument is delete-and-reinsert by design),
-- and the citation should still describe what was true at answer time,
-- not silently break or cascade-delete when the source content changes.
-- Empty for every non-assistant message and for any assistant message
-- that answered from the fallback/cache-miss path with no chunks.

alter table public.messages
  add column source_chunk_ids uuid[] not null default '{}';
