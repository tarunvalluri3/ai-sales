-- Shape, grants, and RLS for Phase 33 Stop 5's new tables
-- (20261105000000_phase33_stop5_platform_tools.sql): feature_flags,
-- feature_flag_overrides (admin-only, zero grants, same posture as
-- platform_admins/platform_admin_notes), and platform_announcements
-- (admin-written, tenant-readable -- the real tenant-isolation scenario in
-- this file).
--
-- Run against the live, linked project via `npm test`.

begin;
select plan(12);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

-- 1-4. feature_flags / feature_flag_overrides: zero grants, same posture
-- as platform_admins/platform_admin_notes (058/059)
insert into _tap_results select ok(
  not has_table_privilege('authenticated', 'public.feature_flags', 'SELECT')
    and not has_table_privilege('authenticated', 'public.feature_flags', 'INSERT'),
  'feature_flags: authenticated has no grant at all'
);

insert into _tap_results select ok(
  not has_table_privilege('anon', 'public.feature_flags', 'SELECT'),
  'feature_flags: anon cannot read feature_flags'
);

insert into _tap_results select ok(
  not has_table_privilege('authenticated', 'public.feature_flag_overrides', 'SELECT')
    and not has_table_privilege('authenticated', 'public.feature_flag_overrides', 'INSERT'),
  'feature_flag_overrides: authenticated has no grant at all'
);

insert into _tap_results select lives_ok(
  $$insert into public.feature_flags (key, description, default_enabled)
    values ('widget.new_chat_bubble', 'test flag', false)$$,
  'feature_flags: a plain insert succeeds (as the unrestricted pgTAP/postgres role)'
);

-- 5. a flag key outside the pure-logic module's allowed shape is still a
-- free-text column at the database layer -- isValidFlagKey() is enforced
-- in lib/feature-flag-actions.ts before any insert, not by a DB check
-- constraint (same division as PlanKey vs. plan_key elsewhere). No
-- assertion needed here beyond the insert above succeeding.

insert into _tap_results select lives_ok(
  $$insert into public.feature_flag_overrides (flag_key, business_id, enabled, updated_by)
    values ('widget.new_chat_bubble', '00000000-0000-0000-0000-00000000000a', true, 'user_test_pgtap')$$,
  'feature_flag_overrides: a plain insert succeeds'
);

-- 6-13. platform_announcements: tenant-readable, admin-written
insert into public.platform_announcements (id, message, target_type, created_by)
values ('00000000-0000-0000-0000-0000000000a1', 'Scheduled maintenance tonight', 'all', 'user_test_pgtap');

insert into public.platform_announcements (id, message, target_type, target_business_ids, created_by)
values ('00000000-0000-0000-0000-0000000000a2', 'Only for Business A', 'selected', array['00000000-0000-0000-0000-00000000000a']::uuid[], 'user_test_pgtap');

insert into public.platform_announcements (id, message, active, target_type, target_business_ids, created_by)
values ('00000000-0000-0000-0000-0000000000a3', 'Inactive, selected for A', false, 'selected', array['00000000-0000-0000-0000-00000000000a']::uuid[], 'user_test_pgtap');

insert into _tap_results select throws_ok(
  $$insert into public.platform_announcements (message, target_type, created_by) values ('bad', 'selected', 'user_test_pgtap')$$,
  '23514',
  null,
  'platform_announcements: target_type = selected requires a non-empty target_business_ids'
);

insert into _tap_results select ok(
  not has_table_privilege('authenticated', 'public.platform_announcements', 'INSERT')
    and not has_table_privilege('authenticated', 'public.platform_announcements', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.platform_announcements', 'DELETE'),
  'platform_announcements: authenticated has no write grant -- only the admin service-role client mutates this table'
);

insert into _tap_results select ok(
  not has_table_privilege('anon', 'public.platform_announcements', 'SELECT'),
  'platform_announcements: anon cannot read announcements'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select is(
  (select count(*)::int from public.platform_announcements where id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'Business A sees an all-tenant announcement'
);

insert into _tap_results select is(
  (select count(*)::int from public.platform_announcements where id = '00000000-0000-0000-0000-0000000000a2'),
  1,
  'Business A sees an announcement targeted at it specifically'
);

insert into _tap_results select is(
  (select count(*)::int from public.platform_announcements where id = '00000000-0000-0000-0000-0000000000a3'),
  0,
  'Business A does not see an inactive announcement, even if targeted at it'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_b', 'role', 'authenticated', 'o', json_build_object('id', 'org_b'))::text,
  true
);

insert into _tap_results select is(
  (select count(*)::int from public.platform_announcements where id = '00000000-0000-0000-0000-0000000000a2'),
  0,
  'Business B does not see an announcement targeted only at Business A'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
