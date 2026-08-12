-- Tenant-isolation test for public.knowledge_documents (AGENTS.md §7 /
-- Phase 6). Not run in this implementation environment (no Docker / local
-- Supabase instance available) -- written and reviewed only. Run with:
-- supabase test db
--
-- Same session-simulation technique as 003_products_tenant_isolation.sql.

begin;
select plan(4);

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.knowledge_documents (id, business_id, source_type, source_id, title, content)
values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'manual', null, 'Doc A', 'Content A'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'manual', null, 'Doc B', 'Content B');

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
  $$ select title from public.knowledge_documents order by title $$,
  $$ values ('Doc A') $$,
  'org_a session sees only its own business''s knowledge documents, never org_b''s'
);

select lives_ok(
  $$ update public.knowledge_documents set title = 'Doc A updated' where id = '20000000-0000-0000-0000-00000000000a' $$,
  'org_a session can update its own knowledge document'
);

update public.knowledge_documents set title = 'Forged update' where id = '20000000-0000-0000-0000-00000000000b';

select is(
  (select count(*) from public.knowledge_documents where id = '20000000-0000-0000-0000-00000000000b' and title = 'Forged update'),
  0::bigint,
  'org_a session cannot mutate org_b''s knowledge document (no rows affected, not an error)'
);

select throws_ok(
  $$ insert into public.knowledge_documents (business_id, source_type, title, content) values ('00000000-0000-0000-0000-00000000000b', 'manual', 'Forged doc', 'x') $$,
  '42501',
  null,
  'org_a session cannot insert a knowledge document claiming org_b''s business_id'
);

reset role;

select * from finish();
rollback;
