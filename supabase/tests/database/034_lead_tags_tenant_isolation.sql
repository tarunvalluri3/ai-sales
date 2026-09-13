-- Tenant-isolation test for Phase 27's lead-tagging tables. lead_tags is
-- the business-visible catalog (grants select/insert/update/delete to
-- `authenticated`, RLS-scoped) -- covered the same way
-- 029_whatsapp_tenant_isolation.sql covers whatsapp_connections.
-- lead_tag_assignments/conversation_tag_assignments additionally prove
-- the insert policy's cross-entity `exists()` check (the migration's own
-- defense-in-depth beyond a plain business_id match): a forged insert
-- naming org_a's own business_id but org_b's real lead_id/tag_id must
-- still be denied, since a bare business_id check alone couldn't catch
-- that mismatch.

begin;
select plan(9);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.conversations (id, business_id, source)
values
  ('60000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'chat_widget'),
  ('60000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000b', 'chat_widget');

insert into public.leads (id, business_id, conversation_id, contact_email, qualification, qualification_reason)
values
  ('70000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-00000000000c', 'a@example.com', 'warm', 'test'),
  ('70000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000b', '60000000-0000-0000-0000-00000000000d', 'b@example.com', 'warm', 'test');

insert into public.lead_tags (id, business_id, name, color)
values
  ('80000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'VIP', 'accent'),
  ('80000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'VIP', 'accent');

insert into public.lead_tag_assignments (business_id, lead_id, tag_id)
values
  ('00000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-00000000000c', '80000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-00000000000d', '80000000-0000-0000-0000-00000000000b');

insert into public.conversation_tag_assignments (business_id, conversation_id, tag_id)
values
  ('00000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-00000000000c', '80000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b', '60000000-0000-0000-0000-00000000000d', '80000000-0000-0000-0000-00000000000b');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select business_id from public.lead_tags order by business_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s lead_tags row, never org_b''s'
);

insert into _tap_results select results_eq(
  $$ select business_id from public.lead_tag_assignments order by business_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s lead_tag_assignments row, never org_b''s'
);

insert into _tap_results select results_eq(
  $$ select business_id from public.conversation_tag_assignments order by business_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s conversation_tag_assignments row, never org_b''s'
);

insert into _tap_results select throws_ok(
  $$ insert into public.lead_tags (business_id, name, color)
     values ('00000000-0000-0000-0000-00000000000b', 'Forged', 'muted') $$,
  '42501',
  null,
  'org_a session cannot create a lead_tags row under org_b''s business id'
);

insert into _tap_results select throws_ok(
  $$ insert into public.lead_tag_assignments (business_id, lead_id, tag_id)
     values ('00000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-00000000000d', '80000000-0000-0000-0000-00000000000a') $$,
  '42501',
  null,
  'org_a session cannot assign its own tag to org_b''s lead, even naming its own business id (the insert policy''s exists() check catches the mismatch)'
);

insert into _tap_results select throws_ok(
  $$ insert into public.lead_tag_assignments (business_id, lead_id, tag_id)
     values ('00000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-00000000000c', '80000000-0000-0000-0000-00000000000b') $$,
  '42501',
  null,
  'org_a session cannot assign org_b''s tag to its own lead'
);

insert into _tap_results select throws_ok(
  $$ insert into public.conversation_tag_assignments (business_id, conversation_id, tag_id)
     values ('00000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-00000000000d', '80000000-0000-0000-0000-00000000000a') $$,
  '42501',
  null,
  'org_a session cannot assign its own tag to org_b''s conversation'
);

delete from public.lead_tags where id = '80000000-0000-0000-0000-00000000000b';

reset role;
insert into _tap_results select is(
  (select count(*) from public.lead_tags where id = '80000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'org_a session cannot delete org_b''s lead_tags row (no rows affected, not an error)'
);

insert into _tap_results select is(
  (select count(*) from public.lead_tag_assignments where tag_id = '80000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'org_b''s lead_tag_assignments row survives untouched (org_a never reached it)'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
