-- Phase 16 (WhatsApp, built out of order per explicit user override --
-- STATE.md D11 originally deferred it): Meta WhatsApp Cloud API
-- integration. Four tables, same claim-based queue shape as Phase 23/24's
-- ingestion/webhook queues -- a prospect's reply must never wait on
-- Meta's own HTTP round-trip, and Meta's webhook retries must never
-- double-process a message.
--
-- `whatsapp_connections` is the business-visible config (one per
-- business in v1 -- see the unique index below); `whatsapp_credentials`
-- holds the actual Meta access token with zero `authenticated` grant at
-- all, a stricter posture than `webhook_endpoints.secret` gets, since
-- unlike that per-endpoint signing secret, this token is a live bearer
-- credential for Meta's Graph API. `whatsapp_inbound_messages` is a pure
-- dedup log keyed on Meta's own message id (`wamid...`) -- Meta retries
-- a webhook on any non-2xx or timeout, so the receiver must be able to
-- recognize and no-op a redelivery. `whatsapp_outbound_messages` is the
-- reply-send retry queue, same shape as `webhook_deliveries`.

create table public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  phone_number_id text not null unique,
  waba_id text not null,
  display_phone_number text not null,
  verified_name text,
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'disconnected')),
  last_verified_at timestamptz,
  last_error text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- One connection per business in v1 -- see STATE.md's decision record
-- for the WhatsApp phase. The webhook receiver looks up a connection by
-- `phone_number_id` (already unique above); this index is what a
-- business's own dashboard/actions read by `business_id`.
create unique index whatsapp_connections_business_id_idx on public.whatsapp_connections (business_id);

alter table public.whatsapp_connections enable row level security;
alter table public.whatsapp_connections force row level security;

grant select, insert, update, delete on public.whatsapp_connections to authenticated;

create policy "whatsapp_connections_select_own_business" on public.whatsapp_connections
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "whatsapp_connections_insert_own_business" on public.whatsapp_connections
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "whatsapp_connections_update_own_business" on public.whatsapp_connections
  for update
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "whatsapp_connections_delete_own_business" on public.whatsapp_connections
  for delete
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

-- Zero `authenticated`/`anon` grants -- only the service-role client
-- (called from lib/whatsapp.ts, only after requireMinRole("org:admin")
-- has already run in the calling Server Action) ever touches this
-- table. Same posture as webhook_deliveries/rate_limit_counters, but
-- with no grant at all rather than a select-only or table-level grant,
-- since this table holds a live bearer credential, not an operational
-- log or a per-endpoint signing secret the business needs to read back.
create table public.whatsapp_credentials (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  access_token text not null,
  token_updated_at timestamptz not null default now()
);

alter table public.whatsapp_credentials enable row level security;
alter table public.whatsapp_credentials force row level security;

create table public.whatsapp_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  whatsapp_message_id text not null unique,
  conversation_id uuid references public.conversations (id) on delete set null,
  created_at timestamptz not null default now()
);

create index whatsapp_inbound_messages_business_id_idx on public.whatsapp_inbound_messages (business_id);

alter table public.whatsapp_inbound_messages enable row level security;
alter table public.whatsapp_inbound_messages force row level security;

create table public.whatsapp_outbound_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  to_wa_id text not null,
  phone_number_id text not null,
  content text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  wa_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  sent_at timestamptz
);

create index whatsapp_outbound_messages_pending_idx
  on public.whatsapp_outbound_messages (next_attempt_at)
  where status = 'pending';

alter table public.whatsapp_outbound_messages enable row level security;
alter table public.whatsapp_outbound_messages force row level security;

create function public.claim_whatsapp_outbound_messages(p_limit integer default 10)
returns setof public.whatsapp_outbound_messages
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.whatsapp_outbound_messages wom
    set status = 'processing', updated_at = now()
    from (
      select id
      from public.whatsapp_outbound_messages
      where status = 'pending' and next_attempt_at <= now()
      order by next_attempt_at
      limit p_limit
      for update skip locked
    ) claimed
    where wom.id = claimed.id
    returning wom.*;
end;
$$;

revoke execute on function public.claim_whatsapp_outbound_messages(integer) from public, anon, authenticated;
