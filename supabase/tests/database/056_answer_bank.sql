-- Instant answers (migration 20261030000000): the staleness model and the
-- tenant boundaries.
--
-- What must hold:
--   1. An answer is served only while its content_version equals the
--      business's answer_bank_version, and only for a published business --
--      so a price edit makes it unservable in the same transaction.
--   2. Every change an answer could be derived from bumps the version and
--      queues a job; an unrelated business update does not.
--   3. Tenant isolation: one business never reads another's entries, and the
--      FAQ matcher never returns another business's FAQ.
--   4. An edited FAQ question can never be matched through its old embedding.
--   5. The service-only tables/functions are closed to authenticated users.
--   6. Deleting a business with FAQs/products still works (the triggers must
--      not break the cascade).
--
-- Run against the live, linked project via `npm test`.

begin;
select plan(20);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;
create temporary table _upd (own bigint, other bigint);
grant insert, select on _upd to authenticated;

insert into public.businesses (id, clerk_org_id, name, published_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 'org_ab_a', 'AB Business A', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'org_ab_b', 'AB Business B', now());
insert into public.businesses (id, clerk_org_id, name)
values ('00000000-0000-0000-0000-0000000000c1', 'org_ab_c', 'AB Unpublished C');

-- Entries are written at each business's current version.
insert into public.answer_bank_entries
  (business_id, kind, question_key, question_text, language, answer, status, content_version)
select id, 'suggested', 'how much is it', 'How much is it?', 'en', 'It costs 499.', 'ready', answer_bank_version
from public.businesses
where id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1');

-- 1. Fresh + published -> served; scoped to the asking business.
insert into _tap_results select is(
  (select answer from public.get_instant_answer('00000000-0000-0000-0000-0000000000a1', 'suggested', 'how much is it', 'en')),
  'It costs 499.',
  'a fresh answer for a published business is served (positive control)'
);

insert into _tap_results select is(
  (select count(*) from public.get_instant_answer('00000000-0000-0000-0000-0000000000c1', 'suggested', 'how much is it', 'en')),
  0::bigint,
  'an unpublished business is never served an instant answer'
);

insert into _tap_results select is(
  (select count(*) from public.get_instant_answer('00000000-0000-0000-0000-0000000000a1', 'suggested', 'how much is it', 'es')),
  0::bigint,
  'a different language never gets another language''s answer'
);

-- 2. A price edit invalidates the stored answer immediately.
insert into public.products (id, business_id, name, price)
values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Widget', 499);

insert into _tap_results select is(
  (select count(*) from public.get_instant_answer('00000000-0000-0000-0000-0000000000a1', 'suggested', 'how much is it', 'en')),
  0::bigint,
  'adding a product makes the stored answer unservable at once (version moved)'
);

-- Re-stamp at the new version, then edit the price.
update public.answer_bank_entries
  set content_version = (select answer_bank_version from public.businesses where id = '00000000-0000-0000-0000-0000000000a1')
  where business_id = '00000000-0000-0000-0000-0000000000a1';

insert into _tap_results select is(
  (select count(*) from public.get_instant_answer('00000000-0000-0000-0000-0000000000a1', 'suggested', 'how much is it', 'en')),
  1::bigint,
  'after re-stamping at the current version the answer is served again'
);

update public.products set price = 599 where id = '00000000-0000-0000-0000-0000000000a2';

insert into _tap_results select is(
  (select count(*) from public.get_instant_answer('00000000-0000-0000-0000-0000000000a1', 'suggested', 'how much is it', 'en')),
  0::bigint,
  'a price edit invalidates the stored answer immediately'
);

insert into _tap_results select is(
  (select count(*) from public.answer_bank_jobs where business_id = '00000000-0000-0000-0000-0000000000a1'),
  1::bigint,
  'the change queued exactly one regeneration job for that business'
);

insert into _tap_results select is(
  (select count(*) from public.answer_bank_jobs where business_id = '00000000-0000-0000-0000-0000000000b1'),
  0::bigint,
  'the other business has no job -- a change never bumps another tenant'
);

-- Profile edit bumps; an unrelated column does not.
do $$
declare v_before bigint; v_after bigint;
begin
  select answer_bank_version into v_before from public.businesses where id = '00000000-0000-0000-0000-0000000000b1';
  update public.businesses set description = 'new description' where id = '00000000-0000-0000-0000-0000000000b1';
  select answer_bank_version into v_after from public.businesses where id = '00000000-0000-0000-0000-0000000000b1';
  create temporary table _v (before_v bigint, after_v bigint) on commit drop;
  insert into _v values (v_before, v_after);
end $$;

insert into _tap_results select is(
  (select after_v - before_v from _v),
  1::bigint,
  'a profile edit (description) bumps the version by one'
);

do $$
declare v_before bigint; v_after bigint;
begin
  select answer_bank_version into v_before from public.businesses where id = '00000000-0000-0000-0000-0000000000b1';
  update public.businesses set timezone = timezone where id = '00000000-0000-0000-0000-0000000000b1';
  select answer_bank_version into v_after from public.businesses where id = '00000000-0000-0000-0000-0000000000b1';
  create temporary table _v2 (before_v bigint, after_v bigint) on commit drop;
  insert into _v2 values (v_before, v_after);
end $$;

insert into _tap_results select is(
  (select after_v - before_v from _v2),
  0::bigint,
  'an update that changes no answer-relevant column does not bump the version'
);

-- 3 & 4. FAQ matcher: tenant-scoped, and an edited question loses its embedding.
insert into public.faqs (id, business_id, question, answer)
values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'What are your hours?', 'Nine to five.'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b1', 'What are your hours?', 'Always open.');

insert into public.faq_question_embeddings (faq_id, business_id, question_text, embedding)
select f.id, f.business_id, f.question, ('[' || array_to_string(array_fill(0.1::float, array[1536]), ',') || ']')::extensions.vector(1536)
from public.faqs f
where f.id in ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000b3');

insert into _tap_results select is(
  (select answer from public.match_faq_questions(
     '00000000-0000-0000-0000-0000000000a1',
     ('[' || array_to_string(array_fill(0.1::float, array[1536]), ',') || ']')::extensions.vector(1536), 2)),
  'Nine to five.',
  'the FAQ matcher returns the asking business''s own FAQ'
);

insert into _tap_results select is(
  (select count(*) from public.match_faq_questions(
     '00000000-0000-0000-0000-0000000000a1',
     ('[' || array_to_string(array_fill(0.1::float, array[1536]), ',') || ']')::extensions.vector(1536), 5)
   where faq_id = '00000000-0000-0000-0000-0000000000b3'),
  0::bigint,
  'the FAQ matcher never returns another business''s FAQ'
);

update public.faqs set question = 'What time do you open?' where id = '00000000-0000-0000-0000-0000000000a3';

insert into _tap_results select is(
  (select count(*) from public.match_faq_questions(
     '00000000-0000-0000-0000-0000000000a1',
     ('[' || array_to_string(array_fill(0.1::float, array[1536]), ',') || ']')::extensions.vector(1536), 5)),
  0::bigint,
  'an edited FAQ question is not matchable through its old embedding'
);

-- 5. Zero-grant posture for authenticated.
insert into _tap_results select ok(
  has_function_privilege('service_role', 'public.get_instant_answer(uuid,text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_instant_answer(uuid,text,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.get_instant_answer(uuid,text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.match_faq_questions(uuid,extensions.vector,int)', 'execute')
  and not has_function_privilege('authenticated', 'public.bump_answer_bank_version(uuid)', 'execute'),
  'only the service role may execute the answer-bank functions'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_ab_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_ab_a'))::text,
  true
);

insert into _tap_results select is(
  (select count(*) from public.answer_bank_entries where business_id = '00000000-0000-0000-0000-0000000000b1'),
  0::bigint,
  'org_a cannot read business B''s stored answers (RLS)'
);

do $$
declare v_own bigint; v_other bigint;
begin
  update public.answer_bank_entries set answer = 'Owner edit', owner_state = 'edited'
    where business_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics v_own = row_count;
  update public.answer_bank_entries set answer = 'Hijack'
    where business_id = '00000000-0000-0000-0000-0000000000b1';
  get diagnostics v_other = row_count;
  insert into _upd values (v_own, v_other);
end $$;

insert into _tap_results select is(
  (select own from _upd),
  1::bigint,
  'org_a can edit its own stored answer (column-limited update grant)'
);

insert into _tap_results select is(
  (select other from _upd),
  0::bigint,
  'org_a cannot edit business B''s stored answer (RLS)'
);

insert into _tap_results select throws_ok(
  $$ update public.answer_bank_entries set question_key = 'changed'
     where business_id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501',
  null,
  'the question itself is not editable -- only the answer/approval columns are granted'
);

insert into _tap_results select throws_ok(
  $$ insert into public.answer_bank_entries (business_id, kind, question_key, question_text, language)
     values ('00000000-0000-0000-0000-0000000000a1', 'suggested', 'x', 'x', 'en') $$,
  '42501',
  null,
  'an authenticated session cannot write stored answers -- service role only'
);

reset role;

-- 6. The cascade still works with the triggers in place.
delete from public.businesses where id = '00000000-0000-0000-0000-0000000000a1';

insert into _tap_results select is(
  (select count(*) from public.businesses where id = '00000000-0000-0000-0000-0000000000a1'),
  0::bigint,
  'deleting a business that has products and FAQs still succeeds'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
