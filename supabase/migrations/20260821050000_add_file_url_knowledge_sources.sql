-- File upload and URL/website import as new knowledge sources (Phase
-- 24), alongside the existing manual/product/service/faq source types.
-- `source_url` (url sources) and `storage_path` (file sources) are
-- mutually exclusive with each other but neither is enforced NOT NULL --
-- both stay null for manual/product/service/faq rows, matching the
-- existing nullable `source_id` convention for those.
--
-- `refresh_interval_hours`: url sources only. Null means "no scheduled
-- refresh" (a one-time import); a business sets a value to opt into
-- periodic re-fetching via lib/url-ingestion.ts's daily sweep (piggybacked
-- on the existing shared cron backstop, not a second Vercel Cron job --
-- see app/api/cron/process-ingestion-queue/route.ts's updated doc
-- comment).

alter table public.knowledge_documents
  drop constraint knowledge_documents_source_type_check;

alter table public.knowledge_documents add constraint knowledge_documents_source_type_check check (
  source_type in ('manual', 'product', 'service', 'faq', 'file', 'url')
);

alter table public.knowledge_documents
  add column source_url text,
  add column storage_path text,
  add column refresh_interval_hours int,
  add column last_refreshed_at timestamptz;

create index knowledge_documents_url_refresh_due_idx
  on public.knowledge_documents (last_refreshed_at)
  where source_type = 'url' and refresh_interval_hours is not null;

-- Private bucket for uploaded knowledge files. Objects are stored under
-- a `{business_id}/{document_id}/{filename}` path -- the RLS policies
-- below check that prefix against the caller's own business, the same
-- tenant-scoping convention as every table in this project, applied to
-- Storage's own object-path model instead of a business_id column.
insert into storage.buckets (id, name, public)
values ('knowledge-files', 'knowledge-files', false);

create policy "knowledge_files_select_own_business" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'knowledge-files'
    and (storage.foldername(name))[1] in (
      select id::text from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "knowledge_files_insert_own_business" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'knowledge-files'
    and (storage.foldername(name))[1] in (
      select id::text from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "knowledge_files_delete_own_business" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'knowledge-files'
    and (storage.foldername(name))[1] in (
      select id::text from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
