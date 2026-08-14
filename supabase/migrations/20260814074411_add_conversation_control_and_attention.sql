-- Human handoff (Phase 15a): explicit per-conversation control state and
-- an attention flag.
--
-- `control` distinguishes AI-handled from human-controlled conversations.
-- It is never set from AI output (docs/security.md §8) -- only a
-- Clerk-authenticated dashboard action (setConversationControl(), via the
-- update grant/policy below) can change it. app/api/chat/route.ts checks
-- this column before calling askSalesEmployee(), so the AI and a human
-- can never both answer the same prospect message.
--
-- `needs_attention` is a separate flag, set only by the service-role
-- widget path when the AI escalates (never by a dashboard grant -- no
-- authenticated grant exists on this column). Escalation deliberately
-- does NOT flip `control` to 'human' by itself -- see
-- prompts/phase-15a-handoff-state-and-ai-pause.md's "Decisions and
-- assumptions" #1 for the confirmed reasoning (a user-confirmed
-- reinterpretation of docs/phases.md's Phase 15 exit-criterion wording,
-- to be recorded as its own STATE.md §4 decision at this stage's
-- closure).

alter table public.conversations
  add column control text not null default 'ai' check (control in ('ai', 'human')),
  add column needs_attention boolean not null default false;

create index conversations_business_needs_attention_idx
  on public.conversations (business_id, needs_attention)
  where needs_attention = true;

-- Dashboard staff can take over / hand back a conversation. Column-scoped
-- to `control` only -- needs_attention is written exclusively by the
-- service-role widget path (app/api/chat/route.ts), which bypasses
-- grants entirely, so no authenticated grant on that column is needed or
-- added here.
grant update (control) on public.conversations to authenticated;

create policy "conversations_update_own_business" on public.conversations
  for update
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  )
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
