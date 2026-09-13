-- Tenant-isolation test for public.lead_score_history (Phase 28).
-- Read-only from the dashboard -- `authenticated` gets SELECT only, no
-- INSERT/UPDATE/DELETE grant at all (only the service-role scoring path
-- via lib/lead-score-history.ts writes it, alongside every scoreLead()
-- call in lib/leads.ts's upsertLeadForConversation).

begin;
select plan(3);
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

insert into public.leads (id, business_id, conversation_id, contact_email, qualification, qualification_reason, score)
values
  ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'a@example.com', 'warm', 'test', 2),
  ('30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'b@example.com', 'warm', 'test', 2);

insert into public.lead_score_history (id, business_id, lead_id, score, qualification, reasons)
values
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 2, 'warm', '[]'::jsonb),
  ('a0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000b', 2, 'warm', '[]'::jsonb);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select results_eq(
  $$ select id from public.lead_score_history order by id $$,
  $$ values ('a0000000-0000-0000-0000-00000000000a'::uuid) $$,
  'org_a session sees only its own business''s score-history row, never org_b''s'
);

insert into _tap_results select throws_ok(
  $$ insert into public.lead_score_history (business_id, lead_id, score, qualification, reasons)
     values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 9, 'hot', '[]'::jsonb) $$,
  '42501',
  null,
  'org_a session cannot insert a score-history row -- read-only, service-role-write-only'
);

insert into _tap_results select throws_ok(
  $$ delete from public.lead_score_history where id = 'a0000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'org_a session cannot delete its own score-history row either -- no grant at all beyond select'
);

reset role;

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
