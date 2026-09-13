-- Extends leads.follow_up_status's closed list (20260910000000) with
-- 'blocked_no_instagram_window' -- part of the codebase gap sweep's Phase
-- C (STATE.md, 2026-09-13). An Instagram-sourced stalled lead with no
-- email was previously falling through to the generic
-- 'no_contact_channel' status; this is more accurate to the real
-- constraint. Deliberately NOT named after WhatsApp's
-- 'blocked_no_whatsapp_template' shape: Instagram has no pre-approved-
-- template escape hatch at all (per Phase 26's own research in
-- STATE.md), so "no template" would misdescribe why no send is
-- attempted -- the real constraint is Instagram's 24-hour message
-- window closing with no bypass this app has built (the HUMAN_AGENT
-- 7-day tag is its own, separately-deferred App Review track).
alter table public.leads
  drop constraint leads_follow_up_status_check,
  add constraint leads_follow_up_status_check
    check (follow_up_status in (
      'sent_email',
      'sent_whatsapp',
      'blocked_no_whatsapp_template',
      'blocked_no_instagram_window',
      'no_contact_channel',
      'send_failed'
    ));
