-- New businesses get appointment booking and product recommendations ON
-- (migration 20261124000400), and -- because the live agent reads the
-- PUBLISHED snapshot, not the business row -- a brand-new business that
-- publishes carries both into its live version.
--
--   1-2. A business created the way onboarding creates it (no toggle columns
--        given; lib/business.ts createBusinessForOrg) has both ON.
--   3.   Its owner's publish succeeds.
--   4-5. The live version's snapshot has capabilities.appointments and
--        capabilities.recommendProducts = true.
--   6.   A business that explicitly turned booking OFF keeps it off in its
--        snapshot (the default does not override a choice).
--   7.   The new lead fields reject text over 100 characters.
--
-- Run against the linked project via `npm test` (CI: the staging database).

begin;
select plan(7);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values ('00000000-0000-0000-0000-0000000077a1', 'org_capdef_a', 'Cap Defaults A');

insert into public.businesses (id, clerk_org_id, name, appointments_enabled)
values ('00000000-0000-0000-0000-0000000077b1', 'org_capdef_b', 'Cap Defaults B', false);

insert into _tap_results select ok(
  (select appointments_enabled from public.businesses where id = '00000000-0000-0000-0000-0000000077a1'),
  'a new business has appointment booking ON by default'
);
insert into _tap_results select ok(
  (select recommend_products_enabled from public.businesses where id = '00000000-0000-0000-0000-0000000077a1'),
  'a new business has product recommendations ON by default'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_capdef_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_capdef_a'))::text,
  true
);
insert into _tap_results select lives_ok(
  $$select * from public.publish_agent('00000000-0000-0000-0000-0000000077a1')$$,
  'the owner can publish the new business'
);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_capdef_b', 'role', 'authenticated', 'o', json_build_object('id', 'org_capdef_b'))::text,
  true
);
select * from public.publish_agent('00000000-0000-0000-0000-0000000077b1');
reset role;

insert into _tap_results select is(
  (select (v.snapshot -> 'config' -> 'capabilities' ->> 'appointments')::boolean
     from public.businesses b join public.agent_versions v on v.id = b.live_version_id
    where b.id = '00000000-0000-0000-0000-0000000077a1'),
  true,
  'the published (live) snapshot has appointment booking ON'
);
insert into _tap_results select is(
  (select (v.snapshot -> 'config' -> 'capabilities' ->> 'recommendProducts')::boolean
     from public.businesses b join public.agent_versions v on v.id = b.live_version_id
    where b.id = '00000000-0000-0000-0000-0000000077a1'),
  true,
  'the published (live) snapshot has product recommendations ON'
);
insert into _tap_results select is(
  (select (v.snapshot -> 'config' -> 'capabilities' ->> 'appointments')::boolean
     from public.businesses b join public.agent_versions v on v.id = b.live_version_id
    where b.id = '00000000-0000-0000-0000-0000000077b1'),
  false,
  'a business that turned booking off keeps it off in its published snapshot'
);

insert into public.conversations (id, business_id, source)
values ('00000000-0000-0000-0000-0000000077c1', '00000000-0000-0000-0000-0000000077a1', 'test');
insert into _tap_results select throws_ok(
  $$insert into public.leads (business_id, conversation_id, qualification, qualification_reason, preferred_time)
    values ('00000000-0000-0000-0000-0000000077a1', '00000000-0000-0000-0000-0000000077c1', 'warm', 'x', repeat('a', 101))$$,
  '23514',
  null,
  'leads.preferred_time is capped at 100 characters'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
