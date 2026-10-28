-- Shape, tenant isolation, and grants for Phase 33 Stop 3's new tables
-- (20261104000000_analytics_events_and_rollups.sql): analytics_events
-- (tenant-insertable, admin-readable-only, same RLS shape as audit_log)
-- and analytics_daily_rollups (global, admin-only, same zero-grant
-- posture as platform_admins/admin_audit_log).
--
-- Run against the live, linked project via `npm test`.

begin;
select plan(11);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

-- ===================================================================
-- analytics_events
-- ===================================================================

insert into _tap_results select is(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.analytics_events'::regclass),
  true,
  'analytics_events: row level security is enabled and forced'
);

insert into _tap_results select ok(
  has_table_privilege('authenticated', 'public.analytics_events', 'INSERT')
    and not has_table_privilege('authenticated', 'public.analytics_events', 'SELECT')
    and not has_table_privilege('authenticated', 'public.analytics_events', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.analytics_events', 'DELETE'),
  'analytics_events: authenticated may INSERT only (never read, even its own)'
);

insert into _tap_results select ok(
  not has_table_privilege('anon', 'public.analytics_events', 'SELECT'),
  'analytics_events: anon cannot read analytics_events'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select lives_ok(
  $$insert into public.analytics_events (business_id, event_name) values ('00000000-0000-0000-0000-00000000000a', 'business.signed_up')$$,
  'analytics_events: org_a session can insert its own event'
);

insert into _tap_results select throws_ok(
  $$insert into public.analytics_events (business_id, event_name) values ('00000000-0000-0000-0000-00000000000b', 'business.signed_up')$$,
  '42501',
  null,
  'analytics_events: org_a session cannot insert an event under org_b''s business_id (RLS with-check)'
);

insert into _tap_results select throws_ok(
  $$select count(*) from public.analytics_events$$,
  '42501',
  null,
  'analytics_events: org_a session cannot read analytics_events at all (no SELECT grant)'
);

reset role;

-- ===================================================================
-- analytics_daily_rollups
-- ===================================================================

insert into _tap_results select is(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.analytics_daily_rollups'::regclass),
  true,
  'analytics_daily_rollups: row level security is enabled and forced'
);

insert into _tap_results select ok(
  not has_table_privilege('authenticated', 'public.analytics_daily_rollups', 'SELECT')
    and not has_table_privilege('authenticated', 'public.analytics_daily_rollups', 'INSERT')
    and not has_table_privilege('authenticated', 'public.analytics_daily_rollups', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.analytics_daily_rollups', 'DELETE'),
  'analytics_daily_rollups: authenticated has no grant at all'
);

insert into _tap_results select ok(
  not has_table_privilege('anon', 'public.analytics_daily_rollups', 'SELECT'),
  'analytics_daily_rollups: anon cannot read analytics_daily_rollups'
);

insert into _tap_results select lives_ok(
  $$insert into public.analytics_daily_rollups (business_id, rollup_date, conversations_count, was_active)
    values ('00000000-0000-0000-0000-00000000000a', current_date, 3, true)$$,
  'analytics_daily_rollups: a plain insert succeeds (as the unrestricted pgTAP/postgres role)'
);

insert into _tap_results select throws_ok(
  $$insert into public.analytics_daily_rollups (business_id, rollup_date) values ('00000000-0000-0000-0000-00000000000a', current_date)$$,
  '23505',
  null,
  'analytics_daily_rollups: (business_id, rollup_date) is unique -- the rollup job''s upsert key'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
