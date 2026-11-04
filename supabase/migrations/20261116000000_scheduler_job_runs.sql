-- Production readiness, item 3 (LAUNCH_AUDIT.md §2, blocker B3): a scheduler
-- that is safe to trigger every few minutes from any host (a VPS crontab,
-- Vercel Cron, a manual call), instead of one daily Vercel cron running 13
-- sweeps in a single Promise.all.
--
--   1. public.scheduled_job_runs -- one row per job: a lease lock (so two
--      overlapping triggers never run the same job at once), and the last
--      start/success/failure (so daily jobs run once a day however often the
--      trigger fires, and repeated failures can alert).
--   2. try_acquire_scheduled_job / release_scheduled_job -- atomic lease.
--   3. release_stale_queue_claims -- rows left in 'processing' by an instance
--      that died mid-batch went back to nothing ever retrying them; this puts
--      them back to 'pending' after a timeout.
--   4. conversations.sla_escalated_at -- the SLA sweep re-assigned (and
--      notified) every overdue conversation on EVERY run. Harmless once a day,
--      spam every few minutes. It now escalates a conversation at most once
--      per SLA period.

-- ---------------------------------------------------------------------- 1

create table public.scheduled_job_runs (
  job_name text primary key check (job_name ~ '^[a-z][a-z0-9_]{1,62}$'),
  locked_until timestamptz,
  locked_by text,
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_error text,
  last_duration_ms integer,
  last_result jsonb,
  consecutive_failures integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.scheduled_job_runs enable row level security;
alter table public.scheduled_job_runs force row level security;

-- Operational data, read and written only by the service-role scheduler and
-- the service-role /apache admin pages (which re-check requirePlatformAdmin).
-- No grant to anon/authenticated, and an explicit deny policy so that a
-- future accidental grant still exposes nothing.
revoke all on public.scheduled_job_runs from anon, authenticated;
create policy scheduled_job_runs_no_client_access
  on public.scheduled_job_runs
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------- 2

-- Takes the job's lease if it is free or expired. Returns true only for the
-- caller that got it. The lease expires on its own (p_ttl_seconds), so a run
-- killed mid-job never blocks the job for good.
create function public.try_acquire_scheduled_job(p_job text, p_owner text, p_ttl_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean;
begin
  insert into public.scheduled_job_runs as r (job_name, locked_until, locked_by, last_started_at, updated_at)
  values (p_job, now() + make_interval(secs => p_ttl_seconds), p_owner, now(), now())
  on conflict (job_name) do update
    set locked_until = excluded.locked_until,
        locked_by = excluded.locked_by,
        last_started_at = excluded.last_started_at,
        updated_at = now()
    where r.locked_until is null or r.locked_until < now()
  returning true into acquired;
  return coalesce(acquired, false);
end;
$$;

-- Records the outcome and frees the lease -- only if the caller still holds
-- it (a run that overran its lease must not clobber the newer run's state).
create function public.release_scheduled_job(
  p_job text,
  p_owner text,
  p_succeeded boolean,
  p_error text,
  p_duration_ms integer,
  p_result jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  failures integer;
begin
  update public.scheduled_job_runs
  set locked_until = null,
      locked_by = null,
      last_succeeded_at = case when p_succeeded then now() else last_succeeded_at end,
      last_failed_at = case when p_succeeded then last_failed_at else now() end,
      last_error = case when p_succeeded then null else left(p_error, 500) end,
      last_duration_ms = p_duration_ms,
      last_result = case when p_succeeded then p_result else last_result end,
      consecutive_failures = case when p_succeeded then 0 else consecutive_failures + 1 end,
      updated_at = now()
  where job_name = p_job and locked_by = p_owner
  returning consecutive_failures into failures;
  return coalesce(failures, -1);
end;
$$;

revoke execute on function public.try_acquire_scheduled_job(text, text, integer) from public, anon, authenticated;
revoke execute on function public.release_scheduled_job(text, text, boolean, text, integer, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------- 3

-- Puts queue rows stuck in 'processing' for longer than p_stale_seconds back
-- to 'pending'. Counts the stuck attempt, so a row that keeps killing its
-- worker still reaches its queue's dead-letter limit instead of looping.
-- (workflow_runs needs nothing: its claim already re-picks 'running' rows.)
create function public.release_stale_queue_claims(p_stale_seconds integer default 900)
returns table (queue text, released integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := now() - make_interval(secs => p_stale_seconds);
  n integer;
begin
  update public.knowledge_documents
  set ingestion_status = 'pending',
      ingestion_attempts = ingestion_attempts + 1,
      ingestion_next_attempt_at = now(),
      ingestion_updated_at = now()
  where ingestion_status = 'processing' and ingestion_updated_at < cutoff;
  get diagnostics n = row_count;
  queue := 'knowledge_ingestion'; released := n; return next;

  update public.webhook_deliveries
  set status = 'pending', attempts = attempts + 1, next_attempt_at = now(), updated_at = now()
  where status = 'processing' and updated_at < cutoff;
  get diagnostics n = row_count;
  queue := 'webhook_deliveries'; released := n; return next;

  update public.whatsapp_outbound_messages
  set status = 'pending', attempts = attempts + 1, next_attempt_at = now(), updated_at = now()
  where status = 'processing' and updated_at < cutoff;
  get diagnostics n = row_count;
  queue := 'whatsapp_outbound'; released := n; return next;

  update public.instagram_outbound_messages
  set status = 'pending', attempts = attempts + 1, next_attempt_at = now(), updated_at = now()
  where status = 'processing' and updated_at < cutoff;
  get diagnostics n = row_count;
  queue := 'instagram_outbound'; released := n; return next;
end;
$$;

revoke execute on function public.release_stale_queue_claims(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------- 4

alter table public.conversations add column sla_escalated_at timestamptz;
