-- Instagram connect switches from "Instagram API with Unified Login" to
-- "Instagram API with Facebook Login" (Messenger API support for
-- Instagram). Unified Login stays in the code behind
-- META_IG_LOGIN_MODE=unified; the default is now facebook.
--
-- Facebook Login gives us a Facebook User token; the long-lived version of
-- it yields a Page access token with no expiry for the Facebook Page linked
-- to the Instagram professional account. That Page token is what we store
-- (encrypted, instagram_credentials.access_token_encrypted -- unchanged,
-- still zero authenticated/anon grant) and what we send with.
--
-- New, non-secret identifying columns on instagram_connections (already
-- RLS-scoped to the caller's own business):
--  * login_mode          which flow made the connection. Existing rows are
--                        'unified'; sends and disconnects follow the row,
--                        not the env flag, so flipping the flag never breaks
--                        an existing connection.
--  * facebook_user_id    app-scoped Facebook user id (GET /me). Meta's
--                        deauthorize / data-deletion signed_request user_id
--                        is matched against it.
--  * facebook_page_id    the Page we send through and subscribe/unsubscribe.
--  * facebook_page_name  shown in the dashboard.
--
-- instagram_pending_selections gets the same login_mode/facebook_user_id;
-- meta_system_user_id becomes nullable (Facebook Login has no system user).
-- In facebook mode the pending row holds the encrypted long-lived USER
-- token; the Page token is fetched for the chosen Page only.

alter table public.instagram_connections
  add column login_mode text not null default 'unified'
    check (login_mode in ('unified', 'facebook')),
  add column facebook_user_id text,
  add column facebook_page_id text,
  add column facebook_page_name text;

create index instagram_connections_facebook_user_idx
  on public.instagram_connections (facebook_user_id)
  where facebook_user_id is not null;

create index instagram_connections_facebook_page_idx
  on public.instagram_connections (facebook_page_id)
  where facebook_page_id is not null;

alter table public.instagram_pending_selections
  alter column meta_system_user_id drop not null,
  add column login_mode text not null default 'unified'
    check (login_mode in ('unified', 'facebook')),
  add column facebook_user_id text;
