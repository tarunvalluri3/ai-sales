-- Messages (Phase 11): real persisted chat turns, both prospect and AI,
-- for a conversation. Extends the Phase 10 conversations stub with the
-- real contract (docs/architecture.md's Phase 10 note anticipated this).
--
-- Written only via the service-role widget path (lib/messages.ts, called
-- with lib/supabase/service.ts's client from app/api/chat/route.ts) --
-- there is no Clerk session on that path for RLS to key off of, so this
-- table's INSERT is not granted to authenticated/anon at all. SELECT is
-- granted to authenticated (business-scoped) for a future Phase 13
-- dashboard conversation view -- no page reads it yet.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index messages_business_conversation_created_idx
  on public.messages (business_id, conversation_id, created_at);

alter table public.messages enable row level security;
alter table public.messages force row level security;

-- Table-level privilege: required in addition to the RLS policy below.
-- New tables default to zero grants -- SELECT only, no INSERT/UPDATE/
-- DELETE for authenticated (only the service role writes, and it
-- bypasses grants and RLS entirely).
grant select on public.messages to authenticated;

create policy "messages_select_own_business" on public.messages
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
