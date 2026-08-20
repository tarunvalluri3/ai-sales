-- AI response latency/cost metrics (Phase 21, STATE.md / docs/phases.md).
-- One row per successful askSalesEmployee() call (lib/rag.ts) -- never
-- written on the no-knowledge fallback path, since no Gemini call was
-- made there. No message content, no prospect contact info: only
-- counts and durations, matching lib/logger.ts's LogMetadata
-- convention for everything else this project logs.
--
-- Written exclusively by the service-role client from within the public
-- chat route (app/api/chat/route.ts calls askSalesEmployee() with
-- createServiceSupabaseClient(), same as every other write on that
-- unauthenticated path) -- there is no `authenticated`-role INSERT
-- grant, matching this table's read-only-from-the-dashboard purpose.

create table public.ai_response_metrics (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  latency_ms integer not null,
  input_tokens integer not null,
  output_tokens integer not null,
  tool_call_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index ai_response_metrics_business_id_idx on public.ai_response_metrics (business_id);
create index ai_response_metrics_created_at_idx on public.ai_response_metrics (created_at);

alter table public.ai_response_metrics enable row level security;
alter table public.ai_response_metrics force row level security;

-- Select-only grant: the dashboard's Analytics page reads this table
-- under a real Clerk-authenticated session (docs/security.md); every
-- write happens through the service-role client, which bypasses grants
-- and RLS entirely, same as every other service-role write path.
grant select on public.ai_response_metrics to authenticated;

create policy "ai_response_metrics_select_own_business" on public.ai_response_metrics
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
