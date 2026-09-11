-- Phase 26 (Instagram DM): Instagram API with Instagram Login integration.
-- Mirrors Phase 16's WhatsApp tables/RLS/grant shape exactly where the
-- underlying mechanism is the same, with the deltas OAuth actually
-- requires: a short-lived CSRF state table (no WhatsApp analog, since
-- WhatsApp's manual-token connect flow has no redirect round-trip to
-- protect), and a token_expires_at column on the connection (Instagram's
-- long-lived OAuth token expires ~60 days; WhatsApp's system-user token
-- never does). No linked Facebook Page and no separate refresh_token are
-- needed -- confirmed live against Meta's current docs this session:
-- "Instagram API with Instagram Login" needs no Page, and refreshing a
-- long-lived token re-uses that same token as input (ig_refresh_token
-- grant), it doesn't issue a distinct refresh token.

create table public.instagram_oauth_states (
  state text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  initiated_by_user_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index instagram_oauth_states_expires_at_idx on public.instagram_oauth_states (expires_at);

-- Zero `authenticated`/`anon` grants -- a CSRF state token must never be
-- client-readable. Only the service-role client (the OAuth authorize/
-- callback routes, which have no Clerk-scoped Supabase client since the
-- callback leg carries no Clerk session) ever touches this table.
alter table public.instagram_oauth_states enable row level security;
alter table public.instagram_oauth_states force row level security;

create table public.instagram_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  instagram_business_account_id text not null unique,
  ig_username text,
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'disconnected')),
  token_expires_at timestamptz,
  access_token_last4 text,
  last_verified_at timestamptz,
  last_error text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- One connection per business in v1 -- same decision as WhatsApp's D16.
-- The webhook receiver looks up a connection by
-- `instagram_business_account_id` (already unique above); this index is
-- what a business's own dashboard/actions read by `business_id`.
create unique index instagram_connections_business_id_idx on public.instagram_connections (business_id);

alter table public.instagram_connections enable row level security;
alter table public.instagram_connections force row level security;

grant select, insert, update, delete on public.instagram_connections to authenticated;

create policy "instagram_connections_select_own_business" on public.instagram_connections
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "instagram_connections_insert_own_business" on public.instagram_connections
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "instagram_connections_update_own_business" on public.instagram_connections
  for update
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "instagram_connections_delete_own_business" on public.instagram_connections
  for delete
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

-- Zero `authenticated`/`anon` grants -- same posture as whatsapp_credentials:
-- this holds a live bearer credential for Meta's Graph API, not an
-- operational log or a business-readable signing secret.
create table public.instagram_credentials (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  access_token text not null,
  token_updated_at timestamptz not null default now()
);

alter table public.instagram_credentials enable row level security;
alter table public.instagram_credentials force row level security;

create table public.instagram_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  instagram_message_id text not null unique,
  conversation_id uuid references public.conversations (id) on delete set null,
  created_at timestamptz not null default now()
);

create index instagram_inbound_messages_business_id_idx on public.instagram_inbound_messages (business_id);

alter table public.instagram_inbound_messages enable row level security;
alter table public.instagram_inbound_messages force row level security;

create table public.instagram_outbound_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  to_ig_id text not null,
  instagram_business_account_id text not null,
  content text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  ig_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  sent_at timestamptz
);

create index instagram_outbound_messages_pending_idx
  on public.instagram_outbound_messages (next_attempt_at)
  where status = 'pending';

alter table public.instagram_outbound_messages enable row level security;
alter table public.instagram_outbound_messages force row level security;

create function public.claim_instagram_outbound_messages(p_limit integer default 10)
returns setof public.instagram_outbound_messages
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.instagram_outbound_messages iom
    set status = 'processing', updated_at = now()
    from (
      select id
      from public.instagram_outbound_messages
      where status = 'pending' and next_attempt_at <= now()
      order by next_attempt_at
      limit p_limit
      for update skip locked
    ) claimed
    where iom.id = claimed.id
    returning iom.*;
end;
$$;

revoke execute on function public.claim_instagram_outbound_messages(integer) from public, anon, authenticated;

-- Applied up front this time (WhatsApp needed a reactive follow-up
-- migration, 20260911020000, after hitting this exact race in
-- production) -- two near-simultaneous webhook deliveries for the same
-- Instagram sender must not each create their own conversation.
create unique index conversations_instagram_active_visitor_idx
  on public.conversations (business_id, visitor_id)
  where source = 'instagram';
