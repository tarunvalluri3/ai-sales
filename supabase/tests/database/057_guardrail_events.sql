-- Shape, constraints and tenant isolation for public.guardrail_events
-- (guardrails Phase 1, migration 20261031000000): the persisted record behind
-- the `guardrail_signal` log event.
--
-- Shape: no column that could hold message text (the table is metadata only
-- by design -- masked card/OTP numbers must not be re-created in a log of
-- attack payloads). Constraints: action and mode are closed sets. Isolation:
-- a signed-in member of org A can read A's events and not B's; no
-- authenticated write grant exists (rows come from the service role only).
-- Includes a positive control, so the isolation assertion cannot pass merely
-- because nobody can read the table. Same session-simulation technique as
-- 053_messages_interrupted_at.sql.
--
-- Run against the live, linked project via `npm test`.

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
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'test'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'test');

insert into public.guardrail_events (id, business_id, conversation_id, channel, signal, rule, action, mode)
values
  ('60000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'chat_widget', 'instruction_override', 'override.en.ignore_instructions', 'logged', 'log_only'),
  ('60000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'whatsapp', 'sensitive_data', 'card', 'masked', 'enforce');

insert into _tap_results select is(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'guardrail_events'
      and column_name in ('message', 'content', 'text', 'body', 'payload')),
  0::bigint,
  'guardrail_events has no column that could hold message text (metadata only)'
);

insert into _tap_results select throws_ok(
  $$insert into public.guardrail_events (business_id, channel, signal, rule, action, mode)
    values ('00000000-0000-0000-0000-00000000000a', 'chat_widget', 'x', 'y', 'deleted_everything', 'log_only')$$,
  '23514',
  null,
  'action outside the closed set is rejected by the check constraint'
);

insert into _tap_results select throws_ok(
  $$insert into public.guardrail_events (business_id, channel, signal, rule, action, mode)
    values ('00000000-0000-0000-0000-00000000000a', 'chat_widget', 'x', 'y', 'logged', 'maybe')$$,
  '23514',
  null,
  'mode outside the closed set is rejected by the check constraint'
);

insert into _tap_results select is(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.guardrail_events'::regclass),
  true,
  'row level security is enabled and forced'
);

insert into _tap_results select ok(
  not has_table_privilege('authenticated', 'public.guardrail_events', 'INSERT')
    and not has_table_privilege('authenticated', 'public.guardrail_events', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.guardrail_events', 'DELETE'),
  'authenticated has no write grant (rows come from the service role only)'
);

insert into _tap_results select ok(
  not has_table_privilege('anon', 'public.guardrail_events', 'SELECT'),
  'anon cannot read guardrail_events'
);

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
  (select count(*) from public.guardrail_events where id = '60000000-0000-0000-0000-00000000000b'),
  0::bigint,
  'org_a session cannot read org_b''s guardrail event (cross-tenant read denied)'
);

insert into _tap_results select is(
  (select count(*) from public.guardrail_events where id = '60000000-0000-0000-0000-00000000000a'),
  1::bigint,
  'positive control: org_a session CAN read its own guardrail event'
);

insert into _tap_results select is(
  (select count(*) from public.guardrail_events),
  1::bigint,
  'org_a sees exactly its own rows and nobody else''s'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
