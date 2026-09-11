-- Instagram inbound webhook rate limiting (Phase 26): rate-limits by the
-- sender's Instagram-scoped id, not IP -- every inbound webhook comes
-- from Meta's own infrastructure, same reasoning as Phase 16's
-- `whatsapp_webhook` scope.

alter table public.rate_limit_counters
  drop constraint rate_limit_counters_scope_check,
  add constraint rate_limit_counters_scope_check
    check (scope in ('ip', 'key', 'conversation', 'poll_ip', 'poll_conversation', 'restore_ip', 'recent_chats_ip', 'whatsapp_webhook', 'instagram_webhook'));
