-- Tenant-isolation test for public.match_knowledge_chunks (AGENTS.md §7 /
-- Phase 7 exit criterion).
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.
--
-- Uses small hand-built 3-dimension-pattern vectors padded to 1536 so the
-- test is readable without embedding a real model output. Only the first
-- three components vary; the rest are zero-padding, which is enough to
-- prove ranking and tenant filtering both work correctly.

begin;
select plan(3);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B'),
  ('00000000-0000-0000-0000-00000000000c', 'org_c', 'Business C (no knowledge)');

insert into public.knowledge_documents (id, business_id, source_type, source_id, title, content)
values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'manual', null, 'Doc A', 'Pricing info'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'manual', null, 'Doc B', 'Pricing info');

-- Business A has one chunk closely aligned with the query vector
-- (1,0,0,...), Business B has a chunk with an identical embedding to
-- Business A's -- proving that a matching embedding in another business
-- is still correctly excluded by the p_business_id filter, not just by
-- coincidentally ranking lower.
insert into public.knowledge_chunks (id, business_id, document_id, chunk_index, content, char_count, embedding)
values
  (
    '30000000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-00000000000a',
    '20000000-0000-0000-0000-00000000000a',
    0,
    'Chunk A',
    7,
    (('[1,0,0' || repeat(',0', 1533) || ']'))::extensions.vector(1536)
  ),
  (
    '30000000-0000-0000-0000-00000000000b',
    '00000000-0000-0000-0000-00000000000b',
    '20000000-0000-0000-0000-00000000000b',
    0,
    'Chunk B',
    7,
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
    select content from public.match_knowledge_chunks(
      '00000000-0000-0000-0000-00000000000a'::uuid,
      (('[1,0,0' || repeat(',0', 1533) || ']'))::extensions.vector(1536),
      5
    )
  $$,
  $$ values ('Chunk A') $$,
  'match_knowledge_chunks scoped to org_a returns only org_a''s chunk, never org_b''s identically-embedded chunk'
);

insert into _tap_results select is(
  (
    select count(*) from public.match_knowledge_chunks(
      '00000000-0000-0000-0000-00000000000b'::uuid,
      (('[1,0,0' || repeat(',0', 1533) || ']'))::extensions.vector(1536),
      5
    )
  ),
  0::bigint,
  'org_a session cannot use match_knowledge_chunks to read org_b''s chunks by passing org_b''s business_id (RLS still blocks the underlying select)'
);

reset role;

-- Business C's own session: no fixture data exists for org_c, so
-- match_knowledge_chunks must return an empty result, not an error --
-- the literal Phase 7 exit criterion (docs/phases.md).
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'user_test_c',
    'role', 'authenticated',
    'o', json_build_object('id', 'org_c')
  )::text,
  true
);

insert into _tap_results select is(
  (
    select count(*) from public.match_knowledge_chunks(
      '00000000-0000-0000-0000-00000000000c'::uuid,
      (('[1,0,0' || repeat(',0', 1533) || ']'))::extensions.vector(1536),
      5
    )
  ),
  0::bigint,
  'a business with no matching knowledge gets an empty result from match_knowledge_chunks, not an error (exit criterion)'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
