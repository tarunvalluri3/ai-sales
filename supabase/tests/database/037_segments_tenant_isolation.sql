-- Tenant-isolation test for public.segments (Phase 28). Full CRUD grant
-- to `authenticated`, same shape as public.lead_tags -- RLS is the
-- floor (business match only); the app layer additionally requires
-- org:admin for create/edit/delete (not exercised here, that's
-- app/(dashboard)/dashboard/customers/actions.ts's job, not the
-- database's).

begin;
select plan(6);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.segments (id, business_id, name, description, match_type, conditions)
values
  ('b0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Hot leads', null, 'all', '[{"field":"score","operator":"gte","value":80}]'::jsonb),
  ('b0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Hot leads', null, 'all', '[{"field":"score","operator":"gte","value":80}]'::jsonb);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select id from public.segments order by id $$,
  $$ values ('b0000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s segment, never org_b''s'
);

insert into _tap_results select throws_ok(
  $$ insert into public.segments (business_id, name, match_type, conditions)
     values ('00000000-0000-0000-0000-00000000000b', 'Forged', 'all', '[]'::jsonb) $$,
  '42501',
  null,
  'org_a session cannot create a segment claiming org_b''s business_id'
);

insert into _tap_results select lives_ok(
  $$ update public.segments set description = 'updated' where id = 'b0000000-0000-0000-0000-00000000000a' $$,
  'org_a session can update its own segment'
);

update public.segments set description = 'hacked' where id = 'b0000000-0000-0000-0000-00000000000b';
delete from public.segments where id = 'b0000000-0000-0000-0000-00000000000b';

reset role;
insert into _tap_results select is(
  (select description from public.segments where id = 'b0000000-0000-0000-0000-00000000000b'),
  null::text,
  'org_a session cannot mutate org_b''s segment (no rows affected, not an error)'
);

insert into _tap_results select is(
  (select count(*) from public.segments where id = 'b0000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'org_a session cannot delete org_b''s segment (no rows affected)'
);

insert into _tap_results select is(
  (select description from public.segments where id = 'b0000000-0000-0000-0000-00000000000a'),
  'updated',
  'org_a session''s own update from earlier genuinely persisted'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
