-- Shape and tenant isolation for ai_response_metrics' latency-instrumentation
-- columns (2026-10-21, migration 20261023000000): total_latency_ms,
-- thinking_tokens, stage_timings.
--
-- Shape first, because the point of these columns is that a measurement
-- taken weeks ago is still readable: nullable with no backfill, so a row
-- that predates the instrumentation says "not measured" rather than
-- carrying a zero nobody measured.
--
-- Then isolation, because the breakdown is commercially revealing in a way
-- the old integer columns were not: stage_timings names which tools a
-- business's AI called and how long its own knowledge base took to search.
-- This table is written only by the service-role client from the chat path,
-- so the contract under test is "a tenant reads its own rows and writes
-- none at all".
--
-- Includes a positive control (assertion 9). An isolation test that only
-- ever proves denial will also pass against a table nobody can read at
-- all, which would hide a broken grant rather than reveal it.
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.
--
-- Same session-simulation technique as 001_businesses_tenant_isolation.sql.

begin;
select plan(9);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

-- Fixture setup as postgres (bypasses RLS -- this is seeding, not the
-- thing under test).
insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.conversations (id, business_id, source)
values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'test'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'test');

-- Row A is inserted WITHOUT naming any of the three new columns, i.e.
-- exactly what every row written before this migration looks like.
insert into public.ai_response_metrics (id, business_id, conversation_id, latency_ms, input_tokens, output_tokens, tool_call_count)
values
  ('40000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 3805, 2400, 80, 1);

-- Row B is a fully instrumented turn, written the way lib/rag.ts writes
-- one now.
insert into public.ai_response_metrics (
  id, business_id, conversation_id, latency_ms, total_latency_ms, input_tokens, output_tokens, thinking_tokens, tool_call_count, stage_timings
)
values (
  '40000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b',
  3000, 4200, 2400, 80, 0, 1,
  '[{"stage":"quota_check","ms":21},{"stage":"embedding","ms":180},{"stage":"vector_search","ms":24},{"stage":"model_call_1","ms":980},{"stage":"tool_batch_1","ms":31,"tools":["check_product_details"]},{"stage":"model_call_2","ms":1200}]'::jsonb
);

insert into _tap_results select is(
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_response_metrics' and column_name = 'total_latency_ms'),
  'integer',
  'ai_response_metrics.total_latency_ms exists and is integer'
);

insert into _tap_results select is(
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_response_metrics' and column_name = 'thinking_tokens'),
  'integer',
  'ai_response_metrics.thinking_tokens exists and is integer'
);

insert into _tap_results select is(
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_response_metrics' and column_name = 'stage_timings'),
  'jsonb',
  'ai_response_metrics.stage_timings exists and is jsonb'
);

-- All three nullable, asserted together: a NOT NULL on any of them would
-- have needed a backfill of numbers nobody measured.
insert into _tap_results select is(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_response_metrics'
      and column_name in ('total_latency_ms', 'thinking_tokens', 'stage_timings')
      and is_nullable = 'YES'),
  3::bigint,
  'all three instrumentation columns are nullable (null = this turn ran before the instrumentation existed)'
);

insert into _tap_results select ok(
  (select total_latency_ms is null and thinking_tokens is null and stage_timings is null
     from public.ai_response_metrics where id = '40000000-0000-0000-0000-00000000000a'),
  'a row that predates the migration has all three columns null (no backfill)'
);

-- latency_ms keeps its own meaning and its own value: the two are
-- deliberately different numbers on the same row, not one renamed.
insert into _tap_results select ok(
  (select latency_ms = 3000 and total_latency_ms = 4200
     from public.ai_response_metrics where id = '40000000-0000-0000-0000-00000000000b'),
  'latency_ms and total_latency_ms are independent values on the same row (the old column is not redefined)'
);

-- The breakdown has to survive a round trip as queryable JSON, not just as
-- an opaque blob -- being able to ask "how long did the embedding take"
-- weeks later is the entire reason it is a column.
insert into _tap_results select is(
  (select (stage_timings -> 4 ->> 'ms')::int
     from public.ai_response_metrics where id = '40000000-0000-0000-0000-00000000000b'),
  31,
  'stage_timings is queryable per stage (a tool batch reports its own duration)'
);

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

insert into _tap_results select is(
  (select count(*) from public.ai_response_metrics
    where id = '40000000-0000-0000-0000-00000000000b'),
  0::bigint,
  'org_a session cannot read org_b''s stage timings (ai_response_metrics_select_own_business)'
);

-- Positive control: the same session CAN read its own row, so the
-- assertion above means isolation, not an unusable table.
insert into _tap_results select is(
  (select total_latency_ms is null from public.ai_response_metrics
    where id = '40000000-0000-0000-0000-00000000000a'),
  true,
  'positive control: org_a session CAN read its own metrics row, so the select grant and policy actually work'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
