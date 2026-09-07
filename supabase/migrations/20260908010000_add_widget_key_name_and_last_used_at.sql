-- Widget Settings critique follow-up (2026-09-08): adds an optional
-- owner-facing nickname and a last-used timestamp per widget key, so a
-- business managing several keys can tell them apart and judge whether
-- an old key is actually safe to revoke.
--
-- `name` is dashboard-editable, same trust level as allowed_origins/status.
-- `last_used_at` is written only by lib/widget-auth.ts's
-- resolveBusinessFromWidgetKey() via the service role (which bypasses
-- RLS/grants entirely) on the real, public, unauthenticated widget
-- request path -- it must never be settable by an authenticated
-- dashboard session, so no column grant is added for it here.

alter table public.widget_keys
  add column name text,
  add column last_used_at timestamptz;

grant update (name) on public.widget_keys to authenticated;
