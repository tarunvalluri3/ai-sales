-- Phase 33 (docs/phases.md): the platform-owner admin panel at /apache.
--
-- public.platform_admins is the ONLY source of truth for "is this Clerk
-- user allowed into /apache". It is deliberately separate from every
-- tenant table: a platform admin is not a member of any business's Clerk
-- Organization, so none of the existing clerk_org_id RLS policies apply to
-- them, and they must never be confused with a business's own
-- org:admin/org:sales_agent roles (lib/auth.ts).
--
-- No FK to anything -- there is no local `users` table (same precedent as
-- audit_log.actor_user_id); user_id is the raw Clerk user id.
--
-- RLS is enabled and forced with NO grants to anon/authenticated at all.
-- This table is read exclusively by lib/platform-admin.ts through the
-- dedicated service-role client (lib/supabase/admin.ts), which bypasses
-- RLS -- the application layer (requirePlatformAdmin()) is the actual
-- access boundary, checked on every /apache request and every admin
-- server action/route handler, never relaxed via RLS policy.
--
-- Seeding the first admin is a deliberate, separate, documented SQL step
-- (README.md "Platform admin panel" section) run once by the project
-- owner with their own real Clerk user_id -- never embedded as a literal
-- value in a migration, which would hand anyone who can read this repo's
-- history a hardcoded admin identity.
--
-- ROLLBACK:
--   drop table public.platform_admins;

create table public.platform_admins (
  user_id text primary key,
  role text not null check (role in ('owner', 'support', 'viewer')),
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;

-- No grants: only the service-role client (lib/supabase/admin.ts) reads
-- this table, and the service role bypasses RLS/grants entirely. This
-- comment exists so a future migration doesn't "fix" an apparent omission.
