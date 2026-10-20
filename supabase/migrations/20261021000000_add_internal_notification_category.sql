-- Notification system, part 1 of 2 (2026-10-21): internal_notifications
-- gains a category, so the table can carry every business-important event
-- instead of only the workflow engine's `internal_notification` action --
-- which, until now, was its one and only writer (lib/workflow-engine.ts).
--
-- Why this exists. A real appointment booked through the production widget
-- produced no awareness at all: no email (the business had no contact_email)
-- and nothing in the dashboard. Worse, the single most urgent event in the
-- product -- the AI escalating a conversation to a human -- created no
-- notification of any kind, and was visible only as a sidebar badge or in the
-- next day's digest. Everything now routes through lib/notification-dispatch.ts,
-- which always writes a row here and then decides about email. The category is
-- what the bell groups by and what the per-business preferences in
-- 20261022000000 key off.
--
-- `not null default 'workflow'` and NO BACKFILL, deliberately: every row that
-- exists today was written by the workflow engine's internal_notification
-- action, so 'workflow' is the honest value for all of them rather than a
-- guess. Same reasoning as 20260911000000's `business_type default 'other'`.
-- On PG 11+ a `not null default` of a constant is a catalog-only change, so
-- there is no table rewrite and no lock held over a scan. Keeping the default
-- afterwards means lib/workflow-engine.ts needs no change at all.
--
-- 'workflow' is listed first because it is the pre-existing meaning; the rest
-- are the new events. 'assignment' is included now although nothing writes it
-- yet -- the slot is designed (a team member is assigned by
-- flagConversationNeedsAttention and never told), but there is no per-assignee
-- email address plumbed through Clerk yet, so wiring it would notify nobody
-- usefully. Declaring it here avoids a second constraint swap later, exactly
-- as 20260910000000 pre-declared 'sent_whatsapp'.
--
-- Rollback: alter table public.internal_notifications
--             drop constraint internal_notifications_category_check,
--             drop column category;
-- The column is purely additive and nothing that predates it reads it.

alter table public.internal_notifications
  add column category text not null default 'workflow';

alter table public.internal_notifications
  add constraint internal_notifications_category_check
    check (category in (
      'workflow',
      'lead_created',
      'human_handover',
      'appointment_request',
      'appointment_status',
      'sla_breach',
      'assignment'
    ));

-- No new GRANT. The existing `grant select, insert, update (read_at)` from
-- 20260914060000 is table-level for insert, so it already covers a column
-- added later. The UPDATE grant stays scoped to read_at alone, which means a
-- category cannot be rewritten after the fact -- the same reasoning that keeps
-- `message` immutable there.
--
-- No new index either. The bell's dropdown reads the 50 most recent rows
-- through the existing internal_notifications_business_id_idx
-- (business_id, created_at desc) and labels by category in memory, and the
-- unread COUNT it polls is already served by the partial
-- internal_notifications_unread_idx. A category index would be dead weight at
-- this row count.
--
-- Known, accepted: there is still no delete grant and no retention sweep, so
-- rows accumulate forever. The 50-row read limit hides it and the partial
-- index keeps the unread count cheap, so this is not urgent -- but it will
-- need one eventually, and deliberately is not solved here.
