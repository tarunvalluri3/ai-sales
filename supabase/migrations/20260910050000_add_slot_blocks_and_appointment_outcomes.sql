-- Two user-requested follow-ups to the same-day appointment work:
-- (1) per-slot manual blocking, for the new visual slot-grid UI (sits
-- alongside business_hours_exceptions' date-range closures, not a
-- replacement -- that table's unique(business_id, date) can't express
-- two independently-blocked slots on the same date); (2) two new
-- terminal appointment outcomes recording whether a confirmed meeting
-- actually happened.

create table public.appointment_blocked_slots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  starts_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now()
);

create unique index appointment_blocked_slots_business_id_starts_at_idx
  on public.appointment_blocked_slots (business_id, starts_at);

alter table public.appointment_blocked_slots enable row level security;
alter table public.appointment_blocked_slots force row level security;

grant select, insert, delete on public.appointment_blocked_slots to authenticated;

create policy "appointment_blocked_slots_select_own_business" on public.appointment_blocked_slots
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "appointment_blocked_slots_insert_own_business" on public.appointment_blocked_slots
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "appointment_blocked_slots_delete_own_business" on public.appointment_blocked_slots
  for delete
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

-- Meeting outcomes: reachable only from 'confirmed' (enforced in
-- lib/appointments.ts's transitionAppointment, same as every other
-- status change) -- both fall outside appointments_active_slot_idx's
-- ('pending','confirmed') partial index, same as 'declined'/'cancelled'
-- already do, since a completed/no-show appointment's slot is already
-- in the past.
alter table public.appointments drop constraint appointments_status_check;

alter table public.appointments add constraint appointments_status_check check (
  status in ('pending', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show')
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
    'appointment.cancelled',
    'ai_capabilities.updated',
    'whatsapp_connection.created',
    'whatsapp_connection.deleted',
    'appointment_exception.created',
    'appointment_exception.deleted',
    'appointment.completed',
    'appointment.no_show',
    'appointment_slot_block.created',
    'appointment_slot_block.deleted'
  )
);
