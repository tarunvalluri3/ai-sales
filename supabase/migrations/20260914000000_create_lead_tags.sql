-- Phase 27 (lead tagging / segmentation): a business-scoped tag catalog
-- (lead_tags) plus two typed join tables (lead_tag_assignments,
-- conversation_tag_assignments) -- real foreign keys with cascade delete,
-- not the polymorphic interest_type/interest_id pattern leads already uses
-- elsewhere (D6), since a tag catalog benefits from real referential
-- integrity a business will actually rely on (deleting a tag should
-- genuinely remove it everywhere, not leave orphaned ids).
--
-- Tag color reuses the dashboard's existing 5-tone Badge vocabulary
-- (warning/success/danger/muted/accent) rather than inventing a new
-- decorative palette -- AGENTS.md §10 is explicit that this app has no
-- supplied design system beyond what's already approved, and a tag chip
-- is rendered with the same `<Badge>` component every other status pill
-- on this dashboard already uses. Reusing Badge's tones here is purely a
-- rendering choice, not a claim that a tag's color is a status signal.
--
-- Both join tables carry business_id directly (denormalized, same
-- convention as every other business-owned table in this project) and
-- their insert policy's `with check` additionally verifies the
-- referenced lead/conversation and tag actually belong to that same
-- business_id -- real DB-level defense in depth (AGENTS.md §3 rule 1),
-- not just app-layer discipline, since a plain FK alone can't express
-- "these three ids must all agree on business_id."

create table public.lead_tags (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  color text not null default 'muted' check (
    color in ('warning', 'success', 'danger', 'muted', 'accent')
  ),
  created_at timestamptz not null default now(),
  constraint lead_tags_name_length check (char_length(name) between 1 and 40)
);

-- Case-insensitive uniqueness per business -- prevents a business from
-- accumulating near-duplicate tags ("VIP" vs "vip") the way an
-- unconstrained free-text field would.
create unique index lead_tags_business_id_name_idx on public.lead_tags (business_id, lower(name));
create index lead_tags_business_id_idx on public.lead_tags (business_id);

alter table public.lead_tags enable row level security;
alter table public.lead_tags force row level security;

-- Any authenticated org member may manage tags at the RLS layer -- the
-- app layer additionally requires org:sales_agent minimum (this app's
-- own authorization tier on top, matching every other lead-mutation
-- action), same "RLS is the floor, the app enforces the real policy"
-- shape already used throughout this project.
grant select, insert, update, delete on public.lead_tags to authenticated;

create policy "lead_tags_select_own_business" on public.lead_tags
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "lead_tags_insert_own_business" on public.lead_tags
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "lead_tags_update_own_business" on public.lead_tags
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

create policy "lead_tags_delete_own_business" on public.lead_tags
  for delete
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create table public.lead_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  tag_id uuid not null references public.lead_tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (lead_id, tag_id)
);

create index lead_tag_assignments_lead_id_idx on public.lead_tag_assignments (lead_id);
create index lead_tag_assignments_tag_id_idx on public.lead_tag_assignments (tag_id);
create index lead_tag_assignments_business_id_idx on public.lead_tag_assignments (business_id);

alter table public.lead_tag_assignments enable row level security;
alter table public.lead_tag_assignments force row level security;

-- No update grant -- a chip is added or removed, never edited in place.
grant select, insert, delete on public.lead_tag_assignments to authenticated;

create policy "lead_tag_assignments_select_own_business" on public.lead_tag_assignments
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "lead_tag_assignments_insert_own_business" on public.lead_tag_assignments
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
    and exists (
      select 1 from public.leads l
      where l.id = lead_id and l.business_id = lead_tag_assignments.business_id
    )
    and exists (
      select 1 from public.lead_tags t
      where t.id = tag_id and t.business_id = lead_tag_assignments.business_id
    )
  );

create policy "lead_tag_assignments_delete_own_business" on public.lead_tag_assignments
  for delete
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create table public.conversation_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  tag_id uuid not null references public.lead_tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (conversation_id, tag_id)
);

create index conversation_tag_assignments_conversation_id_idx on public.conversation_tag_assignments (conversation_id);
create index conversation_tag_assignments_tag_id_idx on public.conversation_tag_assignments (tag_id);
create index conversation_tag_assignments_business_id_idx on public.conversation_tag_assignments (business_id);

alter table public.conversation_tag_assignments enable row level security;
alter table public.conversation_tag_assignments force row level security;

grant select, insert, delete on public.conversation_tag_assignments to authenticated;

create policy "conversation_tag_assignments_select_own_business" on public.conversation_tag_assignments
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "conversation_tag_assignments_insert_own_business" on public.conversation_tag_assignments
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.business_id = conversation_tag_assignments.business_id
    )
    and exists (
      select 1 from public.lead_tags t
      where t.id = tag_id and t.business_id = conversation_tag_assignments.business_id
    )
  );

create policy "conversation_tag_assignments_delete_own_business" on public.conversation_tag_assignments
  for delete
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
