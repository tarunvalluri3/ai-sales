-- Phase 15b: two new rate-limit scopes for recurring poll traffic
-- (app/api/chat/poll/route.ts), sized separately from Phase 11's
-- message-send scopes ('ip'/'key'/'conversation') since a 6-second
-- poll interval would blow through those limits in minutes. No grant/
-- RLS change needed -- rate_limit_counters already has zero
-- authenticated/anon grants; only the service role writes it.

alter table public.rate_limit_counters
  drop constraint rate_limit_counters_scope_check,
  add constraint rate_limit_counters_scope_check
    check (scope in ('ip', 'key', 'conversation', 'poll_ip', 'poll_conversation'));
