-- Tenant-scoped similarity search for products/services, modeled 1:1 on
-- match_knowledge_chunks (20260812161850). Powers the recommend_products
-- tool's intent-matching (lib/tools/recommend-products.ts): the tool
-- embeds the prospect's stated needs once and ranks the business's own
-- approved catalog by similarity, instead of budget/category text
-- filtering alone.
--
-- SECURITY INVOKER (the default, stated explicitly) -- runs with the
-- calling session's own privileges, so RLS still applies. The explicit
-- p_business_id filter in the query body is defense-in-depth on top of
-- RLS, matching every other tenant-scoped query in this project
-- (docs/security.md §9: never a global similarity search). Also filters
-- to status = 'approved' -- a draft extraction awaiting review must
-- never be recommended to a prospect, same gate check-product-details
-- and list-offerings already apply.
--
-- Cosine distance (<=>) is correct for L2-normalized embeddings
-- (lib/embeddings.ts normalizes every stored vector).
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default -- per
-- the standing per-function-privilege rule (docs/security.md, born from
-- match_knowledge_chunks' own Phase 7 gap), this migration explicitly
-- revokes it and grants only to authenticated (both the widget's
-- service-role path, which bypasses grants entirely, and the dashboard
-- sandbox chat's authenticated-session path need this to keep working).

create or replace function public.match_products(
  p_business_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 20
)
returns table (
  id uuid,
  name text,
  description text,
  category text,
  price numeric(12,2),
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

create or replace function public.match_services(
  p_business_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 20
)
returns table (
  id uuid,
  name text,
  description text,
  category text,
  price numeric(12,2),
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
