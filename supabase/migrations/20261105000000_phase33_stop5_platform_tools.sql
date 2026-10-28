-- Phase 33 Stop 5 (docs/phases.md): the last stop of the /apache platform
-- admin panel -- Feature Flags and tenant-facing Announcements. (Support
-- Tools' impersonation is cookie-based, audited via the existing
-- admin_audit_log, and needs no new table. Admin team management reuses
-- the existing platform_admins table from Stop 1. The Audit Log UI reads
-- the existing admin_audit_log table. Settings' plan-limit/trial/pricing
-- figures stay sourced from lib/plans.ts/lib/gemini-pricing.ts, same single
-- source of truth as every other page -- STATE.md records why those are
-- shown read-only here rather than made DB-editable.)
--
-- ROLLBACK:
--   drop table public.feature_flag_overrides;
--   drop table public.feature_flags;
--   drop table public.platform_announcements;

-- ===================================================================
-- 1. Feature flags: global default + per-tenant override
-- ===================================================================
--
-- Admin-only, same zero-grant posture as platform_admins (20261102000000)
-- -- product code calls lib/feature-flags.ts's isEnabled(flag, tenantId),
-- which reads through the dedicated service-role client
-- (lib/supabase/admin.ts), never through a tenant's own RLS-bound session.
-- A flag's existence/state is an internal rollout concern, not something
-- a tenant's own client needs to query directly.

create table public.feature_flags (
  key text primary key,
  description text not null,
  default_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;
alter table public.feature_flags force row level security;
-- No grants: only the admin service-role client reads/writes this table.

create table public.feature_flag_overrides (
  flag_key text not null references public.feature_flags (key) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  updated_by text not null,
  primary key (flag_key, business_id)
);

alter table public.feature_flag_overrides enable row level security;
alter table public.feature_flag_overrides force row level security;
-- No grants: same posture as feature_flags above.

-- ===================================================================
-- 2. Platform announcements: in-app banners, all tenants or selected
-- ===================================================================
--
-- Written only by the admin service-role client (gated by
-- requirePlatformAdminStepUp in lib/admin-announcement-actions.ts), but
-- READ by a tenant's own authenticated session -- an announcement is
-- exactly the kind of thing a business's own dashboard needs to render,
-- same shape as businesses.status being tenant-readable (20261103000000).

create table public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  target_type text not null default 'all' check (target_type in ('all', 'selected')),
  -- Only meaningful when target_type = 'selected'; null/empty otherwise.
  -- No FK to businesses: a targeted tenant that is later hard-deleted must
  -- never block this row from being read or edited (same reasoning as
  -- admin_audit_log.business_id having no FK, 20261102000100).
  target_business_ids uuid[],
  active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_announcements_selected_targets_present check (
    target_type = 'all' or (target_business_ids is not null and array_length(target_business_ids, 1) > 0)
  )
);

create index platform_announcements_active_idx on public.platform_announcements (active) where active;

alter table public.platform_announcements enable row level security;
alter table public.platform_announcements force row level security;

-- SELECT only -- insert/update/delete go exclusively through the admin
-- service-role client, which bypasses RLS/grants entirely (same pattern
-- as subscriptions, 20261024000000: "a Server Action calling this with
-- the tenant's own client would just get zero rows back").
grant select on public.platform_announcements to authenticated;

create policy "platform_announcements_select_targeted" on public.platform_announcements
  for select to authenticated
  using (
    active and (
      target_type = 'all'
      or (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')) = any (target_business_ids)
    )
  );

-- admin_audit_log.action is free-text (20261102000100's own definition has
-- no check constraint, unlike the tenant-scoped audit_log), so this stop's
-- new actions (impersonation.started/ended, flag.*, announcement.*,
-- admin_team.*) need no constraint change here.
