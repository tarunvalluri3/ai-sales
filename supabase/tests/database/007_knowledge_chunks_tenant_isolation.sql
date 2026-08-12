-- Tenant-isolation test for public.knowledge_chunks (AGENTS.md §7 /
-- Phase 6). Not run in this implementation environment (no Docker / local
-- Supabase instance available) -- written and reviewed only. Run with:
-- supabase test db
--
-- Same session-simulation technique as 003_products_tenant_isolation.sql.
-- No update policy exists on this table (chunks are delete-and-reinsert
-- only, see lib/knowledge.ts), so this test covers select/delete/insert.

begin;
select plan(3);

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.knowledge_documents (id, business_id, source_type, source_id, title, content)
values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'manual', null, 'Doc A', 'Content A'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'manual', null, 'Doc B', 'Content B');

insert into public.knowledge_chunks (id, business_id, document_id, chunk_index, content, char_count)
values
  ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 0, 'Chunk A', 7),
  ('30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 0, 'Chunk B', 7);

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
  $$ select content from public.knowledge_chunks order by content $$,
  $$ values ('Chunk A') $$,
  'org_a session sees only its own business''s knowledge chunks, never org_b''s'
);

delete from public.knowledge_chunks where id = '30000000-0000-0000-0000-00000000000b';

select is(
  (select count(*) from public.knowledge_chunks where id = '30000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'org_a session cannot delete org_b''s knowledge chunk (no rows affected, not an error)'
);

select throws_ok(
  $$ insert into public.knowledge_chunks (business_id, document_id, chunk_index, content, char_count) values ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 1, 'Forged chunk', 13) $$,
  '42501',
  null,
  'org_a session cannot insert a knowledge chunk claiming org_b''s business_id'
);

reset role;

select * from finish();
rollback;
