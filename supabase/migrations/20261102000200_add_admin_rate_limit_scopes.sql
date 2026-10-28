-- Phase 33 (docs/phases.md): two new scopes on the existing fixed-window
-- public.rate_limit_counters table (same mechanism as every other scope --
-- see 20261029000000's precedent), rather than a new table.
--
--   * admin_mutation   -- any state-changing /apache server action, keyed
--                         on the acting platform admin's user_id.
--   * admin_pii_reveal -- the "reveal masked PII" action specifically,
--                         keyed the same way, so a compromised/malicious
--                         admin session can't bulk-harvest unmasked
--                         contact info even though each individual reveal
--                         is legitimate and already audit-logged.
--
-- Both are ENFORCING from the start (unlike Phase 32's abuse scopes): they
-- are not added to lib/abuse-limits.ts's LOG_ONLY_SCOPES/FAIL_OPEN_SCOPES,
-- so resolveAbuseLimitVerdict() fails CLOSED on an infrastructure error and
-- refuses outright once over limit -- an admin-side control, not a
-- visitor-facing one, so erring toward blocking is correct here.
--
-- No grant or RLS change needed: rate_limit_counters already has zero
-- grants to anon/authenticated and RLS enabled + forced with no policies
-- (20260813130010_create_rate_limit_counters_table.sql); only the
-- service-role client (lib/rate-limit.ts) touches it.
--
-- ROLLBACK:
--   alter table public.rate_limit_counters
--     drop constraint rate_limit_counters_scope_check,
--     add constraint rate_limit_counters_scope_check
--       check (scope in ('ip', 'key', 'conversation', 'poll_ip', 'poll_conversation', 'restore_ip', 'recent_chats_ip', 'whatsapp_webhook', 'instagram_webhook', 'business_burst', 'new_conversation_ip', 'ip_subnet'));
--   -- (delete rows under the new scopes first, or the recreate fails validation:
--   --  delete from public.rate_limit_counters where scope in ('admin_mutation', 'admin_pii_reveal');)

alter table public.rate_limit_counters
  drop constraint rate_limit_counters_scope_check,
  add constraint rate_limit_counters_scope_check
    check (scope in ('ip', 'key', 'conversation', 'poll_ip', 'poll_conversation', 'restore_ip', 'recent_chats_ip', 'whatsapp_webhook', 'instagram_webhook', 'business_burst', 'new_conversation_ip', 'ip_subnet', 'admin_mutation', 'admin_pii_reveal'));
