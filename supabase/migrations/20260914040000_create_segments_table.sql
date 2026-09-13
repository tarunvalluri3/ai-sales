-- Phase 28 (Customer Intelligence): dynamic segments. A segment stores a
-- small, structured rule -- one top-level AND/OR (`match_type`) over a
-- flat list of conditions (`conditions`, validated server-side by
-- lib/schemas/segment.ts against a fixed allow-listed field/operator
-- set) -- deliberately not a nested boolean-logic tree, per the task's
-- explicit "keep v1 condition types intentionally small, do not build a
-- visual logic programming language" instruction. Membership is
-- evaluated in application code (lib/segments.ts) over each business's
-- own bounded customer snapshot, not via dynamic SQL construction from
-- the stored rule -- avoids ever interpolating a business-controlled
-- rule shape into a raw query, and keeps the evaluator a single,
-- reviewable, pure function.

create table public.segments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  description text,
  match_type text not null default 'all' check (match_type in ('all', 'any')),
  conditions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint segments_name_length check (char_length(name) between 1 and 60)
);

create unique index segments_business_id_name_idx on public.segments (business_id, lower(name));
create index segments_business_id_idx on public.segments (business_id);

create trigger segments_set_updated_at
  before update on public.segments
  for each row
  execute function public.set_updated_at();

alter table public.segments enable row level security;
alter table public.segments force row level security;

-- RLS is the floor (business match only); the app layer additionally
-- requires org:admin to create/edit/delete a segment (any authenticated
-- member may read/view one), same "RLS is the floor, the app enforces
-- the real policy" shape as lead_tags.
grant select, insert, update, delete on public.segments to authenticated;

create policy "segments_select_own_business" on public.segments
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "segments_insert_own_business" on public.segments
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "segments_update_own_business" on public.segments
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

create policy "segments_delete_own_business" on public.segments
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
    'appointment_exception.deleted',
    'appointment.completed',
    'appointment.no_show',
    'appointment_slot_block.created',
    'appointment_slot_block.deleted',
    'instagram_connection.created',
    'instagram_connection.deleted',
    'customer.renamed',
    'segment.created',
    'segment.updated',
    'segment.deleted'
  )
);
