-- Phase 33 (docs/phases.md): a global, platform-owner audit trail.
--
-- This is a SEPARATE table from public.audit_log on purpose. audit_log
-- (20260820180000) is tenant-scoped: business_id not null, RLS keyed on
-- clerk_org_id, written by a business's OWN staff about their OWN
-- business. A platform admin's actions span every tenant and the admin
-- has no clerk_org_id at all, so none of audit_log's rows or policies fit
-- -- widening that table would let a cross-tenant admin action pass
-- through a policy built to prove single-tenant ownership.
--
-- Every row here is written by lib/platform-admin-audit.ts through the
-- service-role client (lib/supabase/admin.ts). business_id/target_id have
-- no FK: an admin's read of a since-deleted tenant, or a target that is a
-- user id / integration name rather than a row, must never fail to log
-- because of a dangling reference.
--
-- before/after are closed jsonb snapshots (identifiers, field names and
-- values only, matching lib/logger.ts's LogMetadata convention) -- never
-- a prospect's raw message content.
--
-- Append-only, enforced twice, same precedent as
-- 20261026000000_gst_invoices_and_credit_notes.sql's
-- reject_legal_record_change(): (1) no UPDATE/DELETE/TRUNCATE grant to any
-- role, and (2) a trigger that rejects those operations even for a role
-- that bypasses grants and RLS (the service role itself), so a bug in the
-- admin app code cannot silently rewrite history.
--
-- ROLLBACK:
--   drop trigger admin_audit_log_immutable on public.admin_audit_log;
--   drop trigger admin_audit_log_no_truncate on public.admin_audit_log;
--   drop function public.reject_admin_audit_log_change();
--   drop table public.admin_audit_log;

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  business_id uuid,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_actor_idx on public.admin_audit_log (actor_user_id, created_at desc);
create index admin_audit_log_business_idx on public.admin_audit_log (business_id, created_at desc) where business_id is not null;

alter table public.admin_audit_log enable row level security;
alter table public.admin_audit_log force row level security;

-- No grants to anon/authenticated: only the service-role client writes or
-- reads this table, from code already gated by requirePlatformAdmin().

create or replace function public.reject_admin_audit_log_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% is an append-only audit trail: % is not permitted', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger admin_audit_log_immutable
  before update or delete on public.admin_audit_log
  for each row execute function public.reject_admin_audit_log_change();

create trigger admin_audit_log_no_truncate
  before truncate on public.admin_audit_log
  for each statement execute function public.reject_admin_audit_log_change();
