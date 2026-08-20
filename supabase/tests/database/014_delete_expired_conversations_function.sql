-- Functional test for public.delete_expired_conversations() (Phase 22d,
-- AGENTS.md §7 / docs/data-retention.md). Not a tenant-isolation test --
-- this function is a deliberately global, security-definer sweep run by
-- pg_cron, not a per-business RLS-gated read/write -- so this checks the
-- retention math and cascade behavior instead, run as postgres (this
-- script's default connection role, same as every other file's fixture
-- setup).
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.

begin;
select plan(3);
create temporary table _tap_results (line text);

insert into public.businesses (id, clerk_org_id, name)
values ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A');

-- Conversation A: last message 25 months ago -- expired.
insert into public.conversations (id, business_id, created_at)
values ('40000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', now() - interval '30 months');
insert into public.messages (business_id, conversation_id, role, content, created_at)
values ('00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'user', 'hello', now() - interval '25 months');
insert into public.leads (business_id, conversation_id, contact_email, qualification, qualification_reason, status)
values ('00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a', 'prospect@example.com', 'warm', 'test fixture', 'new');

-- Conversation B: last message 1 month ago -- within the retention window.
insert into public.conversations (id, business_id, created_at)
values ('40000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', now() - interval '3 months');
insert into public.messages (business_id, conversation_id, role, content, created_at)
values ('00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000b', 'user', 'hello', now() - interval '1 months');

select public.delete_expired_conversations();

insert into _tap_results select ok(
  not exists (select 1 from public.conversations where id = '40000000-0000-0000-0000-00000000000a'),
  'a conversation whose last message is 25 months old is deleted'
);

insert into _tap_results select ok(
  not exists (select 1 from public.leads where conversation_id = '40000000-0000-0000-0000-00000000000a'),
  'its lead row is cascade-deleted along with it -- no residual row'
);

insert into _tap_results select ok(
  exists (select 1 from public.conversations where id = '40000000-0000-0000-0000-00000000000b'),
  'a conversation whose last message is 1 month old is untouched'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
