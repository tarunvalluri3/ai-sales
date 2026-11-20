-- Business currency + catalog price as display text (bugs, 2026-11-20: an
-- Indian clinic's "Rs 6,500" was rejected by a numeric-only price, and its
-- 6500 showed as "$6500"). One transaction (Supabase runs each migration file
-- in one). Owner decisions: existing rows are test data (production starts
-- empty at launch); currency from time zone with UTC -> INR; snapshots
-- rewritten only in price type + fingerprint; stored instant answers and
-- cached replies containing a price are DEACTIVATED, never regenerated (no
-- Gemini cost).
--
-- Safe to apply BEFORE the code that uses it: today's code reads price as
-- string-or-number everywhere (lib/agent-snapshot.ts, the tools), and writes
-- plain numbers, which are valid text.

-- ---------------------------------------------------------------------------
-- 1. businesses.currency (ISO 4217), not versioned with the agent (like the
--    time zone, it is an operational setting the owner can change any time).
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$');

-- Mirrors lib/currency.ts currencyForTimezone() closely enough for test data.
-- The businesses BEFORE UPDATE trigger (answer_bank_businesses_bump) only
-- watches answer-relevant columns, not currency, so this queues no job.
update public.businesses set currency = case
  when timezone = 'Asia/Kolkata' then 'INR'
  when timezone in ('America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/St_Johns', 'America/Regina') then 'CAD'
  when timezone like 'America/%' or timezone = 'Pacific/Honolulu' then 'USD'
  when timezone in ('Europe/London', 'Europe/Jersey', 'Europe/Guernsey', 'Europe/Isle_of_Man') then 'GBP'
  when timezone in ('Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Vienna', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Athens', 'Europe/Helsinki') then 'EUR'
  when timezone = 'Asia/Dubai' then 'AED'
  when timezone = 'Asia/Singapore' then 'SGD'
  when timezone = 'Asia/Riyadh' then 'SAR'
  when timezone = 'Asia/Tokyo' then 'JPY'
  when timezone like 'Australia/%' then 'AUD'
  when timezone = 'Pacific/Auckland' then 'NZD'
  else 'INR'
end;

grant update (currency) on public.businesses to authenticated;

-- ---------------------------------------------------------------------------
-- 2. products.price / services.price: numeric -> display text.
-- ---------------------------------------------------------------------------
-- The backfill below is a data fix, not an owner edit: keep it from bumping
-- answer_bank_version and queuing a regeneration job (Gemini calls) per
-- business, and from touching updated_at. ALTER COLUMN TYPE fires no triggers.
alter table public.products disable trigger answer_bank_bump;
alter table public.services disable trigger answer_bank_bump;
alter table public.products disable trigger products_set_updated_at;
alter table public.services disable trigger services_set_updated_at;

-- Keep budget matching working: an item with a price but no budget amount
-- gets the old number (lib/currency.ts parsePriceAmount does the same for new
-- input).
update public.products set price_amount = price where price_amount is null and price is not null;
update public.services set price_amount = price where price_amount is null and price is not null;

alter table public.products enable trigger answer_bank_bump;
alter table public.services enable trigger answer_bank_bump;
alter table public.products enable trigger products_set_updated_at;
alter table public.services enable trigger services_set_updated_at;

-- 6500.00 -> '6500', 19.90 -> '19.9' (lib/currency.ts formats it back to
-- "₹19.90"). trim_scale: Postgres 13+.
alter table public.products
  alter column price type text using (case when price is null then null else trim_scale(price)::text end);
alter table public.services
  alter column price type text using (case when price is null then null else trim_scale(price)::text end);

alter table public.products add constraint products_price_length check (price is null or char_length(price) <= 60);
alter table public.services add constraint services_price_length check (price is null or char_length(price) <= 60);

-- ---------------------------------------------------------------------------
-- 3. match_products / match_services: same functions, price now text. The
--    return type changes, so drop + create (same grants as 20260910020000).
-- ---------------------------------------------------------------------------
drop function public.match_products(uuid, extensions.vector(1536), int);
drop function public.match_services(uuid, extensions.vector(1536), int);

create function public.match_products(
  p_business_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 20
)
returns table (
  id uuid,
  name text,
  description text,
  category text,
  price text,
  price_amount numeric(12,2),
  image_url text,
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    products.id,
    products.name,
    products.description,
    products.category,
    products.price,
    products.price_amount,
    products.image_url,
    1 - (products.embedding <=> p_query_embedding) as similarity
  from public.products
  where products.business_id = p_business_id
    and products.status = 'approved'
    and products.embedding is not null
  order by products.embedding <=> p_query_embedding
  limit p_match_count;
$$;

revoke execute on function public.match_products(uuid, extensions.vector(1536), int) from public;
revoke execute on function public.match_products(uuid, extensions.vector(1536), int) from anon;
grant execute on function public.match_products(uuid, extensions.vector(1536), int) to authenticated;

create function public.match_services(
  p_business_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 20
)
returns table (
  id uuid,
  name text,
  description text,
  category text,
  price text,
  price_amount numeric(12,2),
  image_url text,
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    services.id,
    services.name,
    services.description,
    services.category,
    services.price,
    services.price_amount,
    services.image_url,
    1 - (services.embedding <=> p_query_embedding) as similarity
  from public.services
  where services.business_id = p_business_id
    and services.status = 'approved'
    and services.embedding is not null
  order by services.embedding <=> p_query_embedding
  limit p_match_count;
$$;

revoke execute on function public.match_services(uuid, extensions.vector(1536), int) from public;
revoke execute on function public.match_services(uuid, extensions.vector(1536), int) from anon;
grant execute on function public.match_services(uuid, extensions.vector(1536), int) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Published snapshots: price type + fingerprint ONLY.
-- ---------------------------------------------------------------------------
-- build_agent_snapshot() now emits price as a JSON string (the column is
-- text), and the backfill above set priceAmount where it was null. Without
-- rewriting the live versions the same way, every business with a priced
-- product would read "1 unpublished change" (agent_publish_status compares
-- md5(draft) with the live content_hash). For each catalog item: a numeric
-- price becomes the same text the column conversion produced, and a null
-- priceAmount takes the old numeric price (exactly the table backfill).
-- Nothing else in the snapshot changes. Kept as a private function so the
-- pgTAP test runs the very same conversion.
create function public.normalize_snapshot_catalog_prices(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      case
        when jsonb_typeof(item -> 'price') = 'number' then
          item
          || jsonb_build_object('price', trim_scale((item ->> 'price')::numeric)::text)
          || case
               when item -> 'priceAmount' is null or jsonb_typeof(item -> 'priceAmount') = 'null'
                 then jsonb_build_object('priceAmount', item -> 'price')
               else '{}'::jsonb
             end
        else item
      end
      order by ordinality
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(item, ordinality);
$$;

revoke execute on function public.normalize_snapshot_catalog_prices(jsonb) from public, anon, authenticated;

create function public.normalize_snapshot_prices(p_snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select p_snapshot
    || jsonb_build_object(
         'products', public.normalize_snapshot_catalog_prices(p_snapshot -> 'products'),
         'services', public.normalize_snapshot_catalog_prices(p_snapshot -> 'services')
       );
$$;

revoke execute on function public.normalize_snapshot_prices(jsonb) from public, anon, authenticated;

do $$
declare
  v_rewritten int;
begin
  with changed as (
    select id, public.normalize_snapshot_prices(snapshot) as next
    from public.agent_versions
  )
  update public.agent_versions v
     set snapshot = c.next,
         content_hash = md5(c.next::text)
    from changed c
   where c.id = v.id
     and c.next is distinct from v.snapshot;
  get diagnostics v_rewritten = row_count;
  raise notice 'display-prices migration: % agent_versions snapshot(s) rewritten (price type + fingerprint)', v_rewritten;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Deactivate stored text that may quote a price in the old "$"/bare form.
--    Never regenerated here: a failed entry is not served (get_instant_answer
--    requires status = 'ready') and no job is queued, so the normal AI path
--    answers until the owner edits their catalog (which queues the usual
--    regeneration). The reason shows on /dashboard/answer-bank as
--    "price format changed".
-- ---------------------------------------------------------------------------
do $$
declare
  v_price_pattern constant text :=
    '([$₹€£]|\mrs\.?|\minr|\musd|\maed|\mgbp|\meur)\s?\d|\mprice:|\m(costs?|priced?|prices?|fees?|charges?|rates?)\M[^.\n]{0,40}\d';
  v_entries int;
  v_cache int;
  v_utc int;
begin
  update public.answer_bank_entries
     set status = 'failed', failure_reason = 'price_format_changed', updated_at = now()
   where status = 'ready'
     and (kind = 'catalog' or answer ~* v_price_pattern);
  get diagnostics v_entries = row_count;

  delete from public.ai_response_cache where answer ~* v_price_pattern;
  get diagnostics v_cache = row_count;

  select count(*) into v_utc from public.businesses where timezone = 'UTC' and deleted_at is null;

  raise notice 'display-prices migration: % instant answer(s) deactivated, % cached first-turn repl(y/ies) deleted, % business(es) still on UTC',
    v_entries, v_cache, v_utc;
end;
$$;
