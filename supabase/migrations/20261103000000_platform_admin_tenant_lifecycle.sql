-- Phase 33 Stop 2 (docs/phases.md): the columns and tables the /apache
-- Tenants section needs for suspend/reactivate, soft delete, usage-limit
-- overrides, and internal admin notes. No tenant-facing RLS is loosened --
-- every admin read/write of these still goes through the dedicated
-- service-role client (lib/supabase/admin.ts), gated at the application
-- layer by requirePlatformAdmin()/requirePlatformAdminStepUp(). The
-- columns below ARE readable by a tenant's own authenticated session
-- (they already SELECT "*" on businesses/subscriptions), which is
-- intentional: a suspended business's own dashboard needs to know it is
-- suspended.
--
-- ROLLBACK:
--   drop table public.platform_admin_notes;
--   alter table public.subscriptions drop column reply_quota_override;
--   alter table public.businesses drop column status, drop column suspended_at,
--     drop column suspended_reason, drop column deleted_at, drop column deletion_reason;

-- ===================================================================
-- 1. businesses: suspend/reactivate + soft delete
-- ===================================================================
--
-- Soft delete is intentionally NOT a background-purge lifecycle in this
-- migration -- see STATE.md's Phase 33 Stop 2 entry for why: enforcement
-- (requireBusinessContext/resolveBusinessFromWidgetKey refusing to serve
-- a deleted business) ships now; a scheduled anonymization sweep after the
-- grace period is recorded as a known follow-up, not silently dropped.
-- "Hard delete" (approved amendment 5) does not need a new column at all:
-- it is a real DELETE FROM businesses, which cascades to every
-- business-owned table via its existing `on delete cascade` FK -- except
-- invoices/credit_notes/invoice_holds, which deliberately carry NO FK on
-- business_id (20261026000000's own header) specifically so a GST tax
-- record survives the business that generated it being deleted.

alter table public.businesses
  add column status text not null default 'active' check (status in ('active', 'suspended')),
  add column suspended_at timestamptz,
  add column suspended_reason text,
  add column deleted_at timestamptz,
  add column deletion_reason text;

create index businesses_status_idx on public.businesses (status) where status <> 'active';
create index businesses_deleted_at_idx on public.businesses (deleted_at) where deleted_at is not null;

-- ===================================================================
-- 2. subscriptions: an admin-set usage-limit override
-- ===================================================================
--
-- Nullable, same precedent as every other Phase 17b column added to this
-- table (20261025000000): a null here changes nothing about
-- entitlementFromRow()'s existing plan-quota resolution. When set, it
-- REPLACES the plan's monthlyReplyQuota/TRIAL_REPLY_QUOTA for this
-- business, in both the trialing and paid branches -- an admin support
-- action to temporarily raise (or lower) a specific tenant's ceiling
-- without changing its plan.

alter table public.subscriptions
  add column reply_quota_override integer check (reply_quota_override is null or reply_quota_override > 0);

-- ===================================================================
-- 3. platform_admin_notes: internal, per-tenant notes (Tenant detail "Notes" tab)
-- ===================================================================
--
-- Global/admin-only, same posture as platform_admins and admin_audit_log:
-- zero grants to anon/authenticated, read and written exclusively through
-- the admin service-role client. business_id has NO FK, deliberately --
-- same reasoning as admin_audit_log: a note about a tenant that is later
-- hard-deleted must not block that delete, and must not silently vanish
-- (it stays, orphaned, as part of the admin's own record of what happened).

create table public.platform_admin_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  author_user_id text not null,
  note text not null,
  created_at timestamptz not null default now()
);

create index platform_admin_notes_business_id_idx on public.platform_admin_notes (business_id, created_at desc);

alter table public.platform_admin_notes enable row level security;
alter table public.platform_admin_notes force row level security;

-- No grants to anon/authenticated -- only the admin service-role client
-- reads/writes this table, from code already gated by requirePlatformAdmin().
