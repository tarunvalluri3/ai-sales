-- Copilot Action Lifecycle v2 -- extends the existing "Mark as handled" /
-- copilot_dismissals feature (which stays exactly as-is, see
-- 20260915000000_create_copilot_dismissals.sql) with a first-class,
-- per-(customer, action_type) entity that can be snoozed, automatically
-- completed/superseded by real domain events, and shown in Today/
-- Upcoming/Completed views. `copilot_dismissals` keeps its original,
-- coarser role: one customer-level "don't show me this customer's card
-- at all" suppression, unique on (business_id, customer_id). This table
-- is finer-grained -- one row per (business_id, customer_id, action_type)
-- -- because a customer can legitimately have more than one distinct
-- action over time (a resolved `confirm_appointment` from last week
-- coexisting with a fresh `follow_up` this week).
--
-- Lifecycle states: open -> snoozed -> open (wake) | completed | dismissed
-- | superseded | expired. All six are real, meaningfully different
-- outcomes (lib/copilot-lifecycle.ts's CopilotActionStatus) -- see
-- STATE.md for the full state-machine writeup.
--
-- Never deleted: unlike copilot_dismissals (which supports an explicit
-- "Undo" delete), a copilot_actions row is a permanent history record for
-- the new Completed view, same "history should never disappear"
-- philosophy as workflow_runs (Phase 29) -- transitions are always an
-- UPDATE to `status`, never a DELETE. No `authenticated` DELETE grant.

create table public.copilot_actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,

  action_type text not null check (action_type in (
    'reply_to_prospect',
    'confirm_appointment',
    'follow_up',
    'review_stalled_conversation',
    'handle_attention'
  )),
  status text not null default 'open' check (status in (
    'open', 'snoozed', 'completed', 'dismissed', 'superseded', 'expired'
  )),

  priority integer not null default 0,
  reason_keys text[] not null default '{}',

  title text not null,
  recommended_action text not null,

  snoozed_until timestamptz,
  due_at timestamptz,

  completed_at timestamptz,
  completed_by text,

  dismissed_at timestamptz,
  dismissed_by text,

  superseded_at timestamptz,
  superseded_by_action_id uuid references public.copilot_actions (id) on delete set null,

  expired_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint copilot_actions_title_length check (char_length(title) between 1 and 200),
  constraint copilot_actions_recommended_action_length check (char_length(recommended_action) between 1 and 300),
  -- A snoozed row must actually carry a wake time, and vice versa --
  -- keeps the two fields from silently drifting out of sync.
  constraint copilot_actions_snoozed_until_matches_status check (
    (status = 'snoozed') = (snoozed_until is not null)
  )
);

-- Duplicate prevention (mandatory per spec): at most one *active*
-- (open/snoozed) action per (business_id, customer_id, action_type).
-- Resolved rows (completed/dismissed/superseded/expired) are exempt --
-- they're history, and a new active row for the same key can be created
-- once the desired action reopens (see decideReconciliation()).
create unique index copilot_actions_active_unique_idx
  on public.copilot_actions (business_id, customer_id, action_type)
  where status in ('open', 'snoozed');

create index copilot_actions_business_id_idx on public.copilot_actions (business_id);
create index copilot_actions_customer_id_idx on public.copilot_actions (customer_id);
create index copilot_actions_business_id_status_idx on public.copilot_actions (business_id, status);
-- Backs both the "wake due snoozed actions" reconciliation scan and the Upcoming view's sort.
create index copilot_actions_snoozed_until_idx on public.copilot_actions (business_id, snoozed_until) where status = 'snoozed';

create trigger copilot_actions_set_updated_at
  before update on public.copilot_actions
  for each row
  execute function public.set_updated_at();

alter table public.copilot_actions enable row level security;
alter table public.copilot_actions force row level security;

-- No DELETE grant -- see the file header. RLS is the floor (business
-- match only); the app layer additionally requires org:sales_agent to
-- snooze/complete/dismiss/undo (any authenticated member may read).
grant select, insert, update on public.copilot_actions to authenticated;

create policy "copilot_actions_select_own_business" on public.copilot_actions
  for select to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "copilot_actions_insert_own_business" on public.copilot_actions
  for insert to authenticated
  with check (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "copilot_actions_update_own_business" on public.copilot_actions
  for update to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')))
  with check (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

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
    'workflow_run.cancelled',
    'copilot.item_dismissed',
    'copilot.item_undismissed',
    'copilot.action_snoozed',
    'copilot.action_completed',
    'copilot.action_superseded'
  )
);
