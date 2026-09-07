-- Tenant-isolation + permission-boundary test for widget_keys.name and
-- widget_keys.last_used_at (Widget Settings critique follow-up,
-- 2026-09-08, AGENTS.md §7). `name` is dashboard-editable like
-- allowed_origins/status, so it needs the same cross-tenant coverage as
-- 018_widget_keys_tenant_isolation.sql. `last_used_at` is written only
-- by the service role (lib/widget-auth.ts, which bypasses RLS/grants
-- entirely) -- this test instead confirms an authenticated dashboard
-- session, even for its own business's own key, cannot set it directly,
-- since no column grant exists for it.

begin;
select plan(3);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000001a', 'org_a_028', 'Business A'),
  ('00000000-0000-0000-0000-00000000001b', 'org_b_028', 'Business B');

insert into public.widget_keys (id, business_id, allowed_origins, name)
values
  ('40000000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-00000000001a', array['https://a.example.com'], null),
  ('40000000-0000-0000-0000-00000000001b', '00000000-0000-0000-0000-00000000001b', array['https://b.example.com'], 'Old name');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a_028'))::text,
  true
);

insert into _tap_results select lives_ok(
  $$ update public.widget_keys set name = 'Marketing site' where id = '40000000-0000-0000-0000-00000000001a' $$,
  'org_a session can rename its own widget key'
);

update public.widget_keys set name = 'Renamed by org_a' where id = '40000000-0000-0000-0000-00000000001b';

insert into _tap_results select throws_ok(
  $$ update public.widget_keys set last_used_at = now() where id = '40000000-0000-0000-0000-00000000001a' $$,
  '42501',
  null,
  'org_a session cannot set last_used_at on its own widget key -- only the service role may (no column grant exists)'
);

reset role;
insert into _tap_results select is(
  (select name from public.widget_keys where id = '40000000-0000-0000-0000-00000000001b'),
  'Old name',
  'org_a session cannot rename org_b''s widget key (no rows affected, not an error)'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
