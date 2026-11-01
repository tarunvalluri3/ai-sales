-- publish_agent() (migrations 20261107000000 + 20261110000000): a real owner
-- publish must mark the business published, not just flip live_version_id.
--
-- The 2026-11-01 bug: publish_agent() passed agent_publish_internal()'s
-- backfill flag, so live_version_id was set but published_at,
-- onboarding_step and onboarding_completed_at were not -- the dashboard
-- header said "Live" while the widget chat API, the dashboard gate and the
-- onboarding wizard all said "unpublished".
--
-- What must hold:
--   1. An org member's publish sets live_version_id, published_at,
--      onboarding_step = 'live', onboarding_completed_at, and stamps
--      live_answer_bank_version at the post-publish answer_bank_version.
--   2. Tenant isolation: org A cannot publish business B, and B is untouched.
--
-- Run against the live, linked project via `npm test`.

begin;
select plan(9);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-0000000062a1', 'org_pa_a', 'PA Business A'),
  ('00000000-0000-0000-0000-0000000062b1', 'org_pa_b', 'PA Business B');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_pa_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_pa_a'))::text,
  true
);

-- 1-2. Publish own business; cross-tenant publish refused.
insert into _tap_results select lives_ok(
  $$select * from public.publish_agent('00000000-0000-0000-0000-0000000062a1')$$,
  'an org member can publish their own business'
);

insert into _tap_results select throws_ok(
  $$select * from public.publish_agent('00000000-0000-0000-0000-0000000062b1')$$,
  'P0002',
  null,
  'org A cannot publish business B'
);

reset role;

-- 3-7. The publish marked A published everywhere, not just live_version_id.
insert into _tap_results select ok(
  (select live_version_id is not null from public.businesses where id = '00000000-0000-0000-0000-0000000062a1'),
  'publish sets live_version_id'
);

insert into _tap_results select ok(
  (select published_at is not null from public.businesses where id = '00000000-0000-0000-0000-0000000062a1'),
  'publish sets published_at (the backfill flag is not passed)'
);

insert into _tap_results select is(
  (select onboarding_step from public.businesses where id = '00000000-0000-0000-0000-0000000062a1'),
  'live',
  'publish sets onboarding_step = live'
);

insert into _tap_results select ok(
  (select onboarding_completed_at is not null from public.businesses where id = '00000000-0000-0000-0000-0000000062a1'),
  'publish sets onboarding_completed_at'
);

insert into _tap_results select ok(
  (select live_answer_bank_version = answer_bank_version from public.businesses where id = '00000000-0000-0000-0000-0000000062a1'),
  'publish stamps live_answer_bank_version at the post-publish answer_bank_version'
);

-- 8-9. B untouched.
insert into _tap_results select ok(
  (select live_version_id is null and published_at is null from public.businesses where id = '00000000-0000-0000-0000-0000000062b1'),
  'business B is still unpublished'
);

insert into _tap_results select is(
  (select count(*) from public.agent_versions where business_id = '00000000-0000-0000-0000-0000000062b1'),
  0::bigint,
  'no version was created for business B'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
