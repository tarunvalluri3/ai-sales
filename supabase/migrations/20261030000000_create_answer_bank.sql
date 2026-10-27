-- Instant answers ("answer bank", STATE.md 2026-10-28): answers served without
-- a model call -- stored answers for the owner's suggested questions and the
-- catalog question, FAQ-question embeddings for the high-similarity FAQ match,
-- and a normalized-repeat query-embedding cache.
--
-- STALENESS MODEL. `businesses.answer_bank_version` is a counter bumped by
-- triggers whenever anything an answer could be derived from changes
-- (products, services, FAQs, knowledge documents, the profile fields below).
-- A stored answer records the version it was generated against and is served
-- ONLY while `content_version = businesses.answer_bank_version`, checked in
-- SQL inside get_instant_answer(). So an edited price makes the stored answer
-- unservable in the same transaction as the edit -- there is no window in
-- which a stale answer can be read, and no application cache to expire.
-- Each bump also (re)queues one regeneration job per business.
--
-- Rows are created and deleted only by the service role (the background
-- regeneration job). The dashboard owner may READ their own entries and
-- UPDATE the answer/approval columns of their own rows (RLS, Clerk session).
-- The chat route reads through get_instant_answer(), service role only.
--
-- ROLLBACK (manual, in this order):
--   drop trigger answer_bank_bump on public.products, services, faqs, knowledge_documents (one per table);
--   drop trigger answer_bank_businesses_bump on public.businesses;
--   drop function public.get_instant_answer, public.match_faq_questions,
--     public.bump_answer_bank_version, public.answer_bank_child_bump,
--     public.answer_bank_businesses_bump;
--   drop table public.answer_bank_entries, public.answer_bank_jobs,
--     public.faq_question_embeddings, public.query_embedding_cache;
--   alter table public.messages drop column answer_source;
--   alter table public.businesses drop column answer_bank_version;

-- ---------------------------------------------------------------------------
-- 1. Content version on the business
-- ---------------------------------------------------------------------------

alter table public.businesses
  add column answer_bank_version bigint not null default 0;

-- ---------------------------------------------------------------------------
-- 2. Which reply source produced an assistant message
-- ---------------------------------------------------------------------------

-- NULL = a reply written before this column existed, or by a caller that does
-- not record it. 'ai' = the normal model pipeline (including its own
-- first-turn response cache and duplicate-submit replay).
alter table public.messages
  add column answer_source text
    check (answer_source in ('greeting', 'suggested', 'faq', 'catalog', 'ai'));

-- ---------------------------------------------------------------------------
-- 3. Stored answers
-- ---------------------------------------------------------------------------

create table public.answer_bank_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('suggested', 'catalog')),
  -- Normalized form of the question (lib/answer-bank/normalize.ts). The only
  -- thing a visitor's message is ever compared against: exact equality.
  question_key text not null,
  question_text text not null,
  language text not null check (language ~ '^[a-z]{2}$'),
  answer text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  -- 'generated' by the pipeline, 'approved' by the owner as-is, 'edited' by the
  -- owner. An edited answer is never overwritten by a regeneration.
  owner_state text not null default 'generated' check (owner_state in ('generated', 'approved', 'edited')),
  content_version bigint not null default -1,
  failure_reason text,
  source_chunk_ids uuid[] not null default '{}',
  generated_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, kind, question_key, language),
  check (status <> 'ready' or answer is not null)
);

create index answer_bank_entries_business_id_idx on public.answer_bank_entries (business_id);

create trigger answer_bank_entries_set_updated_at
  before update on public.answer_bank_entries
  for each row
  execute function public.set_updated_at();

alter table public.answer_bank_entries enable row level security;
alter table public.answer_bank_entries force row level security;

grant select on public.answer_bank_entries to authenticated;
-- The owner may edit/approve their own stored answers from the dashboard
-- (Clerk session, RLS-scoped). Column-limited: nothing that identifies the
-- row or its question can be changed, and there is no insert/delete grant --
-- rows are created and removed only by the service-role regeneration job.
grant update (answer, owner_state, status, content_version, approved_at, failure_reason)
  on public.answer_bank_entries to authenticated;

create policy "answer_bank_entries_select_own_business" on public.answer_bank_entries
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "answer_bank_entries_update_own_business" on public.answer_bank_entries
  for update
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  )
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Regeneration queue (one row per business)
-- ---------------------------------------------------------------------------

create table public.answer_bank_jobs (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  requested_at timestamptz not null default now(),
  locked_at timestamptz,
  attempts int not null default 0
);

alter table public.answer_bank_jobs enable row level security;
alter table public.answer_bank_jobs force row level security;
-- No grants, no policies: service role only.

-- ---------------------------------------------------------------------------
-- 5. Version bump + job enqueue
-- ---------------------------------------------------------------------------

create or replace function public.bump_answer_bank_version(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.businesses
    set answer_bank_version = answer_bank_version + 1
    where id = p_business_id;

  -- insert ... select, not values: when the business itself is being deleted
  -- (cascade), the parent row is already gone and a plain insert would violate
  -- the foreign key and break the delete.
  insert into public.answer_bank_jobs (business_id)
  select id from public.businesses where id = p_business_id
  on conflict (business_id) do update
    set requested_at = now(), attempts = 0;
end;
$$;

revoke execute on function public.bump_answer_bank_version(uuid) from public, anon, authenticated;
grant execute on function public.bump_answer_bank_version(uuid) to service_role;

create or replace function public.answer_bank_child_bump()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bump_answer_bank_version(coalesce(new.business_id, old.business_id));
  return null;
end;
$$;

revoke execute on function public.answer_bank_child_bump() from public, anon, authenticated;

create trigger answer_bank_bump
  after insert or update or delete on public.products
  for each row execute function public.answer_bank_child_bump();
create trigger answer_bank_bump
  after insert or update or delete on public.services
  for each row execute function public.answer_bank_child_bump();
create trigger answer_bank_bump
  after insert or update or delete on public.faqs
  for each row execute function public.answer_bank_child_bump();
create trigger answer_bank_bump
  after insert or update or delete on public.knowledge_documents
  for each row execute function public.answer_bank_child_bump();

-- The business row itself: only the columns an answer can depend on. A BEFORE
-- trigger so the version moves in the same row write (no recursion, no second
-- update). Excludes answer_bank_version itself and unrelated columns.
create or replace function public.answer_bank_businesses_bump()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.name, new.description, new.contact_email, new.contact_phone, new.website,
      new.widget_language, new.widget_suggested_questions, new.published_at,
      new.ai_conversion_goal)
     is distinct from
     (old.name, old.description, old.contact_email, old.contact_phone, old.website,
      old.widget_language, old.widget_suggested_questions, old.published_at,
      old.ai_conversion_goal)
  then
    new.answer_bank_version := old.answer_bank_version + 1;
    insert into public.answer_bank_jobs (business_id)
    values (new.id)
    on conflict (business_id) do update
      set requested_at = now(), attempts = 0;
  end if;
  return new;
end;
$$;

revoke execute on function public.answer_bank_businesses_bump() from public, anon, authenticated;

create trigger answer_bank_businesses_bump
  before update on public.businesses
  for each row execute function public.answer_bank_businesses_bump();

-- ---------------------------------------------------------------------------
-- 6. The serve-time lookup: fresh, published, exact
-- ---------------------------------------------------------------------------

create or replace function public.get_instant_answer(
  p_business_id uuid,
  p_kind text,
  p_question_key text,
  p_language text
)
returns table (id uuid, answer text, owner_state text, source_chunk_ids uuid[])
language sql
stable
security invoker
set search_path = public
as $$
  select e.id, e.answer, e.owner_state, e.source_chunk_ids
  from public.answer_bank_entries e
  join public.businesses b on b.id = e.business_id
  where e.business_id = p_business_id
    and b.id = p_business_id
    and e.kind = p_kind
    and e.question_key = p_question_key
    and e.language = p_language
    and e.status = 'ready'
    and e.answer is not null
    and e.content_version = b.answer_bank_version
    and b.published_at is not null;
$$;

revoke execute on function public.get_instant_answer(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.get_instant_answer(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. FAQ question embeddings and the tenant-scoped match
-- ---------------------------------------------------------------------------

create table public.faq_question_embeddings (
  faq_id uuid primary key references public.faqs (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- The exact question text that was embedded. match_faq_questions() joins on
  -- equality with the live faqs.question, so an edited question can never be
  -- matched through its old embedding.
  question_text text not null,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now()
);

create index faq_question_embeddings_business_id_idx on public.faq_question_embeddings (business_id);

alter table public.faq_question_embeddings enable row level security;
alter table public.faq_question_embeddings force row level security;
-- No grants, no policies: service role only.

create or replace function public.match_faq_questions(
  p_business_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 2
)
returns table (faq_id uuid, question text, answer text, similarity float)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    f.id,
    f.question,
    f.answer,
    1 - (e.embedding <=> p_query_embedding) as similarity
  from public.faq_question_embeddings e
  join public.faqs f on f.id = e.faq_id and f.business_id = e.business_id
  join public.businesses b on b.id = e.business_id
  where e.business_id = p_business_id
    and f.business_id = p_business_id
    and f.status = 'approved'
    and f.question = e.question_text
    and b.published_at is not null
  order by e.embedding <=> p_query_embedding
  limit p_match_count;
$$;

revoke execute on function public.match_faq_questions(uuid, extensions.vector, int) from public, anon, authenticated;
grant execute on function public.match_faq_questions(uuid, extensions.vector, int) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Normalized-repeat query embedding cache
-- ---------------------------------------------------------------------------

create table public.query_embedding_cache (
  business_id uuid not null references public.businesses (id) on delete cascade,
  question_hash text not null,
  embedding extensions.vector(1536) not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (business_id, question_hash)
);

alter table public.query_embedding_cache enable row level security;
alter table public.query_embedding_cache force row level security;
-- No grants, no policies: service role only.

create index query_embedding_cache_expires_at_idx on public.query_embedding_cache (expires_at);

-- ---------------------------------------------------------------------------
-- 9. First generation for businesses that are already published
-- ---------------------------------------------------------------------------

-- Queues one job per already-published business so their stored answers are
-- built by the next background run (the daily cron, a dashboard visit or a
-- stale-answer miss). Writes only to the new queue table; no business row,
-- version or answer changes here.
insert into public.answer_bank_jobs (business_id)
select id from public.businesses where published_at is not null
on conflict (business_id) do nothing;
