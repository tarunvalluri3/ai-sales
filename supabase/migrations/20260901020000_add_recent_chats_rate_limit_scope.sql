-- Phase 25d: a new rate-limit scope for app/api/chat/recent/route.ts
-- (widget "view recent chats" listing), sized and scoped separately from
-- send/poll/restore traffic -- same pattern as 20260822010000's own
-- extension for restore traffic.

alter table public.rate_limit_counters
  drop constraint rate_limit_counters_scope_check,
  add constraint rate_limit_counters_scope_check
    check (scope in ('ip', 'key', 'conversation', 'poll_ip', 'poll_conversation', 'restore_ip', 'recent_chats_ip'));
