-- Instagram moves from "Instagram API with Instagram Login" to Meta's
-- "Instagram API with Unified Login" (Facebook Login for Business with a
-- config_id). Meta no longer offers the old login to new apps.
--
-- What changes in the data:
--  * The token is now a Business Integration System User access token. It
--    does not expire (it can be revoked), so token_expires_at and the daily
--    refresh sweep go away.
--  * The token is stored AES-256-GCM encrypted by the app
--    (lib/token-crypto.ts, META_TOKEN_ENCRYPTION_KEY), in
--    instagram_credentials.access_token_encrypted. The table keeps its zero
--    grants to authenticated/anon (service role only).
--  * We store the system user's app-scoped id (what GET /me returns, used by
--    Meta's deauthorize / data-deletion callbacks) and client_business_id.
--  * A client who shares more than one Instagram account picks one; until
--    they do, the token waits in instagram_pending_selections (service role
--    only, short-lived, scoped to the business that started the login).
--
-- Tokens issued by the old login only work on graph.instagram.com, which
-- the new code no longer calls, so they are deleted and every existing
-- connection is marked disconnected. The business sees "Reconnect" in the
-- dashboard. Conversations are untouched.

delete from public.instagram_credentials;
delete from public.instagram_oauth_states;

update public.instagram_connections
set status = 'disconnected',
    access_token_last4 = null,
    last_error = 'reconnect_required',
    updated_at = now();

alter table public.instagram_credentials
  rename column access_token to access_token_encrypted;

alter table public.instagram_connections
  drop column token_expires_at;

alter table public.instagram_connections
  rename column instagram_app_scoped_user_id to meta_system_user_id;

alter index public.instagram_connections_app_scoped_user_idx
  rename to instagram_connections_meta_system_user_idx;

alter table public.instagram_connections
  add column client_business_id text;

create index instagram_connections_client_business_idx
  on public.instagram_connections (client_business_id)
  where client_business_id is not null;

create table public.instagram_pending_selections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  initiated_by_user_id text not null,
  access_token_encrypted text not null,
  meta_system_user_id text not null,
  client_business_id text,
  -- [{ "id": "<IG account id>", "username": "<username>" }, ...] from
  -- GET /me/assigned_instagram_accounts. No token inside.
  accounts jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index instagram_pending_selections_business_idx
  on public.instagram_pending_selections (business_id);
create index instagram_pending_selections_expires_at_idx
  on public.instagram_pending_selections (expires_at);

-- Zero authenticated/anon grants (default privileges already grant none):
-- this row holds a live token. Only the service-role client reads it, and
-- only after checking the caller's own business_id.
alter table public.instagram_pending_selections enable row level security;
alter table public.instagram_pending_selections force row level security;
