-- Phase 33 Stop 3 (docs/phases.md): event tracking + daily rollups for the
-- /apache Analytics and AI Usage & Costs pages.
--
-- Two tables:
--   1. analytics_events -- a first-party event log (approved brief),
--      written at a small number of genuinely new signals this app has no
--      other record of (signup, first publish). Most of the activation
--      funnel/DAU-MAU/channel-mix numbers this phase needs are NOT
--      duplicated into events -- they are computed directly from
--      conversations/leads/appointments/subscriptions' own timestamps by
--      the rollup job below, which is both lower-risk (no new
--      instrumentation on the hot chat/billing paths) and more honest (no
--      second copy of data that can drift from the source of truth).
--   2. analytics_daily_rollups -- one row per business per IST calendar
--      day (approved amendment 8), computed by a scheduled job
--      (lib/analytics-rollup.ts, folded into the existing shared cron
--      route per its own documented "one route, not one cron per queue"
--      constraint -- app/api/cron/process-ingestion-queue/route.ts).
--      Dashboards read ONLY this table, never aggregate raw
--      conversations/leads/appointments live across every tenant.
--
-- Indexing/retention (approved amendment 8):
--   - analytics_events: indexed on (business_id, event_name, created_at)
--     for the handful of lookups this phase needs, and on (created_at)
--     alone for the retention sweep below. Retention: 180 days, deleted
--     by a new pg_cron job (same mechanism as the existing
--     rate_limit_counters/ai_response_cache cleanup, 20260820221000) --
--     an event log with no retention bound would grow forever, and
--     nothing reads an event this old (the rollup already captured
--     whatever it mattered for).
--   - analytics_daily_rollups: indexed on rollup_date (platform-wide
--     queries) and (business_id, rollup_date) (per-tenant queries).
--     Never purged -- one row per business per day is small and is the
--     whole point of a rollup (cheap to keep, expensive to recompute).
--
-- ROLLBACK:
--   select cron.unschedule('delete-expired-analytics-events');
--   drop function public.delete_expired_analytics_events();
--   drop table public.analytics_daily_rollups;
--   drop table public.analytics_events;

-- ===================================================================
-- 1. analytics_events
-- ===================================================================

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id text,
  event_name text not null,
  properties jsonb,
  created_at timestamptz not null default now()
);

create index analytics_events_business_event_created_idx on public.analytics_events (business_id, event_name, created_at desc);
create index analytics_events_created_at_idx on public.analytics_events (created_at);

alter table public.analytics_events enable row level security;
alter table public.analytics_events force row level security;

-- INSERT only, same shape as audit_log's grant (20260820180000): a
-- business's own authenticated session may record its own events (e.g.
-- the dashboard firing a "first publish" event inline with the publish
-- action), but may never read ANY event, its own included -- this is
-- platform-analytics input, not tenant-facing data, read only by the
-- admin service-role client (lib/supabase/admin.ts) from /apache. The
-- service-role client (cron/webhook contexts with no Clerk session)
-- bypasses RLS and this grant entirely, same as every other sweep-written
-- table in this codebase (lib/sla-routing.ts, lib/notifications.ts).
grant insert on public.analytics_events to authenticated;

create policy "analytics_events_insert_own_business" on public.analytics_events
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create function public.delete_expired_analytics_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.analytics_events where created_at < now() - interval '180 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

select cron.schedule(
  'delete-expired-analytics-events',
  '40 3 * * *',
  'select public.delete_expired_analytics_events()'
);

-- ===================================================================
-- 2. analytics_daily_rollups
-- ===================================================================

create table public.analytics_daily_rollups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- IST calendar date (approved amendment 8) -- a plain date, not a
  -- timestamptz, since "which day" is a tenant-timezone-independent
  -- platform-wide bucketing decision, not the business's own timezone.
  rollup_date date not null,
  conversations_count integer not null default 0,
  leads_count integer not null default 0,
  appointments_count integer not null default 0,
  channel_website_count integer not null default 0,
  channel_whatsapp_count integer not null default 0,
  channel_instagram_count integer not null default 0,
  -- Whether this business had at least one real (non-sandbox) conversation
  -- this day -- the DAU/WAU/MAU building block (lib/analytics-rollup.ts).
  was_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (business_id, rollup_date)
);

create index analytics_daily_rollups_date_idx on public.analytics_daily_rollups (rollup_date);
create index analytics_daily_rollups_business_date_idx on public.analytics_daily_rollups (business_id, rollup_date);

alter table public.analytics_daily_rollups enable row level security;
alter table public.analytics_daily_rollups force row level security;

-- No grants to anon/authenticated at all -- written by the cron job's
-- service-role client, read only by /apache's admin service-role client.
