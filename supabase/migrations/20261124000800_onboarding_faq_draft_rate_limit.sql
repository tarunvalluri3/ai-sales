begin;
alter table public.rate_limit_counters
  drop constraint if exists rate_limit_counters_scope_check,
  add constraint rate_limit_counters_scope_check
    check (scope in ('ip', 'key', 'conversation', 'poll_ip', 'poll_conversation', 'restore_ip', 'recent_chats_ip', 'whatsapp_webhook', 'instagram_webhook', 'business_burst', 'new_conversation_ip', 'ip_subnet', 'admin_mutation', 'admin_pii_reveal', 'business', 'gemini_daily_business', 'gemini_daily_global', 'gemini_cap_notice', 'faq_draft'));
commit;
