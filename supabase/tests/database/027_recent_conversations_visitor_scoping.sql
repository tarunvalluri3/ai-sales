-- Query-correctness test for conversations.visitor_id scoping, used by
-- app/api/chat/recent/route.ts via lib/conversations.ts's
-- listRecentConversationsForVisitor() (Phase 25d "recent chats") --
-- never independently pgTAP-verified until now (STATE.md backlog item
-- 8).
--
-- Unlike every other file in this directory, this is NOT an RLS test:
-- /api/chat/recent is a public, unauthenticated widget endpoint that
-- queries via the service-role client, which bypasses RLS entirely (see
-- that route's own doc comment) -- there is no `authenticated`-role
-- policy to exercise here. What actually protects one visitor's chat
-- history from another is the query's own WHERE clause (business_id AND
-- visitor_id together, never visitor_id alone -- a client-generated
-- visitor_id is not a cross-business identity, so the same string could
-- collide across two unrelated businesses). This file runs that exact
-- query shape directly, as the unrestricted connecting role (mirroring
-- the service role's own RLS-bypassing execution), to guard against a
-- future accidental regression (e.g. someone dropping the visitor_id
-- filter) that no RLS layer would catch.
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.

begin;
select plan(3);
create temporary table _tap_results (line text);

insert into public.businesses (id, clerk_org_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
  ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

-- visitor_1 exists under both businesses -- a client-generated id, not a
-- cross-business identity, so this collision is expected and must stay
-- scoped per-business.
insert into public.conversations (id, business_id, source, visitor_id)
values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'chat_widget', 'visitor_1'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'chat_widget', 'visitor_2'),
  ('20000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000b', 'chat_widget', 'visitor_1');

insert into _tap_results select results_eq(
  $$ select id from public.conversations
     where business_id = '00000000-0000-0000-0000-00000000000a' and visitor_id = 'visitor_1'
     order by created_at desc $$,
  $$ values ('20000000-0000-0000-0000-00000000000a'::uuid) $$,
  'the visitor-scoped query returns only that visitor''s own conversation for that business'
);

insert into _tap_results select results_eq(
  $$ select id from public.conversations
     where business_id = '00000000-0000-0000-0000-00000000000b' and visitor_id = 'visitor_1'
     order by created_at desc $$,
  $$ values ('20000000-0000-0000-0000-00000000000c'::uuid) $$,
  'the same visitor_id string under a different business returns only that business''s own conversation, never business a''s'
);

insert into _tap_results select is(
  (select count(*) from public.conversations
     where business_id = '00000000-0000-0000-0000-00000000000a' and visitor_id = 'nonexistent_visitor'),
  0::bigint,
  'a visitor_id with no matching conversations returns zero rows, never another visitor''s'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
