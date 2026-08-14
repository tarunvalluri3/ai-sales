-- Phase 15b: a new messages.role value, 'human_agent', for a staff
-- reply -- distinct from 'assistant' (AI-authored) and 'user'
-- (prospect-authored). This is the first ever `authenticated`-role
-- write into `messages`; every prior write came from the service role
-- (widget path), which bypasses grants/RLS entirely.

alter table public.messages
  drop constraint messages_role_check,
  add constraint messages_role_check check (role in ('user', 'assistant', 'human_agent'));

-- Column-scoped, matching this project's existing narrow-grant
-- precedent (businesses.widget_allowed_origin, conversations.control).
grant insert (business_id, conversation_id, role, content) on public.messages to authenticated;

-- Defense in depth (docs/security.md §3, D2): the grant alone would let
-- an authenticated caller insert into another business's conversation;
-- RLS alone would still let them insert as any role. Together:
-- (a) role must be 'human_agent' -- never 'user'/'assistant' impersonation;
-- (b) business_id must match the caller's own business;
-- (c) the target conversation must belong to that business AND currently
--     have control = 'human' -- a second, DB-level enforcement of the
--     same invariant app/api/chat/route.ts already enforces for reads
--     (prompts/phase-15a-handoff-state-and-ai-pause.md).
create policy "messages_insert_human_agent_reply" on public.messages
  for insert
  to authenticated
  with check (
    role = 'human_agent'
    and business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.business_id = messages.business_id
        and c.control = 'human'
    )
  );
