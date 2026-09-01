-- Phase C "real-calendar appointment booking" (STATE.md's Phase 25f
-- roadmap, confirmed-but-not-built until now). Availability is expressed
-- through the *existing* recurring weekly `business_hours` table + each
-- business's own `timezone` column (both from Phase 21/24's business-hours
-- work) -- deliberately reusing that concept rather than inventing a
-- second "availability" table, per the user's confirmed choice of a
-- recurring-weekly-schedule model. Slots are generated on demand
-- (lib/appointments.ts) from those hours + a per-business slot duration,
-- never stored ahead of time.
--
-- Capacity is 1 booking per slot (the user's confirmed choice) --
-- enforced by the partial unique index below, not just app logic.
--
-- Booking requires owner approval (the user's confirmed choice): the AI's
-- book_appointment tool always inserts status 'pending', never 'confirmed'
-- directly -- a human must act in the dashboard before a slot is truly
-- committed. A 'pending' row still holds its slot (the unique index scopes
-- to pending+confirmed together), so two prospects can't both be told the
-- same still-undecided slot is open.

alter table public.businesses
  add column appointments_enabled boolean not null default false,
  add column appointment_slot_minutes int not null default 30
    check (appointment_slot_minutes between 5 and 240);

grant update (appointments_enabled, appointment_slot_minutes) on public.businesses to authenticated;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  contact_name text,
  contact_email text,
  contact_phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_contact_required check (contact_email is not null or contact_phone is not null),
  constraint appointments_ends_after_starts check (ends_at > starts_at)
);

create index appointments_business_id_idx on public.appointments (business_id);
create index appointments_conversation_id_idx on public.appointments (conversation_id);

-- Enforces "one booking per slot": a slot with a pending or confirmed
-- appointment can't be double-booked. A declined/cancelled row frees the
-- slot back up automatically (it falls outside this partial index).
create unique index appointments_active_slot_idx on public.appointments (business_id, starts_at)
  where status in ('pending', 'confirmed');

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row
  execute function public.set_updated_at();

alter table public.appointments enable row level security;
alter table public.appointments force row level security;

-- Table-level grant, same shape as leads -- the AI's book_appointment tool
-- writes via the service-role client (bypasses RLS entirely, same as
-- request_callback's lead writes), while a business's own dashboard reads
-- and changes appointment status as `authenticated`, scoped by the
-- policies below.
grant select, insert, update, delete on public.appointments to authenticated;

create policy "appointments_select_own_business" on public.appointments
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "appointments_insert_own_business" on public.appointments
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "appointments_update_own_business" on public.appointments
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

create policy "appointments_delete_own_business" on public.appointments
  for delete
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

alter table public.audit_log drop constraint audit_log_action_check;

alter table public.audit_log add constraint audit_log_action_check check (
  action in (
    'conversation.control_changed',
    'conversation.attention_dismissed',
    'knowledge.deleted',
    'knowledge.published',
    'knowledge.unpublished',
    'widget_key.created',
    'widget_key.origins_updated',
    'widget_key.revoked',
    'webhook_endpoint.created',
    'webhook_endpoint.deleted',
    'business_hours.updated',
    'widget_branding.updated',
    'business.published',
    'widget_suggested_questions.updated',
    'ai_conversion_goal.updated',
    'appointment_settings.updated',
    'appointment.confirmed',
    'appointment.declined',
    'appointment.cancelled'
  )
);
