-- Data retention (Phase 22d, STATE.md / docs/phases.md / docs/data-retention.md):
-- a prospect conversation with no activity in the last 24 months is
-- hard-deleted, cascading to its messages and lead row via the existing
-- ON DELETE CASCADE FKs (leads.conversation_id, messages.conversation_id
-- both reference conversations(id) on delete cascade) -- one delete, no
-- residual row anywhere, per the user's explicit choice over an
-- anonymize-in-place alternative.
--
-- Installed into the extensions schema per this project's existing
-- convention (20260812161845_enable_pgvector_extension.sql,
-- 20260814160000_enable_pgtap_extension.sql) -- pg_cron creates its own
-- `cron` schema for cron.schedule()/cron.job regardless of the
-- extension's own install schema.
create extension if not exists pg_cron with schema extensions;

-- "Last activity" is the conversation's most recent message, or its own
-- created_at when it has no messages (e.g. a conversation created but
-- abandoned before the first reply). security definer + explicit
-- search_path so the daily cron job (which runs as the role that
-- scheduled it, not through PostgREST/RLS) can delete across every
-- business -- this is a global operational sweep, not a tenant-scoped
-- read, so no `authenticated` grant is added and none is needed (see the
-- default-privileges migrations: new functions get no PUBLIC/anon/authenticated
-- EXECUTE by default).
create function public.delete_expired_conversations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  with last_activity as (
    select
      c.id,
      coalesce(max(m.created_at), c.created_at) as last_active_at
    from public.conversations c
    left join public.messages m on m.conversation_id = c.id
    group by c.id, c.created_at
  ),
  expired as (
    select id from last_activity where last_active_at < now() - interval '24 months'
  )
  delete from public.conversations c
  using expired
  where c.id = expired.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Runs daily at 03:00 UTC, off peak. Job name is unique and permanent
-- (pg_cron job names cannot be edited once created, only unscheduled and
-- recreated) -- see docs/data-retention.md for the operational runbook.
select cron.schedule(
  'delete-expired-conversations',
  '0 3 * * *',
  'select public.delete_expired_conversations()'
);
