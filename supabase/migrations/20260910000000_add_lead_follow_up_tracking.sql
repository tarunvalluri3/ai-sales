-- Stalled-lead follow-up (user-requested, 2026-09-10, see STATE.md):
-- a background sweep (lib/stalled-leads.ts) drafts and sends a one-time
-- re-engagement message for a lead whose conversation has gone quiet.
-- These columns are the state machine that guarantees at-most-one send
-- per lead and gives the dashboard something real to show, not just a
-- fire-and-forget side effect.
--
-- follow_up_message is persisted once drafted so a lead blocked on
-- delivery (no Resend key yet, no approved WhatsApp template) is never
-- re-drafted (and re-billed against the Gemini quota) on every sweep --
-- only re-attempted for delivery.
--
-- follow_up_sent_at is the actual at-most-once gate: the sweep only
-- ever selects leads where it is still null, and only sets it once a
-- send genuinely succeeded ('sent_email'/'sent_whatsapp') -- a blocked
-- or transiently failed attempt leaves it null so the lead is picked
-- back up by tomorrow's sweep instead of being silently abandoned.
--
-- 'sent_whatsapp' and 'blocked_no_whatsapp_template' are both included
-- now even though no WhatsApp send is wired up yet (Meta requires a
-- business-supplied, pre-approved message template outside the 24-hour
-- session window, which this app cannot fabricate) -- this is the exact
-- state the stub path reports today, and the value a future real send
-- will report once a template exists, so it doesn't need a second
-- migration just to add the enum value.
alter table public.leads
  add column follow_up_message text,
  add column follow_up_status text
    check (follow_up_status in (
      'sent_email',
      'sent_whatsapp',
      'blocked_no_whatsapp_template',
      'no_contact_channel',
      'send_failed'
    )),
  add column follow_up_sent_at timestamptz;
