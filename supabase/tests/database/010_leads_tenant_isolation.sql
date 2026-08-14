-- Tenant-isolation test for public.leads (AGENTS.md §7 / Phase 10 exit
-- criterion).
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.
--
-- Same session-simulation technique as 001_businesses_tenant_isolation.sql.
-- Also exercises the leads_contact_required check constraint.

begin;
select plan(5);
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

insert into public.leads (
  id, business_id, conversation_id, contact_email, qualification, qualification_reason
)
values
  ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'a@example.com', 'warm', 'test'),
  ('30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'b@example.com', 'warm', 'test');

insert into _tap_results select throws_ok(
  $$ insert into public.leads (business_id, conversation_id, qualification, qualification_reason)
     values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'cold', 'no contact info') $$,
  '23514',
  null,
  'a lead with neither contact_email nor contact_phone is rejected by leads_contact_required'
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

insert into _tap_results select results_eq(
  $$ select id from public.leads order by id $$,
  $$ values ('30000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s leads, never org_b''s'
);

insert into _tap_results select lives_ok(
  $$ update public.leads set status = 'contacted' where id = '30000000-0000-0000-0000-00000000000a' $$,
  'org_a session can update its own lead''s status'
);

update public.leads set status = 'converted' where id = '30000000-0000-0000-0000-00000000000b';

-- Checked via reset role (the unrestricted connecting role) -- see
-- 003_products_tenant_isolation.sql's comment for why (Phase 19b).
reset role;
insert into _tap_results select is(
  (select count(*) from public.leads where id = '30000000-0000-0000-0000-00000000000b' and status = 'converted'),
  0::bigint,
  'org_a session cannot mutate org_b''s lead (no rows affected, not an error -- same silent-no-op contract as updateProduct())'
);

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
  $$ insert into public.leads (business_id, conversation_id, contact_email, qualification, qualification_reason)
     values ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'forged@example.com', 'hot', 'forged') $$,
  '42501',
  null,
  'org_a session cannot insert a lead claiming org_b''s business_id'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
