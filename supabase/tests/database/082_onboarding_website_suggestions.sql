begin;
select plan(4);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name) values
  ('00000000-0000-0000-0000-0000000082a1', 'org_import_a', 'Import A'),
  ('00000000-0000-0000-0000-0000000082b1', 'org_import_b', 'Import B');
insert into public.knowledge_documents (id, business_id, title, content, source_type, onboarding_website_import) values
  ('00000000-0000-0000-0000-0000000082a2', '00000000-0000-0000-0000-0000000082a1', 'Website A', 'Example text for tenant A', 'url', true),
  ('00000000-0000-0000-0000-0000000082b2', '00000000-0000-0000-0000-0000000082b1', 'Website B', 'Example text for tenant B', 'url', true);
update public.onboarding_website_imports set suggestions = '[{"id":"private"}]'
where business_id = '00000000-0000-0000-0000-0000000082b1';
insert into _tap_results select throws_ok($$insert into public.onboarding_website_imports (business_id, document_id)
  values ('00000000-0000-0000-0000-0000000082a1', '00000000-0000-0000-0000-0000000082b2')$$,
  '23503', null, 'cannot attach another business document');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_import_a","role":"authenticated","o":{"id":"org_import_a"}}', true);
insert into _tap_results select is((select count(*) from public.onboarding_website_imports), 1::bigint, 'tenant sees only its review');
insert into _tap_results select is((select suggestions from public.onboarding_website_imports where business_id = '00000000-0000-0000-0000-0000000082b1'),
  null::jsonb, 'another tenant cannot read the suggestion JSON');
insert into _tap_results select throws_ok($$update public.onboarding_website_imports set attempts = 1$$,
  '42501', null, 'client role cannot modify any attempt');
reset role;
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
