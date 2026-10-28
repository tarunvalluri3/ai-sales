-- Per-raw-API-call Gemini usage log (token-burn audit, 2026-10-28). One row
-- per Gemini API call made anywhere in the app -- chat completions
-- (JSON and streaming), the concurrent streaming metadata call, tool-loop
-- iterations, embeddings, knowledge extraction, summaries, tag
-- suggestions, suggested questions, copilot, cron sweeps, and dev/test
-- scripts. Written by lib/gemini-usage-log.ts's recordGeminiUsage(),
-- fire-and-forget, from the service-role client -- see that file's header
-- for why this is a new table rather than a widened `ai_response_metrics`
-- (that table is one row per billable reply with NOT NULL business/
-- conversation FKs that lib/analytics.ts and lib/usage-limit.ts already
-- depend on; this one is a different grain and is never read by a tenant
-- dashboard).
--
-- No foreign keys on business_id/conversation_id, deliberately: a logging
-- write must never fail because a row it references was deleted
-- concurrently (conversation retention cleanup already runs on a cron,
-- STATE.md) or never existed in the first place (an eval/red-team script
-- against a seeded test business, a bare embedding call with no
-- conversation). Both columns are nullable for the same reason -- a cron
-- sweep iterating leads has a business_id but the embedding calls inside
-- lib/retrieval.ts do not always have a conversation_id in scope.
--
-- RLS enabled and forced, but with NO grants to `authenticated` or `anon`
-- at all -- unlike `ai_response_metrics`/`guardrail_events`, this table is
-- not tenant-scoped data (many rows have no business_id, or belong to a
-- script run against a seeded test business) and is not meant to back any
-- per-business dashboard view. It exists for engineering/ops to query
-- directly (Supabase SQL editor or the service-role client), the same
-- access level as `rate_limit_counters` already has.

create table public.gemini_api_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  feature text not null,
  trigger text not null check (trigger in ('user', 'webhook_whatsapp', 'webhook_instagram', 'widget', 'dashboard', 'cron', 'script')),
  environment text not null check (environment in ('development', 'preview', 'production')),
  model text not null,
  prompt_tokens integer,
  candidates_tokens integer,
  thoughts_tokens integer,
  cached_content_tokens integer,
  total_tokens integer,
  duration_ms integer not null,
  success boolean not null,
  error_message text,
  business_id uuid,
  conversation_id uuid,
  request_id text
);

create index gemini_api_calls_created_at_feature_idx on public.gemini_api_calls (created_at, feature);

alter table public.gemini_api_calls enable row level security;
alter table public.gemini_api_calls force row level security;

-- No grants at all (see header): every write is from the service-role
-- client, which bypasses RLS and grants entirely, and reads are expected
-- to happen the same way -- directly against the database, not through
-- PostgREST under a Clerk session.

-- Tokens per day, by feature/trigger/environment -- the shape the token-burn
-- audit asked for. Not security_invoker: the base table has no
-- `authenticated`/`anon` grant either, so this view is reachable only the
-- same way the table is, by the service role or direct SQL access.
create view public.gemini_usage_daily as
select
  date_trunc('day', created_at) as day,
  feature,
  trigger,
  environment,
  count(*) as call_count,
  count(*) filter (where not success) as error_count,
  sum(prompt_tokens) as prompt_tokens,
  sum(candidates_tokens) as candidates_tokens,
  sum(thoughts_tokens) as thoughts_tokens,
  sum(cached_content_tokens) as cached_content_tokens,
  sum(total_tokens) as total_tokens,
  avg(duration_ms) as avg_duration_ms
from public.gemini_api_calls
group by 1, 2, 3, 4
order by 1 desc, 5 desc nulls last;
