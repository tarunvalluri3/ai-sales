begin;
select plan(8);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated, anon;

insert into public.businesses (id, clerk_org_id, name)
values ('00000000-0000-0000-0000-0000000079a1', 'org_upload_a', 'Upload A');
insert into storage.objects (bucket_id, name)
values ('agent-images', '00000000-0000-0000-0000-0000000079a1/products/existing.png');

-- Test RLS underneath the SQL-only Storage delete safeguard using rollback-only fixtures.
set local storage.allow_delete_query = 'true';
create function pg_temp.no_rows_changed(statement text) returns boolean language plpgsql as $$
declare changed bigint;
begin
  execute statement;
  get diagnostics changed = ROW_COUNT;
  return changed = 0;
exception when insufficient_privilege then
  return true;
end;
$$;

insert into _tap_results select is((select file_size_limit from storage.buckets where id = 'agent-images'), 2097152::bigint, 'bucket caps images at 2 MB');
insert into _tap_results select is((select allowed_mime_types from storage.buckets where id = 'agent-images'),
  array['image/jpeg', 'image/png', 'image/webp'], 'bucket allows only the supported image types');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"owner_upload_a","role":"authenticated","o":{"id":"org_upload_a"}}', true);
insert into _tap_results select throws_ok($$insert into storage.objects (bucket_id, name) values ('agent-images', '00000000-0000-0000-0000-0000000079a1/products/member.png')$$,
  '42501', null, 'authenticated cannot insert');
insert into _tap_results select ok(pg_temp.no_rows_changed($$update storage.objects set name = 'authenticated.png' where bucket_id = 'agent-images'$$), 'authenticated cannot update');
insert into _tap_results select ok(pg_temp.no_rows_changed($$delete from storage.objects where bucket_id = 'agent-images'$$), 'authenticated cannot delete');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into _tap_results select throws_ok($$insert into storage.objects (bucket_id, name) values ('agent-images', 'anon.png')$$,
  '42501', null, 'anon cannot insert');
insert into _tap_results select ok(pg_temp.no_rows_changed($$update storage.objects set name = 'anon.png' where bucket_id = 'agent-images'$$), 'anon cannot update');
insert into _tap_results select ok(pg_temp.no_rows_changed($$delete from storage.objects where bucket_id = 'agent-images'$$), 'anon cannot delete');
reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
