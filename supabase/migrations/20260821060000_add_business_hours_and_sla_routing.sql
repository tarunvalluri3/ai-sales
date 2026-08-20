-- Business hours + SLA-based escalation routing (Phase 24). "Team" here
-- means the business's existing Clerk org members (resolved decision:
-- no separate named-teams concept for this phase) -- round-robin
-- assignment cycles through them via `businesses.next_assignment_cursor`,
-- a simple incrementing pointer (mod member count), not a fairness
-- guarantee under concurrent escalations -- a rare double-assignment
-- skew is an acceptable trade for not needing a lock here.
--
-- `business_hours` starts empty for every business (no seeded rows) --
-- an unconfigured business is treated as always-open by
-- lib/business-hours.ts, so SLA routing still works with zero setup
-- rather than silently doing nothing until someone visits a settings
-- page.

alter table public.businesses
  add column timezone text not null default 'UTC',
  add column sla_minutes int,
  add column next_assignment_cursor int not null default 0;

grant update (timezone, sla_minutes) on public.businesses to authenticated;

alter table public.conversations
  add column assigned_to_user_id text,
  add column attention_flagged_at timestamptz;

create table public.business_hours (
  business_id uuid not null references public.businesses (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  is_open boolean not null default true,
  start_time time,
  end_time time,
  primary key (business_id, day_of_week)
);

alter table public.business_hours enable row level security;
alter table public.business_hours force row level security;

grant select, insert, update, delete on public.business_hours to authenticated;

create policy "business_hours_select_own_business" on public.business_hours
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "business_hours_insert_own_business" on public.business_hours
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "business_hours_update_own_business" on public.business_hours
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

create policy "business_hours_delete_own_business" on public.business_hours
  for delete
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
