-- Production readiness round 3, item 1 (2026-11-03, lib/daily-reply-limit.ts):
-- one new rate_limit_counters scope.
--   gemini_cap_notice -- per conversation per UTC day: while a daily AI reply
--                        cap blocks a WhatsApp / Instagram conversation, only
--                        the first blocked message (counter = 1) gets the
--                        "a person will follow up" notice.
-- The daily caps themselves keep using gemini_daily_business /
-- gemini_daily_global (added by 20261123000000), now shared by every channel.
-- No table, grant or RLS change (rate_limit_counters keeps its existing RLS).
--
-- Without this migration the notice counter write fails, so WhatsApp and
-- Instagram prospects get NO notice while capped (never a duplicate); the cap
-- itself and the conversation flag still work.
--
-- Rollback: delete from public.rate_limit_counters where scope = 'gemini_cap_notice';
-- then recreate the constraint as in 20261123000000.

alter table public.rate_limit_counters
  drop constraint rate_limit_counters_scope_check,
  add constraint rate_limit_counters_scope_check
    check (scope in ('ip', 'key', 'conversation', 'poll_ip', 'poll_conversation', 'restore_ip', 'recent_chats_ip', 'whatsapp_webhook', 'instagram_webhook', 'business_burst', 'new_conversation_ip', 'ip_subnet', 'admin_mutation', 'admin_pii_reveal', 'business', 'gemini_daily_business', 'gemini_daily_global', 'gemini_cap_notice'));
