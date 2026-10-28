-- Shape and grants for Phase 33 Stop 2's new columns/table
-- (20261103000000_platform_admin_tenant_lifecycle.sql): businesses'
-- suspend/soft-delete columns, subscriptions.reply_quota_override, and
-- platform_admin_notes. No tenant-isolation scenario for
-- platform_admin_notes (same posture as platform_admins/admin_audit_log --
-- global, admin-only, zero client grants); businesses/subscriptions
-- already have their own tenant-isolation suites (001, 048) this does not
-- repeat.
--
-- Run against the live, linked project via `npm test`.

begin;
select plan(10);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A');

-- 1-2. businesses.status: default + check constraint
insert into _tap_results select is(
  (select status from public.businesses where id = '00000000-0000-0000-0000-00000000000a'),
  'active',
  'businesses.status defaults to active'
);

insert into _tap_results select throws_ok(
  $$update public.businesses set status = 'archived' where id = '00000000-0000-0000-0000-00000000000a'$$,
  '23514',
  null,
  'businesses.status outside the closed set is rejected by the check constraint'
);

-- 3. businesses: the new columns exist and a suspend/delete update succeeds
insert into _tap_results select lives_ok(
  $$update public.businesses
      set status = 'suspended', suspended_at = now(), suspended_reason = 'test',
          deleted_at = now(), deletion_reason = 'test'
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  'businesses: suspend/soft-delete columns accept a real update'
);

insert into public.subscriptions (business_id, plan_key, status, current_period_start, current_period_end)
values ('00000000-0000-0000-0000-00000000000a', 'starter', 'active', now(), now() + interval '30 days');

-- 4-5. subscriptions.reply_quota_override: nullable, positive-only
insert into _tap_results select lives_ok(
  $$update public.subscriptions set reply_quota_override = null where business_id = '00000000-0000-0000-0000-00000000000a'$$,
  'subscriptions.reply_quota_override accepts null'
);

insert into _tap_results select throws_ok(
  $$update public.subscriptions set reply_quota_override = -5 where business_id = '00000000-0000-0000-0000-00000000000a'$$,
  '23514',
  null,
  'subscriptions.reply_quota_override rejects a non-positive value'
);

insert into _tap_results select lives_ok(
  $$update public.subscriptions set reply_quota_override = 500 where business_id = '00000000-0000-0000-0000-00000000000a'$$,
  'subscriptions.reply_quota_override accepts a positive value'
);

-- 6-9. platform_admin_notes: RLS + zero grants, same posture as
-- platform_admins/admin_audit_log (058)
insert into _tap_results select is(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.platform_admin_notes'::regclass),
  true,
  'platform_admin_notes: row level security is enabled and forced'
);

insert into _tap_results select ok(
  not has_table_privilege('authenticated', 'public.platform_admin_notes', 'SELECT')
    and not has_table_privilege('authenticated', 'public.platform_admin_notes', 'INSERT')
    and not has_table_privilege('authenticated', 'public.platform_admin_notes', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.platform_admin_notes', 'DELETE'),
  'platform_admin_notes: authenticated has no grant at all'
);

insert into _tap_results select ok(
  not has_table_privilege('anon', 'public.platform_admin_notes', 'SELECT'),
  'platform_admin_notes: anon cannot read platform_admin_notes'
);

insert into _tap_results select lives_ok(
  $$insert into public.platform_admin_notes (business_id, author_user_id, note)
    values ('00000000-0000-0000-0000-00000000000a', 'user_test_pgtap', 'a note')$$,
  'platform_admin_notes: a plain insert succeeds (as the unrestricted pgTAP/postgres role)'
);

-- 10. a business's own authenticated session cannot read platform_admin_notes
-- about itself -- it is an internal admin record, not tenant data. There is
-- no grant at all (asserted above), so this fails at the privilege check
-- (42501), not via an RLS row filter -- throws_ok, not is(0).
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select throws_ok(
  $$select count(*) from public.platform_admin_notes where business_id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501',
  null,
  'a tenant''s own session cannot read platform_admin_notes at all (no grant)'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
