-- Audit trail for sensitive actions (Phase 22, STATE.md / docs/phases.md):
-- conversation takeover/hand-back, attention dismissal, and knowledge
-- document deletion. One row per action, written by the same
-- authenticated Clerk-session client that performs the action itself
-- (matching every other authenticated dashboard write's RLS shape --
-- see e.g. 20260812134819_create_knowledge_documents_table.sql), so a
-- write can never happen without a validated business membership.
--
-- Immutable by design: `authenticated` gets select + insert only, no
-- update or delete grant, so a business's own staff cannot alter or
-- erase their own audit history. actor_user_id is the raw Clerk user
-- id (text, not a local table's key -- there is no local users table).
-- metadata is a closed, no-free-text jsonb blob (identifiers/labels
-- only), matching lib/logger.ts's LogMetadata convention -- never
-- prospect message content or contact info.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  actor_user_id text not null,
  action text not null check (
    action in ('conversation.control_changed', 'conversation.attention_dismissed', 'knowledge.deleted')
  ),
  target_type text not null,
  target_id uuid not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_business_id_created_at_idx on public.audit_log (business_id, created_at desc);

alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

grant select, insert on public.audit_log to authenticated;

create policy "audit_log_select_own_business" on public.audit_log
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "audit_log_insert_own_business" on public.audit_log
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
