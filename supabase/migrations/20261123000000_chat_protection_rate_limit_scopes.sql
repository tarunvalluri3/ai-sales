-- Production readiness item 3 (2026-11-03, lib/chat-protection.ts): three new
-- rate_limit_counters scopes for the public chat:
--   business              -- enforcing per-business limit (5-minute window)
--   gemini_daily_business -- AI turns per business per UTC day
--   gemini_daily_global   -- AI turns per UTC day across all businesses
-- The daily windows align to UTC midnight (floor(epoch / 86400) * 86400 in
-- increment_rate_limit_counter / check_rate_limits) and survive the existing
-- cleanup, which only deletes rows whose window_start is older than 1 day.
-- No table, grant or RLS change.
--
-- Rollback: recreate the constraint without the three values after deleting
-- their rows (delete from public.rate_limit_counters where scope in
-- ('business', 'gemini_daily_business', 'gemini_daily_global');).
--
-- Dated after 20261122000000 (not today): see docs/deployment.md
-- "Migration timestamps".

alter table public.rate_limit_counters
  drop constraint rate_limit_counters_scope_check,
  add constraint rate_limit_counters_scope_check
    check (scope in ('ip', 'key', 'conversation', 'poll_ip', 'poll_conversation', 'restore_ip', 'recent_chats_ip', 'whatsapp_webhook', 'instagram_webhook', 'business_burst', 'new_conversation_ip', 'ip_subnet', 'admin_mutation', 'admin_pii_reveal', 'business', 'gemini_daily_business', 'gemini_daily_global'));
