-- Conversations (Phase 10): a minimal stub table, not Phase 11's real
-- chat/message model. It exists solely to give leads.conversation_id a
-- real, required FK target -- see prompts/phase-10-lead-extraction-creation.md's
-- "User request" section for why Phase 10 needed this ahead of Phase 11
-- (confirmed with the user directly, not assumed). No messages table, no
-- status, no ended_at, no chat API -- Phase 11 extends this table with
-- the real contract.
--
-- A conversation row is created lazily, only at the moment a lead is
-- actually captured (lib/lead-capture.ts) -- a test conversation that
-- never yields contact info leaves zero trace here, by design (see the
-- prompt's Decision 2).

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  source text,
  created_at timestamptz not null default now()
);

create index conversations_business_id_idx on public.conversations (business_id);

alter table public.conversations enable row level security;
alter table public.conversations force row level security;

-- Table-level privilege: required in addition to RLS policies below. New
-- tables default to zero grants (see the default-privileges migration) --
-- an explicit GRANT is not optional here. No update/delete grant: this
-- phase never modifies or removes a conversation row.
grant select, insert on public.conversations to authenticated;

create policy "conversations_select_own_business" on public.conversations
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "conversations_insert_own_business" on public.conversations
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
