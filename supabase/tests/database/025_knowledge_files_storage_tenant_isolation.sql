-- Tenant-isolation test for the `knowledge-files` Storage bucket's RLS
-- policies on storage.objects (Phase B1, 20260821050000_add_file_url_
-- knowledge_sources.sql) -- assessed low-risk/structural at the time and
-- never independently pgTAP-verified until now (STATE.md backlog item
-- 8). Same tenant-scoping convention as every table in this project,
-- applied to Storage's own object-path model: the business_id is the
-- first path segment (storage.foldername(name))[1]) instead of a column.
--
-- Covers select/insert only, not delete: Supabase's own
-- storage.protect_delete() trigger rejects any direct SQL DELETE against
-- storage.objects outright ("Direct deletion from storage tables is not
-- allowed. Use the Storage API instead") -- confirmed live, this fires
-- before RLS is even reached, for every role including the unrestricted
-- connecting role this suite otherwise uses for fixture cleanup. The
-- real app (lib/knowledge.ts's document-delete path) goes through the
-- Storage API, not raw SQL, so this isn't a gap in what's tested --
-- there's no meaningful raw-SQL delete-isolation behavior to assert here.
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.
--
-- Same session-simulation technique as 001_businesses_tenant_isolation.sql.

begin;
select plan(3);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

-- Fixture setup as postgres (bypasses RLS -- this is seeding, not the
-- thing under test).
insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

-- An existing object under org_b's own folder, seeded directly (as
-- postgres) the same way a real prior upload would already be in place.
insert into storage.objects (bucket_id, name)
values ('knowledge-files', '00000000-0000-0000-0000-00000000000b/doc1/file.txt');

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
  $$ insert into storage.objects (bucket_id, name)
     values ('knowledge-files', '00000000-0000-0000-0000-00000000000a/doc1/file.txt') $$,
  'org_a session can upload into its own business''s folder in knowledge-files'
);

insert into _tap_results select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('knowledge-files', '00000000-0000-0000-0000-00000000000b/doc1/forged.txt') $$,
  '42501',
  null,
  'org_a session cannot upload into org_b''s folder in knowledge-files'
);

insert into _tap_results select results_eq(
  $$ select name from storage.objects where bucket_id = 'knowledge-files' order by name $$,
  $$ values ('00000000-0000-0000-0000-00000000000a/doc1/file.txt'::text) $$,
  'org_a session sees only its own business''s objects in knowledge-files, never org_b''s'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
