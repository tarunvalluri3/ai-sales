-- Structural test for the `catalog-images` Storage bucket (Phase B2,
-- 20260901050000_create_catalog_images_bucket.sql) -- assessed low-risk/
-- structural at the time and never independently pgTAP-verified until
-- now (STATE.md backlog item 8). Unlike knowledge-files, this bucket has
-- no RLS policies by design (its own migration's doc comment: only the
-- service role ever writes here, and a public bucket serves reads
-- through Supabase Storage's own public-object endpoint, which does not
-- go through RLS at all) -- so what's worth guarding against here is a
-- regression in that design, not a tenant-isolation policy.
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.

begin;
select plan(2);
create temporary table _tap_results (line text);

insert into _tap_results select is(
  (select public from storage.buckets where id = 'catalog-images'),
  true,
  'the catalog-images bucket exists and is public, matching its "public reads bypass RLS" design'
);

insert into _tap_results select is(
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and qual like '%catalog-images%'),
  0::bigint,
  'no RLS policy scopes storage.objects to catalog-images -- only the service role (which bypasses RLS entirely) is meant to write here'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
