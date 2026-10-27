-- Guardrail signal log (guardrails Phase 1). One row per guardrail trigger on
-- a visitor message: the persisted record behind the `guardrail_signal` log
-- event. It exists because the logs alone cannot support the rollout plan --
-- Vercel Hobby keeps ~30 minutes of function logs, and the classifier checks
-- start log-only so that about a week of signals can be reviewed for false
-- positives before any of them is switched to enforcing. It also lets the
-- owner-facing "flagged by guardrails" marker (Phase 5) count triggers by
-- type per business.
--
-- Metadata only: signal type, the stable rule id that fired, what was done,
-- and the check's rollout mode. NEVER the message text -- the whole point of
-- masking card/OTP numbers is that they are not kept, and a log of attack
-- payloads would be a second copy of exactly that content.
--
-- Written exclusively by the service-role client (the public chat route and
-- the channel webhooks run without a Clerk session); the dashboard gets
-- select-only under RLS, same shape as ai_response_metrics.

create table public.guardrail_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  channel text not null,
  signal text not null,
  rule text not null,
  action text not null check (action in ('logged', 'masked', 'sanitized', 'truncated', 'blocked', 'replaced', 'removed')),
  mode text not null check (mode in ('log_only', 'enforce')),
  created_at timestamptz not null default now()
);

create index guardrail_events_business_created_idx on public.guardrail_events (business_id, created_at desc);
create index guardrail_events_conversation_idx on public.guardrail_events (conversation_id) where conversation_id is not null;

alter table public.guardrail_events enable row level security;
alter table public.guardrail_events force row level security;

grant select on public.guardrail_events to authenticated;

create policy "guardrail_events_select_own_business" on public.guardrail_events
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
