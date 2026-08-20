-- Phase 23: background ingestion queue. Knowledge embedding moves off the
-- request path -- creating/updating a knowledge document (manual or
-- product/service/FAQ-generated) now only writes the row itself
-- synchronously; chunking + embedding happens in a background job tracked
-- by these columns, processed by lib/ingestion-queue.ts.
--
-- No new grant/RLS surface: knowledge_documents already grants
-- `authenticated` full row-level UPDATE (STATE.md §6), so no pgTAP
-- isolation test is needed for these columns alone -- 006's existing test
-- already covers the table's grants generally.
alter table public.knowledge_documents
  add column ingestion_status text not null default 'pending'
    check (ingestion_status in ('pending', 'processing', 'complete', 'failed')),
  add column ingestion_attempts integer not null default 0,
  add column ingestion_last_error text,
  add column ingestion_next_attempt_at timestamptz not null default now(),
  add column ingestion_updated_at timestamptz;

-- Every existing document was already embedded synchronously by the
-- pre-Phase-23 request-path flow -- mark them complete so the new queue
-- only ever processes genuinely new/changed documents, not backfills
-- the whole existing corpus on first deploy.
update public.knowledge_documents
set ingestion_status = 'complete', ingestion_updated_at = now();

-- Supports the queue processor's claim query (pending rows due now).
-- 'failed' (dead-lettered) rows are terminal and never queried by this
-- index -- a retry re-enqueues by flipping status back to 'pending'.
create index knowledge_documents_ingestion_pending_idx
  on public.knowledge_documents (ingestion_next_attempt_at)
  where ingestion_status = 'pending';

-- Atomically claims up to p_limit due jobs for processing, using
-- FOR UPDATE SKIP LOCKED so the cron sweep and an after()-triggered
-- run can never double-process the same document even if they overlap.
-- security definer so it can claim across every business (a global
-- queue, not a tenant-scoped read) -- called only from
-- lib/ingestion-queue.ts via the service-role client.
create function public.claim_knowledge_ingestion_jobs(p_limit integer default 5)
returns setof public.knowledge_documents
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.knowledge_documents kd
    set ingestion_status = 'processing', ingestion_updated_at = now()
    from (
      select id
      from public.knowledge_documents
      where ingestion_status = 'pending' and ingestion_next_attempt_at <= now()
      order by ingestion_next_attempt_at
      limit p_limit
      for update skip locked
    ) claimed
    where kd.id = claimed.id
    returning kd.*;
end;
$$;

-- Per this project's standing per-function discipline (STATE.md §8: the
-- schema-wide default-privileges fix is permanently blocked on managed
-- Supabase) -- every new function needs its own explicit revoke. Only
-- the service role (which bypasses grants entirely) should ever call
-- this; anon/authenticated get nothing.
revoke execute on function public.claim_knowledge_ingestion_jobs(integer) from public, anon, authenticated;
