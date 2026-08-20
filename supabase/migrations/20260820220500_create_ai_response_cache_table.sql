-- Phase 23: safe response caching for low-variance questions. Only ever
-- caches a real, previously-grounded first-turn answer (see
-- lib/response-cache.ts / lib/rag.ts for the exact conditions -- no
-- escalation, no tool call, no conversation history) so a cache hit can
-- never skip a side-effecting tool (e.g. request_callback) or serve a
-- fabricated/escalation response. Short TTL (see lib/response-cache.ts),
-- not indefinite -- accepted staleness window, documented in
-- docs/architecture.md, rather than knowledge-version invalidation.
--
-- Service-role only, same pattern as ai_response_metrics/rate_limit_counters:
-- RLS enabled + forced, zero policies, no authenticated/anon grant. This
-- is derived/ephemeral data, not something a business ever reads or
-- writes directly.
create table public.ai_response_cache (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  question_hash text not null,
  answer text not null,
  used_context boolean not null,
  source_chunk_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create unique index ai_response_cache_business_question_idx
  on public.ai_response_cache (business_id, question_hash);
create index ai_response_cache_expires_at_idx on public.ai_response_cache (expires_at);

alter table public.ai_response_cache enable row level security;
alter table public.ai_response_cache force row level security;
