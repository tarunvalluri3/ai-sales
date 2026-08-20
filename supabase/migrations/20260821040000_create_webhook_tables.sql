-- Outbound webhooks (Phase 24): fires on a new qualified lead. Two
-- tables, same claim-based queue shape as Phase 23's knowledge
-- ingestion queue (webhook_endpoints is the config, webhook_deliveries
-- is the queue) -- delivery is a background job for the same reason
-- embedding is: never make a prospect's chat request wait on a third
-- party's HTTP response.
--
-- `secret` (per-endpoint, random) signs each delivery's payload via
-- HMAC-SHA256 so the receiving server can verify authenticity --
-- generated server-side at creation, shown to the business once (same
-- one-time-reveal convention would apply if this were a bearer secret,
-- but here the receiving business needs it long-term to verify every
-- delivery, so it stays readable, never re-derivable, matching a
-- typical webhook-signing-secret UX).

create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  url text not null,
  secret text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now()
);

create index webhook_endpoints_business_id_idx on public.webhook_endpoints (business_id);

alter table public.webhook_endpoints enable row level security;
alter table public.webhook_endpoints force row level security;

grant select, insert, delete on public.webhook_endpoints to authenticated;

create policy "webhook_endpoints_select_own_business" on public.webhook_endpoints
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "webhook_endpoints_insert_own_business" on public.webhook_endpoints
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "webhook_endpoints_delete_own_business" on public.webhook_endpoints
  for delete
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  endpoint_id uuid not null references public.webhook_endpoints (id) on delete cascade,
  event_type text not null check (event_type in ('lead.qualified')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'complete', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  delivered_at timestamptz
);

-- No RLS SELECT for authenticated -- delivery attempts/payloads are an
-- operational log, not business data a dashboard reads today (same
-- posture as rate_limit_counters/ai_response_metrics: only the service
-- role, which bypasses grants, ever touches this table).
alter table public.webhook_deliveries enable row level security;
alter table public.webhook_deliveries force row level security;

create index webhook_deliveries_pending_idx
  on public.webhook_deliveries (next_attempt_at)
  where status = 'pending';

create function public.claim_webhook_deliveries(p_limit integer default 5)
returns setof public.webhook_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.webhook_deliveries wd
    set status = 'processing', updated_at = now()
    from (
      select id
      from public.webhook_deliveries
      where status = 'pending' and next_attempt_at <= now()
      order by next_attempt_at
      limit p_limit
      for update skip locked
    ) claimed
    where wd.id = claimed.id
    returning wd.*;
end;
$$;

revoke execute on function public.claim_webhook_deliveries(integer) from public, anon, authenticated;
