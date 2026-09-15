-- Copilot item lifecycle: dismiss / auto-resurface. The Sales Copilot's
-- "Today" list (lib/copilot.ts) recomputes priority fresh on every read,
-- with no memory of what staff already handled -- so a lead someone
-- already followed up with outside this app (a phone call, a manual
-- WhatsApp reply) keeps reappearing forever. `copilot_dismissals` records
-- which reason keys were true when a staff member clicked "Mark as
-- handled" for a customer; a future read only stays hidden if every
-- reason true right now was already known at dismiss time, and never
-- longer than DISMISSAL_EXPIRY_DAYS (7) regardless.
--
-- Same shape as `sales_tasks` (20260914060000): RLS enable+force, four
-- policies, full grant to `authenticated`. No `updated_at` trigger --
-- `dismissed_at` is already the one meaningful timestamp, set explicitly
-- by the write path, same convention as `conversations.attention_flagged_at`.

create table public.copilot_dismissals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  reason_keys text[] not null default '{}',
  dismissed_at timestamptz not null default now(),
  dismissed_by text not null,
  created_at timestamptz not null default now(),
  constraint copilot_dismissals_reason_keys_not_empty check (cardinality(reason_keys) > 0),
  unique (business_id, customer_id)
);

create index copilot_dismissals_customer_id_idx on public.copilot_dismissals (customer_id);

alter table public.copilot_dismissals enable row level security;
alter table public.copilot_dismissals force row level security;

grant select, insert, update, delete on public.copilot_dismissals to authenticated;

create policy "copilot_dismissals_select_own_business" on public.copilot_dismissals
  for select to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "copilot_dismissals_insert_own_business" on public.copilot_dismissals
  for insert to authenticated
  with check (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "copilot_dismissals_update_own_business" on public.copilot_dismissals
  for update to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')))
  with check (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "copilot_dismissals_delete_own_business" on public.copilot_dismissals
  for delete to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

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
    'copilot.item_undismissed'
  )
);
