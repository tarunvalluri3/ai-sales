-- Tests for public.email_suppressions and the extended
-- leads_follow_up_status_check (2026-10-19, migration 20261019120000).
--
-- email_suppressions is deliberately NOT tenant-scoped (see the
-- migration's own comment), so there is no "org_a cannot touch org_b"
-- assertion to make here. The equivalent guarantee is stronger, and is
-- what this file asserts: an authenticated session cannot read or write
-- ANY row. Note the failure mode -- because new tables in this project
-- start with zero grants (20260811150450), an authenticated SELECT is
-- refused outright with 42501 rather than silently returning zero rows the
-- way an RLS-only denial would.
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.
--
-- Same session-simulation technique as 001_businesses_tenant_isolation.sql.

begin;
select plan(9);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

-- Fixture setup as postgres (bypasses RLS -- this is seeding, not the
-- thing under test).
insert into public.email_suppressions (email, reason, detail)
values ('bounced@example.com', 'hard_bounce', 'mailbox does not exist');

insert into _tap_results select is(
  (select reason from public.email_suppressions where email = 'bounced@example.com'),
  'hard_bounce',
  'a hard_bounce row is stored and readable by the service role'
);

insert into _tap_results select lives_ok(
  $$ insert into public.email_suppressions (email, reason) values ('spam@example.com', 'complaint') $$,
  'complaint is allowed by the reason check constraint'
);

insert into _tap_results select throws_ok(
  $$ insert into public.email_suppressions (email, reason) values ('other@example.com', 'soft_bounce') $$,
  '23514',
  null,
  'an unrecognized reason is rejected by the reason check constraint'
);

insert into _tap_results select throws_ok(
  $$ insert into public.email_suppressions (email, reason) values ('bounced@example.com', 'complaint') $$,
  '23505',
  null,
  'a duplicate email is rejected by the unique constraint the webhook upserts on'
);

insert into _tap_results select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'leads_follow_up_status_check')
    like '%blocked_email_suppressed%',
  'leads_follow_up_status_check accepts blocked_email_suppressed'
);

insert into _tap_results select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'leads_follow_up_status_check')
    like '%blocked_no_instagram_window%',
  'leads_follow_up_status_check still accepts every pre-existing value (constraint was swapped, not narrowed)'
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

insert into _tap_results select throws_ok(
  $$ select count(*) from public.email_suppressions $$,
  '42501',
  null,
  'an authenticated session cannot read email_suppressions at all'
);

insert into _tap_results select throws_ok(
  $$ insert into public.email_suppressions (email, reason) values ('injected@example.com', 'complaint') $$,
  '42501',
  null,
  'an authenticated session cannot insert a suppression row'
);

insert into _tap_results select throws_ok(
  $$ delete from public.email_suppressions where email = 'bounced@example.com' $$,
  '42501',
  null,
  'an authenticated session cannot delete a suppression row'
);

reset role;
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
