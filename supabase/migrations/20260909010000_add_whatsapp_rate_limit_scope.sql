-- WhatsApp inbound webhook rate limiting (Phase 16): rate-limits by the
-- sender's WhatsApp id (`wa_id`), not IP -- every inbound webhook comes
-- from Meta's own infrastructure, so an IP-scope limit would be
-- meaningless here, same reasoning that already justifies the existing
-- `key`/`conversation` scopes alongside `ip`.

alter table public.rate_limit_counters
  drop constraint rate_limit_counters_scope_check,
  add constraint rate_limit_counters_scope_check
    check (scope in ('ip', 'key', 'conversation', 'poll_ip', 'poll_conversation', 'restore_ip', 'recent_chats_ip', 'whatsapp_webhook'));
