-- Phase 15c: lets the dashboard clear needs_attention (take-over and
-- the new explicit Dismiss action). No RLS policy change needed --
-- the existing conversations_update_own_business policy (Phase 15a)
-- already scopes any UPDATE to the caller's own business; this only
-- widens which column authenticated may touch, same pattern as
-- Phase 15a's original `grant update (control)`.
grant update (needs_attention) on public.conversations to authenticated;
