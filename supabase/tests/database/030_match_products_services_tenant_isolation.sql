-- Tenant-isolation test for public.match_products / public.match_services
-- (AGENTS.md §7, required for the recommend_products intent-matching
-- change -- new tenant-scoped vector search functions).
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.
--
-- Same technique as 008_match_knowledge_chunks_tenant_isolation.sql:
-- small hand-built 3-dimension-pattern vectors padded to 1536, business
-- A and business B given identically-embedded rows so a pass proves the
-- p_business_id filter itself is doing the work, not coincidental
-- ranking. Also covers the status = 'approved' filter (a draft must
-- never be recommended).

begin;
select plan(4);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.products (id, business_id, name, status, embedding)
values
  (
    '10000000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-00000000000a',
    'Product A',
    'approved',
    (('[1,0,0' || repeat(',0', 1533) || ']'))::extensions.vector(1536)
  ),
  (
    '10000000-0000-0000-0000-00000000000b',
    '00000000-0000-0000-0000-00000000000b',
    'Product B',
    'approved',
    (('[1,0,0' || repeat(',0', 1533) || ']'))::extensions.vector(1536)
  ),
  (
    '10000000-0000-0000-0000-00000000000c',
    '00000000-0000-0000-0000-00000000000a',
    'Product A draft',
    'draft',
    (('[1,0,0' || repeat(',0', 1533) || ']'))::extensions.vector(1536)
  );

insert into public.services (id, business_id, name, status, embedding)
values
  (
    '11000000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-00000000000a',
    'Service A',
    'approved',
    (('[1,0,0' || repeat(',0', 1533) || ']'))::extensions.vector(1536)
  ),
  (
    '11000000-0000-0000-0000-00000000000b',
    '00000000-0000-0000-0000-00000000000b',
    'Service B',
    'approved',
    (('[1,0,0' || repeat(',0', 1533) || ']'))::extensions.vector(1536)
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

insert into _tap_results select results_eq(
  $$
    select name from public.match_products(
      '00000000-0000-0000-0000-00000000000a'::uuid,
      (('[1,0,0' || repeat(',0', 1533) || ']'))::extensions.vector(1536),
      5
    )
  $$,
  $$ values ('Product A') $$,
  'match_products scoped to org_a returns only org_a''s approved product, never org_b''s identically-embedded one or org_a''s own draft'
);

insert into _tap_results select is(
  (
    select count(*) from public.match_products(
      '00000000-0000-0000-0000-00000000000b'::uuid,
      (('[1,0,0' || repeat(',0', 1533) || ']'))::extensions.vector(1536),
      5
    )
  ),
  0::bigint,
  'org_a session cannot use match_products to read org_b''s products by passing org_b''s business_id (RLS still blocks the underlying select)'
);

insert into _tap_results select results_eq(
  $$
    select name from public.match_services(
      '00000000-0000-0000-0000-00000000000a'::uuid,
      (('[1,0,0' || repeat(',0', 1533) || ']'))::extensions.vector(1536),
      5
    )
  $$,
  $$ values ('Service A') $$,
  'match_services scoped to org_a returns only org_a''s service, never org_b''s identically-embedded one'
);

insert into _tap_results select is(
  (
    select count(*) from public.match_services(
      '00000000-0000-0000-0000-00000000000b'::uuid,
      (('[1,0,0' || repeat(',0', 1533) || ']'))::extensions.vector(1536),
      5
    )
  ),
  0::bigint,
  'org_a session cannot use match_services to read org_b''s services by passing org_b''s business_id (RLS still blocks the underlying select)'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
