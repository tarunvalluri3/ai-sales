-- Phase 29 (Automation & Workflow Engine): trigger -> conditions -> steps
-- (a step is either a real action, or a wait/delay). A workflow's
-- `conditions`/`match_type` reuse the exact same shape as `segments`
-- (lib/schemas/segment.ts's SegmentCondition) -- workflow conditions are
-- evaluated against the same customer-attribute snapshot segments use
-- (lib/segments.ts's customerMatchesSegment()), so this app has one
-- condition language, not two. `trigger_type`/`trigger_config` are what's
-- genuinely new here: which specific event this workflow listens for, and
-- any event-specific filter (e.g. which status, which tag, which score
-- threshold) -- checked by the dispatcher *before* conditions are
-- evaluated at all.
--
-- `workflow_runs` is the full execution history required by the task:
-- every run is traceable to its trigger event and target, its current
-- step, and its status. `steps` on a run is a **snapshot** of the
-- workflow's step list at trigger time (not a live reference) so editing
-- a workflow later never retroactively changes an already-in-flight run.
-- `next_step_index`/`resume_at` are what makes delayed (wait) steps
-- durable: `claim_due_workflow_runs()` below reuses the exact
-- `for update skip locked` + due-time claim pattern already proven by
-- `claim_whatsapp_outbound_messages()` (Phase 16) -- no new scheduler.

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  description text,
  trigger_type text not null check (trigger_type in (
    'lead_created',
    'lead_status_changed',
    'lead_score_threshold',
    'tag_added',
    'tag_removed',
    'appointment_status_changed',
    'conversation_needs_attention',
    'human_takeover',
    'ai_handback',
    'no_activity_hours'
  )),
  trigger_config jsonb not null default '{}'::jsonb,
  match_type text not null default 'all' check (match_type in ('all', 'any')),
  conditions jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflows_name_length check (char_length(name) between 1 and 80)
);

create unique index workflows_business_id_name_idx on public.workflows (business_id, lower(name));
create index workflows_business_id_trigger_type_idx on public.workflows (business_id, trigger_type) where enabled;

create trigger workflows_set_updated_at
  before update on public.workflows
  for each row
  execute function public.set_updated_at();

alter table public.workflows enable row level security;
alter table public.workflows force row level security;

-- RLS is the floor (business match only); the app layer additionally
-- requires org:admin to create/edit/delete/enable/disable a workflow
-- (any authenticated member may read one) -- same "RLS is the floor, the
-- app enforces the real policy" shape as `segments`.
grant select, insert, update, delete on public.workflows to authenticated;

create policy "workflows_select_own_business" on public.workflows
  for select to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "workflows_insert_own_business" on public.workflows
  for insert to authenticated
  with check (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "workflows_update_own_business" on public.workflows
  for update to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')))
  with check (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "workflows_delete_own_business" on public.workflows
  for delete to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  trigger_event text not null,
  target_type text not null check (target_type in ('lead', 'conversation', 'customer')),
  target_id uuid not null,
  customer_id uuid references public.customers (id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'skipped', 'cancelled')),
  steps jsonb not null,
  next_step_index integer not null default 0,
  resume_at timestamptz not null default now(),
  attempts integer not null default 0,
  failure_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workflow_runs_business_id_idx on public.workflow_runs (business_id);
create index workflow_runs_workflow_id_idx on public.workflow_runs (workflow_id);
create index workflow_runs_due_idx on public.workflow_runs (resume_at) where status in ('queued', 'running');

create trigger workflow_runs_set_updated_at
  before update on public.workflow_runs
  for each row
  execute function public.set_updated_at();

alter table public.workflow_runs enable row level security;
alter table public.workflow_runs force row level security;

-- A run can be created and advanced from either the widget/AI-tool path
-- (service role, bypasses RLS) or a dashboard staff action (the
-- Clerk-authenticated client) -- e.g. a staff member changing a lead's
-- status is what fires a `lead_status_changed` trigger. `authenticated`
-- therefore needs real INSERT/UPDATE here (RLS-scoped), not a
-- service-role-only posture like `lead_score_history`. No DELETE grant:
-- a run is cancelled via an UPDATE (`status = 'cancelled'`), never
-- removed from the history it exists to provide.
grant select, insert, update on public.workflow_runs to authenticated;

create policy "workflow_runs_select_own_business" on public.workflow_runs
  for select to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "workflow_runs_insert_own_business" on public.workflow_runs
  for insert to authenticated
  with check (
    business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id'))
    and exists (select 1 from public.workflows w where w.id = workflow_id and w.business_id = workflow_runs.business_id)
  );

create policy "workflow_runs_update_own_business" on public.workflow_runs
  for update to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')))
  with check (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create function public.claim_due_workflow_runs(p_limit integer default 20)
returns setof public.workflow_runs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.workflow_runs r
    set status = 'running', started_at = coalesce(r.started_at, now()), updated_at = now()
    from (
      select id
      from public.workflow_runs
      where status in ('queued', 'running') and resume_at <= now()
      order by resume_at
      limit p_limit
      for update skip locked
    ) claimed
    where r.id = claimed.id
    returning r.*;
end;
$$;

revoke execute on function public.claim_due_workflow_runs(integer) from public, anon, authenticated;

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
    'segment.deleted',
    'workflow.created',
    'workflow.updated',
    'workflow.deleted',
    'workflow.enabled',
    'workflow.disabled',
    'workflow_run.cancelled'
  )
);
