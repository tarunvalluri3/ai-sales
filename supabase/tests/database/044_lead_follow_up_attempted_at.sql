-- Tests for leads.follow_up_attempted_at and leads_follow_up_sweep_idx
-- (2026-10-20, migration 20261020000000) -- the column the stalled-lead
-- sweep uses to rotate through blocked leads instead of retrying the same
-- 25 forever.
--
-- Covers the database-layer contract only: the column's shape, the index
-- the sweep's WHERE/ORDER BY relies on, that it is independent of
-- follow_up_sent_at (the at-most-once send gate), and that it inherits
-- leads' tenant isolation. The sweep's own selection and stamping logic
-- (lib/stalled-leads.ts) is TypeScript with no test harness in this repo to
-- run it -- npm test is pgTAP only -- so it is not asserted here.
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
insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.conversations (id, business_id, source)
values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'test'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'test');

-- Inserted without naming follow_up_attempted_at, i.e. what every row that
-- predates the migration looks like.
insert into public.leads (
  id, business_id, conversation_id, contact_email, qualification, qualification_reason
)
values
  ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'a@example.com', 'warm', 'test'),
  ('30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'b@example.com', 'warm', 'test');

insert into _tap_results select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'follow_up_attempted_at'
  ),
  'leads.follow_up_attempted_at exists'
);

insert into _tap_results select is(
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'follow_up_attempted_at'),
  'timestamp with time zone',
  'follow_up_attempted_at is timestamptz'
);

insert into _tap_results select is(
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'follow_up_attempted_at'),
  'YES',
  'follow_up_attempted_at is nullable (null = never attempted, which sorts first in the sweep)'
);

insert into _tap_results select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'leads' and indexname = 'leads_follow_up_sweep_idx'
  ),
  'leads_follow_up_sweep_idx exists'
);

-- Asserts the index is shaped for the sweep, not merely present: ascending
-- order has to say NULLS FIRST explicitly (the default is NULLS LAST), and
-- it has to be partial on the unsent, still-open leads the sweep selects.
insert into _tap_results select ok(
  (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'leads_follow_up_sweep_idx')
      like '%follow_up_attempted_at NULLS FIRST%'
  and (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'leads_follow_up_sweep_idx')
      like '%WHERE%follow_up_sent_at IS NULL%',
  'leads_follow_up_sweep_idx orders attempted-at NULLS FIRST and is partial on follow_up_sent_at IS NULL'
);

insert into _tap_results select is(
  (select follow_up_attempted_at from public.leads where id = '30000000-0000-0000-0000-00000000000a'),
  null::timestamptz,
  'a lead that predates the migration has a null follow_up_attempted_at (no backfill)'
);

-- What the sweep does to a blocked lead: stamp the attempt, leave the send
-- gate alone so the lead stays eligible for a later retry.
insert into _tap_results select lives_ok(
  $$ update public.leads
       set follow_up_status = 'blocked_no_whatsapp_template', follow_up_attempted_at = now()
     where id = '30000000-0000-0000-0000-00000000000a' $$,
  'a blocked attempt can be recorded by setting follow_up_attempted_at'
);

insert into _tap_results select ok(
  (select follow_up_attempted_at is not null and follow_up_sent_at is null
     from public.leads where id = '30000000-0000-0000-0000-00000000000a'),
  'stamping follow_up_attempted_at leaves follow_up_sent_at null (the lead stays retryable)'
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

update public.leads set follow_up_attempted_at = now()
  where id = '30000000-0000-0000-0000-00000000000b';

-- Checked via reset role (the unrestricted connecting role) -- see
-- 003_products_tenant_isolation.sql's comment for why (Phase 19b).
reset role;
insert into _tap_results select is(
  (select follow_up_attempted_at from public.leads where id = '30000000-0000-0000-0000-00000000000b'),
  null::timestamptz,
  'org_a session cannot stamp org_b''s lead (no rows affected, not an error -- leads_update_own_business RLS)'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
