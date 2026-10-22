-- Shape and tenant isolation for messages.interrupted_at (feat/chat-streaming,
-- migration 20261028000000): the marker that an assistant reply was streamed
-- but cut off before completion.
--
-- Shape first: nullable, no backfill, so a row written before this existed
-- (and every complete reply) reads as null -- "this was a normal reply",
-- never a value nobody set. Then isolation, because this column rides the
-- messages table, whose per-tenant RLS must be exactly as strict after the
-- migration as before: a business must not see another business's message
-- rows, interrupted or not.
--
-- Includes a positive control (assertion 6): an isolation test that only
-- proves denial would also pass against a table nobody can read, hiding a
-- broken grant. Same session-simulation technique as
-- 001_businesses_tenant_isolation.sql.
--
-- Run against the live, linked project via `npm test`.

begin;
select plan(6);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

-- Fixture setup as postgres (bypasses RLS -- seeding, not the thing tested).
insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

insert into public.conversations (id, business_id, source)
values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'test'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'test');

-- Message A: a normal complete reply, inserted WITHOUT naming interrupted_at
-- (exactly what every row before this migration, and every complete reply
-- now, looks like).
insert into public.messages (id, business_id, conversation_id, role, content)
values
  ('50000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'assistant', 'A complete reply.');

-- Message B: a streamed reply that was cut off -- interrupted_at set.
insert into public.messages (id, business_id, conversation_id, role, content, interrupted_at)
values
  ('50000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'assistant', 'A partial re', now());

insert into _tap_results select is(
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'interrupted_at'),
  'timestamp with time zone',
  'messages.interrupted_at exists and is timestamptz'
);

insert into _tap_results select is(
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'interrupted_at'),
  'YES',
  'messages.interrupted_at is nullable (null = a normal, complete reply; no backfill)'
);

insert into _tap_results select ok(
  (select interrupted_at is null from public.messages where id = '50000000-0000-0000-0000-00000000000a'),
  'a reply inserted without interrupted_at reads back null (a complete reply is never marked interrupted)'
);

insert into _tap_results select ok(
  (select interrupted_at is not null from public.messages where id = '50000000-0000-0000-0000-00000000000b'),
  'an interrupted streamed reply carries a non-null interrupted_at'
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
  (select count(*) from public.messages where id = '50000000-0000-0000-0000-00000000000b'),
  0::bigint,
  'org_a session cannot read org_b''s message row (messages_select_own_business still enforced after the migration)'
);

insert into _tap_results select is(
  (select interrupted_at is null from public.messages where id = '50000000-0000-0000-0000-00000000000a'),
  true,
  'positive control: org_a session CAN read its own message row, so the grant and policy still work'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
