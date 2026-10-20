-- Notification system, part 2 of 2 (2026-10-21): per-business, per-category
-- notification preferences. Every business-important event flows through
-- lib/notification-dispatch.ts, which always writes the in-app row
-- (20261021000000) and then consults this table to decide between an
-- immediate email, the existing daily digest, or nothing.
--
-- ROW PER CATEGORY, not a column per category. Same shape and same reasoning
-- as public.business_hours (20260821060000): a composite primary key over
-- (business_id, <dimension>), no surrogate id. Adding a seventh category later
-- costs one check-constraint swap and no change to the row shape, whereas
-- columns-per-category would add two columns to public.businesses per
-- category -- a table already carrying 27 -- and churn a widely-imported
-- TypeScript type every time.
--
-- NO BACKFILL AND NO ROW CREATED AT ONBOARDING. An absent row means "use the
-- coded default for this category", held in one place as
-- DEFAULT_NOTIFICATION_PREFERENCES in lib/notification-preferences.ts. A
-- business that never opens the settings page has zero rows here and still
-- gets exactly the intended tiering -- immediate email for a human handover or
-- an appointment request, the daily digest for a new lead. Rows appear only
-- when an admin actually changes something.
--
-- 'workflow' is deliberately NOT a valid category here. The workflow engine's
-- email_notification action is authored by the business owner inside a
-- specific workflow, so they have already expressed the intent for that exact
-- email; a global toggle silently disabling a step they built themselves would
-- be worse than noise. lib/workflow-engine.ts therefore keeps calling
-- sendWorkflowNotificationEmail directly and never consults this table.
--
-- Rollback: drop table public.notification_preferences;
-- Dropping it restores the coded defaults for everyone rather than breaking
-- any send, because absence already means "use the default".

create table public.notification_preferences (
  business_id uuid not null references public.businesses (id) on delete cascade,
  category text not null check (category in (
    'lead_created',
    'human_handover',
    'appointment_request',
    'appointment_status',
    'sla_breach',
    'assignment'
  )),
  -- 'immediate' sends now, 'digest' means the event is represented in the
  -- existing daily digest email only, 'off' means no email at all. In-app is a
  -- separate switch below: turning email off must never make an event
  -- invisible, which is the failure mode this whole feature exists to fix.
  email_mode text not null default 'digest'
    check (email_mode in ('immediate', 'digest', 'off')),
  in_app_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (business_id, category)
);

-- No secondary index: the primary key's leading business_id already serves the
-- only query shape there is (every row for one business), and the whole set is
-- at most six rows per business.

alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;

-- Delete is granted, unlike internal_notifications, so an admin can reset a
-- category back to the coded default rather than persisting a row that merely
-- duplicates it.
grant select, insert, update, delete on public.notification_preferences to authenticated;

create policy "notification_preferences_select_own_business" on public.notification_preferences
  for select to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "notification_preferences_insert_own_business" on public.notification_preferences
  for insert to authenticated
  with check (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "notification_preferences_update_own_business" on public.notification_preferences
  for update to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')))
  with check (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "notification_preferences_delete_own_business" on public.notification_preferences
  for delete to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

-- audit_log.action is a closed check constraint, last redefined by
-- 20260916000000. Extend it the same way -- drop and re-add with the full
-- existing list plus the new value -- so the settings action can record who
-- changed notification routing and when. The list below is the live
-- production definition, read back from pg_constraint, plus one entry.
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
    'copilot.action_superseded',
    'notification_preferences.updated'
  )
);
