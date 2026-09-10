-- Admin-controlled per-date appointment scheduling overrides, on top of
-- the existing recurring weekly `business_hours`. One row per
-- (business_id, date): either a closure (`is_closed = true`, a null
-- start/end meaning the whole day, or a start/end meaning just that
-- window -- e.g. a holiday vs. a lunch break) or an exceptional opening
-- (`is_closed = false` with a start/end, overriding the normal weekly
-- hours for that one date -- e.g. an extra Saturday, or different hours
-- on a specific day). lib/appointments.ts's generateAvailableSlots()/
-- isSlotAvailable() consult this table alongside business_hours; a date
-- with no row here behaves exactly as before this migration.

create table public.business_hours_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  date date not null,
  is_closed boolean not null,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  -- Both set or both null -- a partial time range is never valid.
  constraint business_hours_exceptions_time_range check (
    (start_time is null) = (end_time is null)
  ),
  -- An exceptional opening (is_closed = false) must specify the window
  -- it opens -- there's no such thing as "open, no particular hours."
  constraint business_hours_exceptions_open_requires_range check (
    is_closed or start_time is not null
  ),
  constraint business_hours_exceptions_range_order check (
    start_time is null or start_time < end_time
  )
);

-- One override per date -- edit by deleting and re-adding, same as this
-- table's simplest sibling patterns (widget_key.created/revoked,
-- webhook_endpoint.created/deleted): no in-place update action.
create unique index business_hours_exceptions_business_id_date_idx
  on public.business_hours_exceptions (business_id, date);

alter table public.business_hours_exceptions enable row level security;
alter table public.business_hours_exceptions force row level security;

grant select, insert, delete on public.business_hours_exceptions to authenticated;

create policy "business_hours_exceptions_select_own_business" on public.business_hours_exceptions
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "business_hours_exceptions_insert_own_business" on public.business_hours_exceptions
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "business_hours_exceptions_delete_own_business" on public.business_hours_exceptions
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
    'appointment.cancelled',
    'ai_capabilities.updated',
    'whatsapp_connection.created',
    'whatsapp_connection.deleted',
    'appointment_exception.created',
    'appointment_exception.deleted'
  )
);
