-- Tenant-isolation test for public.products (AGENTS.md §7 / Phase 5 exit
-- criterion). Not run in this implementation environment (no Docker /
-- local Supabase instance available) — written and reviewed only. Run
-- with: supabase test db
--
-- Same session-simulation technique as 001_businesses_tenant_isolation.sql.

begin;
select plan(4);

-- Fixture setup as postgres (bypasses RLS — this is seeding, not the
-- thing under test).
insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.products (id, business_id, name)
values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Product A'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Product B');

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

select results_eq(
  $$ select name from public.products order by name $$,
  $$ values ('Product A') $$,
  'org_a session sees only its own business''s products, never org_b''s'
);

select lives_ok(
  $$ update public.products set name = 'Product A updated' where id = '10000000-0000-0000-0000-00000000000a' $$,
  'org_a session can update its own product'
);

update public.products set name = 'Forged update' where id = '10000000-0000-0000-0000-00000000000b';

select is(
  (select count(*) from public.products where id = '10000000-0000-0000-0000-00000000000b' and name = 'Forged update'),
  0::bigint,
  'org_a session cannot mutate org_b''s product (no rows affected, not an error)'
);

select throws_ok(
  $$ insert into public.products (business_id, name) values ('00000000-0000-0000-0000-00000000000b', 'Forged product') $$,
  '42501',
  null,
  'org_a session cannot insert a product claiming org_b''s business_id'
);

reset role;

select * from finish();
rollback;
