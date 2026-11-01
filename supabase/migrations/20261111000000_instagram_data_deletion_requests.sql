-- Meta App Review: the Data Deletion Request callback must return a
-- confirmation code and a status URL a person can open later. This table is
-- that record. It is written and read only by the service-role client (the
-- /api/meta/data-deletion route and the public /data-deletion/status page),
-- so it gets zero `authenticated`/`anon` grants, same posture as
-- instagram_oauth_states. The code is the only thing the public status page
-- accepts; it is random and unguessable, and the page shows only the status.
--
-- No token, message text or username is ever stored here -- only the
-- Instagram account id Meta sent us, which is already in
-- instagram_connections.
create table public.instagram_data_deletion_requests (
  confirmation_code text primary key,
  instagram_user_id text not null,
  business_id uuid references public.businesses (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index instagram_data_deletion_requests_user_idx
  on public.instagram_data_deletion_requests (instagram_user_id);

alter table public.instagram_data_deletion_requests enable row level security;
alter table public.instagram_data_deletion_requests force row level security;

-- Meta's deauthorize / data-deletion callbacks identify the account by its
-- app-scoped Instagram user id, which is NOT the id used in messaging
-- webhooks (instagram_business_account_id). Stored at connect time so the
-- callbacks can match either. Null for connections made before this
-- migration (they match on instagram_business_account_id only).
alter table public.instagram_connections
  add column instagram_app_scoped_user_id text;

create index instagram_connections_app_scoped_user_idx
  on public.instagram_connections (instagram_app_scoped_user_id)
  where instagram_app_scoped_user_id is not null;
