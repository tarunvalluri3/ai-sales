-- Email bounce/complaint suppression (2026-10-19). Two parts, one feature.
--
-- ---------------------------------------------------------------------
-- 1. public.email_suppressions -- the app's own record of addresses that
--    hard-bounced or reported spam, fed by Resend's signed webhook
--    (app/api/webhooks/resend/route.ts) and checked before every send in
--    lib/notifications.ts and lib/stalled-leads.ts.
-- ---------------------------------------------------------------------
--
-- What this is NOT for: protecting the sending domain's reputation.
-- Resend already maintains its own account-level suppression list and
-- refuses sends to burned addresses itself. What it IS for is the app
-- *knowing*: without it, a send to a suppressed address is accepted by
-- Resend's API, so lib/stalled-leads.ts recorded the lead as
-- 'sent_email' and set follow_up_sent_at -- a follow-up the dashboard
-- reported as delivered that never reached anyone. Checking first lets
-- the lead say what actually happened (part 2 below).
--
-- DELIBERATELY NOT TENANT-SCOPED, unlike every business-owned table in
-- this app. A hard bounce is a fact about the address, true for every
-- business that holds it, so there is no business_id and no tenant filter
-- to apply -- AGENTS.md §3 rule 1 governs business-owned data, which this
-- is not. Same reasoning and same access model as rate_limit_counters
-- (20260813130010): RLS enabled AND forced, zero policies, and zero grants
-- to anon/authenticated (new tables already start with none, per
-- 20260811150450). Only the service-role client ever touches it. Tenant
-- access would itself be a leak: the rows are other businesses' prospect
-- addresses.
create table public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  -- Stored normalized (trimmed, lower-cased) by lib/email-suppression.ts.
  -- Unique so the webhook can upsert idempotently when Resend redelivers.
  email text not null unique,
  reason text not null check (reason in ('hard_bounce', 'complaint')),
  -- Resend's own short bounce reason. Never a message body.
  detail text,
  created_at timestamptz not null default now()
);

alter table public.email_suppressions enable row level security;
alter table public.email_suppressions force row level security;

-- No grants and no policies, on purpose. See above.

-- ---------------------------------------------------------------------
-- 2. leads.follow_up_status gains 'blocked_email_suppressed', extending
--    the closed list the same way 20260913000000 added
--    'blocked_no_instagram_window'.
-- ---------------------------------------------------------------------
--
-- Like the other 'blocked_*' values it leaves follow_up_sent_at null --
-- nothing was sent -- and the drafted message stays persisted.
alter table public.leads
  drop constraint leads_follow_up_status_check,
  add constraint leads_follow_up_status_check
    check (follow_up_status in (
      'sent_email',
      'sent_whatsapp',
      'blocked_no_whatsapp_template',
      'blocked_no_instagram_window',
      'blocked_email_suppressed',
      'no_contact_channel',
      'send_failed'
    ));
