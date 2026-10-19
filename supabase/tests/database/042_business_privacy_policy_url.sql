-- Tests for businesses.privacy_policy_url (2026-10-19) -- the
-- businesses_privacy_policy_url_format check constraint and the
-- column-scoped grant's tenant isolation. Modeled directly on
-- 024_widget_suggested_questions_shape.sql, which covers the same
-- shape of thing (a new businesses column plus its column-level grant)
-- rather than a new table, so no new RLS policy is under test here --
-- the existing businesses_update_own_org policy (Phase 11) is.
--
-- The widget-side fallback (composer.tsx rendering '/privacy' when this
-- column is null) is plain TypeScript with no database object to test;
-- this file covers only the database-layer contract that the
-- updateWidgetBrandingAction flow writes through.
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.
--
-- Same session-simulation technique as 001_businesses_tenant_isolation.sql.

begin;
select plan(7);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

-- Fixture setup as postgres (bypasses RLS -- this is seeding, not the
-- thing under test).
insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into _tap_results select is(
  (select privacy_policy_url from public.businesses where id = '00000000-0000-0000-0000-00000000000a'),
  null::text,
  'privacy_policy_url defaults to null (every pre-existing business keeps the /privacy fallback)'
);

insert into _tap_results select lives_ok(
  $$ update public.businesses set privacy_policy_url = null where id = '00000000-0000-0000-0000-00000000000a' $$,
  'null is allowed by businesses_privacy_policy_url_format'
);

insert into _tap_results select lives_ok(
  $$ update public.businesses set privacy_policy_url = 'https://example.com/privacy' where id = '00000000-0000-0000-0000-00000000000a' $$,
  'an https URL is allowed by businesses_privacy_policy_url_format'
);

insert into _tap_results select throws_ok(
  $$ update public.businesses set privacy_policy_url = 'http://example.com/privacy' where id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514',
  null,
  'a plaintext http URL is rejected by businesses_privacy_policy_url_format (the consent notice renders inside an https page)'
);

insert into _tap_results select throws_ok(
  $$ update public.businesses set privacy_policy_url = 'javascript:alert(1)' where id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514',
  null,
  'a non-https scheme is rejected by businesses_privacy_policy_url_format (this value is rendered straight into an href)'
);

-- Simulate a signed-in user whose active Clerk organization is org_a.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'user_test_a',
    'role', 'authenticated',
    'o', json_build_object('id', 'org_a')
  )::text,
  true
);

insert into _tap_results select lives_ok(
  $$ update public.businesses set privacy_policy_url = 'https://business-a.example/privacy' where id = '00000000-0000-0000-0000-00000000000a' $$,
  'org_a session can update its own business''s privacy_policy_url'
);

update public.businesses set privacy_policy_url = 'https://forged.example/privacy'
  where id = '00000000-0000-0000-0000-00000000000b';

-- Checked via reset role (the unrestricted connecting role) -- see
-- 003_products_tenant_isolation.sql's comment for why (Phase 19b).
reset role;
insert into _tap_results select is(
  (select privacy_policy_url from public.businesses where id = '00000000-0000-0000-0000-00000000000b'),
  null::text,
  'org_a session cannot set org_b''s privacy_policy_url (no rows affected, not an error -- businesses_update_own_org RLS)'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
