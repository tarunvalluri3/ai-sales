-- Phase 32 abuse rate limiting (STATE.md): three new scope values on
-- public.rate_limit_counters, added to the existing fixed-window counter
-- table rather than any new table or external service (decision 1,
-- consistent with D4). All three ship in LOG-ONLY mode in the application
-- layer (lib/abuse-limits.ts) -- this migration only widens the allowed
-- scope set so the route and webhooks may INSERT rows naming them.
--
--   * business_burst      -- one burst ceiling spanning all of a tenant's
--                            channels (widget + WhatsApp + Instagram), keyed
--                            on business_id. The trial/normal split is a
--                            limit PROFILE in the app, not a scope value, so
--                            only one value is added for it here.
--   * new_conversation_ip -- per-IP limit on requests that arrive with no
--                            conversationId, closing the gap where a script
--                            that drops the id each turn never binds the
--                            per-conversation scope.
--   * ip_subnet           -- per-IPv4-/24 limit, for proxy pools spread
--                            across many single IPs.
--
-- No grant or RLS change: rate_limit_counters already has zero grants to
-- anon/authenticated and RLS enabled + forced with no policies (see
-- 20260813130010_create_rate_limit_counters_table.sql). Only the service
-- role (which bypasses RLS) ever touches it.
--
-- Deployment ordering: this MUST be applied to production BEFORE the route
-- code that inserts rows naming these values is merged -- an INSERT with a
-- scope the old check constraint does not list fails the whole request, not
-- just the counter write (same rule as 20261028000000 and the
-- ai_response_metrics columns). The agent harness refuses `db push`; the
-- user applies it (see STATE.md's Phase 32 deployment entry).
--
-- ROLLBACK:
--   alter table public.rate_limit_counters
--     drop constraint rate_limit_counters_scope_check,
--     add constraint rate_limit_counters_scope_check
--       check (scope in ('ip', 'key', 'conversation', 'poll_ip', 'poll_conversation', 'restore_ip', 'recent_chats_ip', 'whatsapp_webhook', 'instagram_webhook'));
--   -- (First delete any rows written under the new scopes, or the recreate
--   --  of the old constraint will fail validation:
--   --  delete from public.rate_limit_counters
--   --    where scope in ('business_burst', 'new_conversation_ip', 'ip_subnet');)

alter table public.rate_limit_counters
  drop constraint rate_limit_counters_scope_check,
  add constraint rate_limit_counters_scope_check
    check (scope in ('ip', 'key', 'conversation', 'poll_ip', 'poll_conversation', 'restore_ip', 'recent_chats_ip', 'whatsapp_webhook', 'instagram_webhook', 'business_burst', 'new_conversation_ip', 'ip_subnet'));
