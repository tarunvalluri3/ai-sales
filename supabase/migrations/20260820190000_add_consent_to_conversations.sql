-- Prospect consent (Phase 22c, STATE.md / docs/phases.md): gates whether
-- the request_callback tool (lib/tools/request-callback.ts) is allowed to
-- persist a prospect's email/phone. Written exclusively by the
-- service-role widget path (app/api/chat/route.ts, via a `consentGiven`
-- flag on the chat request body set by the widget's own consent
-- checkbox) -- same reasoning as `needs_attention`'s original design in
-- 20260814074411_add_conversation_control_and_attention.sql: no
-- `authenticated` grant is added on this column, since no dashboard
-- action ever sets it.

alter table public.conversations
  add column consent_given boolean not null default false,
  add column consent_given_at timestamptz;
