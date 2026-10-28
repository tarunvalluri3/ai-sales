-- Draft -> Publish -> Live (2026-10-29).
--
-- MODEL. The editing tables (businesses, products, services, faqs,
-- knowledge_documents/knowledge_chunks) stay exactly as they are and act as
-- the DRAFT. Publishing freezes the draft into an immutable `agent_versions`
-- row (a jsonb snapshot) and points `businesses.live_version_id` at it. The
-- live runtime (widget, WhatsApp, Instagram) reads ONLY that snapshot plus
-- `live_knowledge_chunks`, never the draft tables. "Agent" == business: there
-- is no separate agents table, so `agent_versions.business_id` is the agent id.
--
-- WHY A LIVE COPY OF THE CHUNKS (the one unavoidable duplication). Draft
-- chunks cannot be pinned by id: editing a document deletes and re-inserts its
-- chunks (lib/knowledge.ts regenerateChunksForDocument) and deleting a
-- document/FAQ/product cascades them away, so a "live chunk id list" would go
-- stale the moment the draft changes. Publish therefore COPIES the already-
-- computed chunk rows (embeddings included -- a pure SQL insert-select, no
-- Gemini call) into `live_knowledge_chunks`, keyed by version. Only the
-- current and the previous version's rows are kept.
--
-- ATOMICITY / IDEMPOTENCY. `agent_publish_internal()` does everything in one
-- transaction under a row lock on the business: snapshot, hash, version
-- insert, chunk copy, live pointer flip, response-cache purge. Publishing a
-- draft whose hash equals the live version's is a no-op that returns the
-- existing version (changed = false).
--
-- RLS: same posture as the other tenant tables -- org members may SELECT their
-- own rows; nobody but the SECURITY DEFINER functions below can write.
--
-- ROLLBACK (manual, in this order):
--   drop function public.publish_agent(uuid),
--     public.agent_publish_status(uuid), public.agent_publish_internal(uuid, text, boolean),
--     public.build_agent_snapshot(uuid), public.match_live_knowledge_chunks(uuid, uuid, extensions.vector, int, text[]);
--   restore public.get_instant_answer() from 20261030000000 (compare to b.answer_bank_version);
--   alter table public.businesses drop column live_version_id, drop column live_answer_bank_version;
--   drop table public.live_knowledge_chunks, public.agent_versions;

-- ---------------------------------------------------------------------------
-- 1. Versions
-- ---------------------------------------------------------------------------

create table public.agent_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  version int not null,
  content_hash text not null,
  snapshot jsonb not null,
  published_at timestamptz not null default now(),
  published_by text not null,
  unique (business_id, version)
);

create index agent_versions_business_id_idx on public.agent_versions (business_id, version desc);

alter table public.agent_versions enable row level security;
alter table public.agent_versions force row level security;

grant select on public.agent_versions to authenticated;

create policy "agent_versions_select_own_business" on public.agent_versions
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

-- No column-level UPDATE grant on either column: only the functions below
-- (and the service role) move the live pointer.
alter table public.businesses
  add column live_version_id uuid references public.agent_versions (id) on delete set null,
  -- The businesses.answer_bank_version this live version was published at.
  -- Stored (instant) answers are servable only at this version, so an answer
  -- regenerated from later DRAFT edits is never shown to prospects.
  add column live_answer_bank_version bigint;

-- ---------------------------------------------------------------------------
-- 2. Live chunk copy
-- ---------------------------------------------------------------------------

create table public.live_knowledge_chunks (
  -- Same id as the draft chunk it was copied from, so a message's
  -- source_chunk_ids still resolve for as long as the draft chunk is unchanged.
  id uuid not null,
  version_id uuid not null references public.agent_versions (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- No FK: the draft document may be deleted while this version is live.
  document_id uuid not null,
  source_type text not null,
  source_id uuid,
  chunk_index int not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  primary key (version_id, id)
);

create index live_knowledge_chunks_business_version_idx
  on public.live_knowledge_chunks (business_id, version_id);

alter table public.live_knowledge_chunks enable row level security;
alter table public.live_knowledge_chunks force row level security;

-- Read-only for the owner (citation lookups in the dashboard).
grant select on public.live_knowledge_chunks to authenticated;

create policy "live_knowledge_chunks_select_own_business" on public.live_knowledge_chunks
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

-- Tenant- AND version-scoped similarity search over the live copy. Service
-- role only: the live runtime is the only caller. Cosine distance, same as
-- match_knowledge_chunks (stored vectors are L2-normalized).
create or replace function public.match_live_knowledge_chunks(
  p_business_id uuid,
  p_version_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 5,
  p_source_types text[] default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float,
  source_type text,
  source_id uuid
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id,
    c.document_id,
    c.content,
    1 - (c.embedding <=> p_query_embedding) as similarity,
    c.source_type,
    c.source_id
  from public.live_knowledge_chunks c
  where c.business_id = p_business_id
    and c.version_id = p_version_id
    and (p_source_types is null or c.source_type = any (p_source_types))
  order by c.embedding <=> p_query_embedding
  limit p_match_count;
$$;

revoke execute on function public.match_live_knowledge_chunks(uuid, uuid, extensions.vector, int, text[])
  from public, anon, authenticated;
grant execute on function public.match_live_knowledge_chunks(uuid, uuid, extensions.vector, int, text[])
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Snapshot builder
-- ---------------------------------------------------------------------------

-- The draft, as a jsonb document. SECURITY INVOKER: called by the dashboard
-- under the owner's RLS, and by the publish function (definer) under its
-- owner. Only APPROVED catalog rows and PUBLISHED manual documents are
-- included -- pending-review extractions and draft documents are not part of
-- the agent. `updated_at` is deliberately excluded so a no-op save never
-- reads as a change. Key order inside jsonb is canonical, so md5(snapshot::text)
-- is a stable fingerprint.
create or replace function public.build_agent_snapshot(p_business_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'schema', 1,
    'config', jsonb_build_object(
      'name', b.name,
      'description', b.description,
      'contactEmail', b.contact_email,
      'contactPhone', b.contact_phone,
      'website', b.website,
      'language', b.widget_language,
      'persona', jsonb_build_object(
        'welcomeText', b.widget_welcome_text,
        'welcomeTextClosed', b.widget_welcome_text_closed,
        'ctaText', b.widget_cta_text,
        'suggestedQuestions', coalesce(b.widget_suggested_questions, '[]'::jsonb)
      ),
      'channels', jsonb_build_object(
        'accentColor', b.widget_accent_color,
        'logoUrl', b.widget_logo_url,
        'position', b.widget_position,
        'privacyPolicyUrl', b.privacy_policy_url
      ),
      -- Which tools the AI is given. The appointment slot length, business
      -- hours and timezone are operational scheduling settings that govern
      -- real bookings, not agent content, so they are NOT versioned: they
      -- apply immediately (lib/appointments.ts reads them from businesses).
      'capabilities', jsonb_build_object(
        'recommendProducts', b.recommend_products_enabled,
        'appointments', b.appointments_enabled
      )
    ),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'description', p.description, 'price', p.price,
        'priceAmount', p.price_amount, 'category', p.category, 'imageUrl', p.image_url,
        'createdAt', p.created_at
      ) order by p.created_at, p.id)
      from public.products p
      where p.business_id = b.id and p.status = 'approved'
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description, 'price', s.price,
        'priceAmount', s.price_amount, 'category', s.category, 'imageUrl', s.image_url,
        'createdAt', s.created_at
      ) order by s.created_at, s.id)
      from public.services s
      where s.business_id = b.id and s.status = 'approved'
    ), '[]'::jsonb),
    'faqs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'question', f.question, 'answer', f.answer, 'createdAt', f.created_at
      ) order by f.created_at, f.id)
      from public.faqs f
      where f.business_id = b.id and f.status = 'approved'
    ), '[]'::jsonb),
    -- References, not content: the chunks themselves are copied at publish.
    -- The hash covers title + content so an edit to a published document
    -- counts as a change.
    'knowledge', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'title', d.title, 'sourceType', d.source_type,
        'contentHash', md5(d.title || chr(10) || d.content)
      ) order by d.created_at, d.id)
      from public.knowledge_documents d
      where d.business_id = b.id
        and d.source_type in ('manual', 'file', 'url')
        and d.status = 'published'
    ), '[]'::jsonb)
  )
  from public.businesses b
  where b.id = p_business_id;
$$;

revoke execute on function public.build_agent_snapshot(uuid) from public, anon;
grant execute on function public.build_agent_snapshot(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Publish (atomic, idempotent)
-- ---------------------------------------------------------------------------

-- No authorization of its own -- callable only by the postgres owner (this
-- migration's backfill) and, through publish_agent() below, by an
-- authenticated org member. p_is_backfill is true only for the v1 backfill:
-- it must never fail (so it does not wait on documents still embedding) and
-- must not change anything the business can observe (so it does not re-stamp
-- published_at, which would also invalidate every stored instant answer).
create or replace function public.agent_publish_internal(
  p_business_id uuid,
  p_actor text,
  p_is_backfill boolean
)
returns table (version_id uuid, version int, changed boolean, previous_version_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_business public.businesses%rowtype;
  v_snapshot jsonb;
  v_hash text;
  v_live public.agent_versions%rowtype;
  v_new_id uuid;
  v_next int;
  v_processing int;
begin
  -- Serializes concurrent publishes of one business; the second one then
  -- sees the first one's version and (same hash) returns it unchanged.
  select * into v_business from public.businesses where id = p_business_id for update;
  if not found then
    raise exception 'AGENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_snapshot := public.build_agent_snapshot(p_business_id);
  v_hash := md5(v_snapshot::text);

  if v_business.live_version_id is not null then
    select * into v_live from public.agent_versions where id = v_business.live_version_id;
    if found and v_live.content_hash = v_hash then
      return query select v_live.id, v_live.version, false, v_live.id;
      return;
    end if;
  end if;

  -- A document still (re)embedding has missing or stale chunks; publishing
  -- now would freeze that gap into the live agent.
  if not p_is_backfill then
    select count(*) into v_processing
    from public.knowledge_documents d
    where d.business_id = p_business_id
      and d.ingestion_status in ('pending', 'processing')
      and (
        (d.source_type in ('manual', 'file', 'url') and d.status = 'published')
        or (d.source_type = 'faq' and d.source_id in (select f.id from public.faqs f where f.business_id = p_business_id and f.status = 'approved'))
        or (d.source_type = 'product' and d.source_id in (select p.id from public.products p where p.business_id = p_business_id and p.status = 'approved'))
        or (d.source_type = 'service' and d.source_id in (select s.id from public.services s where s.business_id = p_business_id and s.status = 'approved'))
      );
    if v_processing > 0 then
      raise exception 'AGENT_PUBLISH_PROCESSING:%', v_processing using errcode = 'P0001';
    end if;
  end if;

  select coalesce(max(av.version), 0) + 1 into v_next
  from public.agent_versions av where av.business_id = p_business_id;

  insert into public.agent_versions (business_id, version, content_hash, snapshot, published_by)
  values (p_business_id, v_next, v_hash, v_snapshot, p_actor)
  returning id into v_new_id;

  insert into public.live_knowledge_chunks
    (id, version_id, business_id, document_id, source_type, source_id, chunk_index, content, embedding)
  select c.id, v_new_id, p_business_id, c.document_id, d.source_type, d.source_id, c.chunk_index, c.content, c.embedding
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id and d.business_id = c.business_id
  where c.business_id = p_business_id
    and c.embedding is not null
    and (
      (d.source_type in ('manual', 'file', 'url') and d.status = 'published')
      or (d.source_type = 'faq' and d.source_id in (select f.id from public.faqs f where f.business_id = p_business_id and f.status = 'approved'))
      or (d.source_type = 'product' and d.source_id in (select p.id from public.products p where p.business_id = p_business_id and p.status = 'approved'))
      or (d.source_type = 'service' and d.source_id in (select s.id from public.services s where s.business_id = p_business_id and s.status = 'approved'))
    );

  -- published_at is re-stamped on every real publish: that column is part of
  -- answer_bank_businesses_bump(), so a publish makes the stored instant
  -- answers regenerate, exactly as a republish always has.
  update public.businesses
  set live_version_id = v_new_id,
      published_at = case when p_is_backfill then published_at else now() end,
      onboarding_step = case when p_is_backfill then onboarding_step else 'live' end,
      onboarding_completed_at = case
        when p_is_backfill then onboarding_completed_at
        else coalesce(onboarding_completed_at, now())
      end
  where id = p_business_id;

  -- Second statement, after the bump trigger above has run, so the stored
  -- value is the post-publish answer_bank_version.
  update public.businesses
  set live_answer_bank_version = answer_bank_version
  where id = p_business_id;

  -- Keep the new and the previous version (an in-flight request may still be
  -- searching the previous one); drop everything older.
  delete from public.live_knowledge_chunks lkc
  where lkc.business_id = p_business_id
    and lkc.version_id <> v_new_id
    and lkc.version_id is distinct from v_business.live_version_id;

  -- Answer cache: cleared here AND keyed by version in lib/response-cache.ts.
  delete from public.ai_response_cache where business_id = p_business_id;

  return query select v_new_id, v_next, true, v_business.live_version_id;
end;
$$;

revoke execute on function public.agent_publish_internal(uuid, text, boolean) from public, anon, authenticated;

-- The authenticated entry point. Tenant check mirrors the RLS policies
-- (Clerk org claim); the org:admin role requirement is enforced by the caller
-- (requireMinRole), the same convention as every other business-config write.
create or replace function public.publish_agent(p_business_id uuid)
returns table (version_id uuid, version int, changed boolean, previous_version_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org text := (select auth.jwt()) -> 'o' ->> 'id';
  v_actor text := (select auth.jwt()) ->> 'sub';
begin
  -- (no #variable_conflict needed: no query below names an output column)
  if v_org is null or not exists (
    select 1 from public.businesses where id = p_business_id and clerk_org_id = v_org
  ) then
    raise exception 'AGENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query select * from public.agent_publish_internal(p_business_id, coalesce(v_actor, 'unknown'), true);
end;
$$;

revoke execute on function public.publish_agent(uuid) from public, anon;
grant execute on function public.publish_agent(uuid) to authenticated;

-- One round trip for the dashboard header: the live snapshot and the draft
-- snapshot, only when they differ. SECURITY INVOKER -- RLS scopes every read.
create or replace function public.agent_publish_status(p_business_id uuid)
returns table (live_version int, live_snapshot jsonb, draft_snapshot jsonb)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_live public.agent_versions%rowtype;
  v_draft jsonb;
begin
  select av.* into v_live
  from public.businesses b
  join public.agent_versions av on av.id = b.live_version_id
  where b.id = p_business_id;

  v_draft := public.build_agent_snapshot(p_business_id);

  if v_live.id is null then
    return query select null::int, null::jsonb, v_draft;
  elsif v_live.content_hash = md5(v_draft::text) then
    return query select v_live.version, null::jsonb, null::jsonb;
  else
    return query select v_live.version, v_live.snapshot, v_draft;
  end if;
end;
$$;

revoke execute on function public.agent_publish_status(uuid) from public, anon;
grant execute on function public.agent_publish_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Instant answers are servable only at the LIVE version
-- ---------------------------------------------------------------------------

-- Same function as 20261030000000 with one change: freshness is checked
-- against live_answer_bank_version (set at publish), not the ever-moving draft
-- answer_bank_version, so an answer regenerated from unpublished edits is
-- never served. coalesce() falls back to the old rule for a published row that
-- has no live version recorded (never the case in production after the
-- backfill below).
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
    and e.content_version = coalesce(b.live_answer_bank_version, b.answer_bank_version)
    and b.published_at is not null;
$$;

revoke execute on function public.get_instant_answer(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.get_instant_answer(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Backfill: version 1 for every agent that is already live
-- ---------------------------------------------------------------------------

-- Each published business gets a v1 snapshot of its current draft (== what it
-- is serving today), a copy of its chunks, and a live pointer, so the runtime
-- change deploys with no gap. Runs as the migration owner, so the definer
-- function is callable; documents still embedding are NOT waited on (the
-- backfill must not fail) -- their already-stored chunks are what is copied.
-- live_answer_bank_version is set to the current answer_bank_version, which
-- keeps every stored instant answer servable. published_at is untouched.
do $$
declare
  r record;
begin
  for r in select id from public.businesses where published_at is not null and live_version_id is null loop
    perform public.agent_publish_internal(r.id, 'migration', true);
  end loop;
end;
$$;
