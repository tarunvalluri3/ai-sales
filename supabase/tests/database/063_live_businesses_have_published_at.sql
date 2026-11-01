-- Data invariant (2026-11-01): every active, non-deleted business that has a
-- live version also has published_at set.
--
-- The 2026-11-01 publish bug left live businesses with published_at null
-- (publish_agent() passed its backfill flag). Migration 20261110000000
-- repaired every active row, skipped suspended/deleted ones, and
-- lib/agent-published-repair.ts repairs those when /apache reinstates them.
-- published_at still gates the answer-bank SQL (get_instant_answer,
-- match_faq_questions), so a row in that state would silently lose its
-- instant answers. This catches a regression of either fix, or any new write
-- path that sets live_version_id without stamping published_at.
--
-- Read-only: asserts over whatever rows the target database holds (staging in
-- CI). Run against the live, linked project via `npm test`.

begin;
select plan(1);
create temporary table _tap_results (line text);

insert into _tap_results select is(
  (select count(*) from public.businesses
    where live_version_id is not null
      and published_at is null
      and status = 'active'
      and deleted_at is null),
  0::bigint,
  'every active, non-deleted business with a live version has published_at set'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
