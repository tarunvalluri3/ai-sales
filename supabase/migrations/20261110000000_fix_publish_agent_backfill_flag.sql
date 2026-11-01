-- Fix: a real publish never set businesses.published_at.
--
-- 20261107000000_agent_draft_publish.sql defined publish_agent() -- the one
-- authenticated publish entry point -- as
--   agent_publish_internal(p_business_id, actor, true)
-- The third argument is p_is_backfill, which is meant to be true ONLY for that
-- migration's own v1 backfill. Passing true from publish_agent() made every
-- owner publish behave like the backfill:
--   - live_version_id WAS set (so the dashboard header showed "Live"), but
--   - published_at, onboarding_step = 'live' and onboarding_completed_at were
--     left untouched, so a business publishing for the first time stayed
--     "unpublished" everywhere that reads published_at: the widget chat API
--     (401 for every visitor), the dashboard gate (redirect to widget
--     settings), the onboarding wizard (Draft) and the answer bank; and
--   - the "knowledge still embedding" guard (AGENT_PUBLISH_PROCESSING) was
--     skipped, so a publish could freeze a half-embedded document.
-- Businesses published before 20261107000000 were unaffected at runtime (their
-- published_at was already set), but their republishes never re-stamped it.
--
-- 1. publish_agent() now passes p_is_backfill = false. Same signature, same
--    grants, same tenant check.
-- 2. Data repair for rows the bug left inconsistent: live_version_id set but
--    published_at null, active and not soft-deleted (a suspended or deleted
--    business is left exactly as it is; if reinstated it is still live via
--    live_version_id, and its next publish stamps published_at). Writes what
--    agent_publish_internal() would have: published_at, onboarding_step,
--    onboarding_completed_at, then live_answer_bank_version stamped AFTER the
--    answer-bank bump trigger has run (second statement), so the stored
--    instant answers regenerated for the new published_at are the ones the
--    live agent may serve. It does NOT re-run the "knowledge still embedding"
--    check and creates no new version: the live version and its frozen chunks
--    are already what prospects are served; this only stamps the columns.
-- No schema change.

create or replace function public.publish_agent(p_business_id uuid)
returns table (version_id uuid, version int, changed boolean, previous_version_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org text := (select auth.jwt()) -> 'o' ->> 'id';
  v_actor text := (select auth.jwt()) ->> 'sub';
begin
  -- (no #variable_conflict needed: no query below names an output column)
  if v_org is null or not exists (
    select 1 from public.businesses where id = p_business_id and clerk_org_id = v_org
  ) then
    raise exception 'AGENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query select * from public.agent_publish_internal(p_business_id, coalesce(v_actor, 'unknown'), false);
end;
$$;

revoke execute on function public.publish_agent(uuid) from public, anon;
grant execute on function public.publish_agent(uuid) to authenticated;

-- 2. Repair. The ids are captured first so the second statement touches only
-- the rows this migration repaired, not every business.
do $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_ids
  from public.businesses
  where live_version_id is not null
    and published_at is null
    and status = 'active'
    and deleted_at is null;

  update public.businesses b
  set published_at = now(),
      onboarding_step = 'live',
      onboarding_completed_at = coalesce(b.onboarding_completed_at, now())
  where b.id = any(v_ids);

  update public.businesses b
  set live_answer_bank_version = b.answer_bank_version
  where b.id = any(v_ids);
end;
$$;
