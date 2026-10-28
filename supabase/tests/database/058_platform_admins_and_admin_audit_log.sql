-- Phase 33 (docs/phases.md): shape, grants and immutability for
-- public.platform_admins and public.admin_audit_log -- the /apache
-- platform-admin panel's access table and append-only audit trail
-- (20261102000000, 20261102000100). Both are read/written exclusively by
-- the admin service-role client (lib/supabase/admin.ts), so unlike every
-- tenant table's pgTAP suite there is no clerk_org_id tenant-isolation
-- scenario here -- the isolation property under test is "no client role
-- (anon/authenticated) can read or write either table at all", and
-- "admin_audit_log cannot be rewritten or erased, even by the connecting
-- role" (same technique as 050_invoices_immutability_and_tenant_isolation.sql).
--
-- Run against the live, linked project via `npm test`.

begin;
select plan(11);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

-- ===================================================================
-- platform_admins
-- ===================================================================

insert into _tap_results select is(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.platform_admins'::regclass),
  true,
  'platform_admins: row level security is enabled and forced'
);

insert into _tap_results select ok(
  not has_table_privilege('authenticated', 'public.platform_admins', 'SELECT')
    and not has_table_privilege('authenticated', 'public.platform_admins', 'INSERT')
    and not has_table_privilege('authenticated', 'public.platform_admins', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.platform_admins', 'DELETE'),
  'platform_admins: authenticated has no grant at all (a tenant session must never read who the platform admins are)'
);

insert into _tap_results select ok(
  not has_table_privilege('anon', 'public.platform_admins', 'SELECT'),
  'platform_admins: anon cannot read platform_admins'
);

insert into _tap_results select throws_ok(
  $$insert into public.platform_admins (user_id, role) values ('user_test', 'superadmin')$$,
  '23514',
  null,
  'platform_admins: a role outside the closed set (owner/support/viewer) is rejected by the check constraint'
);

insert into _tap_results select lives_ok(
  $$insert into public.platform_admins (user_id, role) values ('user_test_pgtap', 'viewer')$$,
  'platform_admins: a valid role insert succeeds (as the unrestricted pgTAP/postgres role)'
);

-- ===================================================================
-- admin_audit_log
-- ===================================================================

insert into _tap_results select is(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.admin_audit_log'::regclass),
  true,
  'admin_audit_log: row level security is enabled and forced'
);

insert into _tap_results select ok(
  not has_table_privilege('authenticated', 'public.admin_audit_log', 'SELECT')
    and not has_table_privilege('authenticated', 'public.admin_audit_log', 'INSERT')
    and not has_table_privilege('authenticated', 'public.admin_audit_log', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.admin_audit_log', 'DELETE'),
  'admin_audit_log: authenticated has no grant at all (a tenant session must never read the platform-admin audit trail)'
);

insert into _tap_results select ok(
  not has_table_privilege('anon', 'public.admin_audit_log', 'SELECT'),
  'admin_audit_log: anon cannot read admin_audit_log'
);

insert into _tap_results select lives_ok(
  $$insert into public.admin_audit_log (actor_user_id, action, target_type, target_id)
    values ('user_test_pgtap', 'tenant.suspended', 'business', '00000000-0000-0000-0000-00000000000a')$$,
  'admin_audit_log: a plain insert succeeds (as the unrestricted pgTAP/postgres role)'
);

-- This session is `postgres`, which holds every privilege -- so what stops
-- these next two is the trigger alone, not a missing grant (same technique
-- as 050's invoices_immutable assertions).

insert into _tap_results select throws_ok(
  $$update public.admin_audit_log set action = 'tenant.reactivated' where actor_user_id = 'user_test_pgtap'$$,
  '23001',
  null,
  'admin_audit_log: cannot be UPDATEd, even by the table owner (trigger)'
);

insert into _tap_results select throws_ok(
  $$delete from public.admin_audit_log where actor_user_id = 'user_test_pgtap'$$,
  '23001',
  null,
  'admin_audit_log: cannot be DELETEd, even by the table owner (trigger)'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
