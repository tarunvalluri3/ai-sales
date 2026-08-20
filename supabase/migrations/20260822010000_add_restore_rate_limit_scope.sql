-- Phase 25a: a new rate-limit scope for app/api/chat/restore/route.ts
-- (one-shot conversation-history restore on widget page load), sized and
-- scoped separately from send ('ip'/'key'/'conversation') and poll
-- ('poll_ip'/'poll_conversation') traffic -- same pattern as
-- 20260814084211's own extension for poll traffic.

alter table public.rate_limit_counters
  drop constraint rate_limit_counters_scope_check,
  add constraint rate_limit_counters_scope_check
    check (scope in ('ip', 'key', 'conversation', 'poll_ip', 'poll_conversation', 'restore_ip'));
