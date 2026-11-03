-- Production readiness, item 2 (LAUNCH_AUDIT.md §1, §2, §13, blocker B4):
-- a failed or lost AI reply on WhatsApp/Instagram must never be silent.
--
-- The inbound dedup row is written BEFORE the reply is produced (so a Meta
-- redelivery is a no-op and can never cause a duplicate reply). That also
-- meant a reply lost after the 200 -- the instance dying inside after(), a
-- crash mid-turn -- was gone for good: the redelivery is skipped and nothing
-- recorded that no reply went out.
--
-- `reply_status` records what happened to each inbound message:
--   pending    -- stored, reply not finished yet (set by the webhook)
--   replied    -- an AI/instant/canned reply was queued
--   skipped    -- deliberately no reply (human in control, not serving,
--                 rate-limited, suspended ...)
--   failed     -- the reply failed; the safe fallback was attempted and the
--                 conversation flagged for the team
--   recovering -- claimed by the recovery sweep
--   recovered  -- the sweep found it stuck and sent the fallback + flagged it
-- NULL for rows written before this migration: the sweep never touches them.
--
-- No new table, no grant change: both tables stay service-role only (RLS
-- forced, zero authenticated grants, unchanged).

alter table public.whatsapp_inbound_messages
  add column reply_status text
    check (reply_status in ('pending', 'replied', 'skipped', 'failed', 'recovering', 'recovered')),
  add column reply_updated_at timestamptz;

alter table public.instagram_inbound_messages
  add column reply_status text
    check (reply_status in ('pending', 'replied', 'skipped', 'failed', 'recovering', 'recovered')),
  add column reply_updated_at timestamptz;

create index whatsapp_inbound_messages_reply_pending_idx
  on public.whatsapp_inbound_messages (created_at)
  where reply_status = 'pending';

create index instagram_inbound_messages_reply_pending_idx
  on public.instagram_inbound_messages (created_at)
  where reply_status = 'pending';

-- Claims inbound messages whose reply never finished: still 'pending' after
-- p_stuck_after_seconds, but not older than p_max_age_seconds (a days-old
-- message is better left to the team than answered with a late fallback).
-- Same `for update skip locked` claim as claim_whatsapp_outbound_messages(),
-- so two overlapping sweeps can never claim the same row.
create function public.claim_stuck_inbound_replies(
  p_channel text,
  p_stuck_after_seconds integer default 300,
  p_max_age_seconds integer default 21600,
  p_limit integer default 20
)
returns table (id uuid, business_id uuid, conversation_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_channel = 'whatsapp' then
    return query
      update public.whatsapp_inbound_messages t
      set reply_status = 'recovering', reply_updated_at = now()
      from (
        select w.id
        from public.whatsapp_inbound_messages w
        where w.reply_status = 'pending'
          and w.created_at < now() - make_interval(secs => p_stuck_after_seconds)
          and w.created_at > now() - make_interval(secs => p_max_age_seconds)
        order by w.created_at
        limit p_limit
        for update skip locked
      ) claimed
      where t.id = claimed.id
      returning t.id, t.business_id, t.conversation_id, t.created_at;
  elsif p_channel = 'instagram' then
    return query
      update public.instagram_inbound_messages t
      set reply_status = 'recovering', reply_updated_at = now()
      from (
        select i.id
        from public.instagram_inbound_messages i
        where i.reply_status = 'pending'
          and i.created_at < now() - make_interval(secs => p_stuck_after_seconds)
          and i.created_at > now() - make_interval(secs => p_max_age_seconds)
        order by i.created_at
        limit p_limit
        for update skip locked
      ) claimed
      where t.id = claimed.id
      returning t.id, t.business_id, t.conversation_id, t.created_at;
  else
    raise exception 'claim_stuck_inbound_replies: unknown channel %', p_channel;
  end if;
end;
$$;

revoke execute on function public.claim_stuck_inbound_replies(text, integer, integer, integer) from public, anon, authenticated;
