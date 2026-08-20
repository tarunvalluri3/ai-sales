-- Widget key rotation and multiple allowed origins (Phase 24). Replaces
-- the Phase 11 v1 design (one widget_key + one widget_allowed_origin
-- column on businesses, explicitly flagged there as "no rotation/
-- multiple-keys support for v1") with a proper one-business-to-many-keys
-- table. Rotation without downtime: a business generates a new key,
-- updates their embedded widget snippet, confirms it works, then revokes
-- the old key -- at no point is there a window where the widget is
-- broken. Multiple origins per key (not just multiple keys) covers a
-- business embedding the same widget on, say, a marketing site and a
-- staging environment without needing two separate keys.
--
-- No delete -- revoke only (status flips to 'revoked', revoked_at
-- stamped) so a business's key history stays inspectable via audit_log,
-- matching knowledge_documents' soft-lifecycle precedent rather than
-- audit_log's own hard-delete-of-source pattern.

create table public.widget_keys (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  key uuid not null default gen_random_uuid() unique,
  allowed_origins text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index widget_keys_business_id_idx on public.widget_keys (business_id);

-- The hot lookup path (every widget request resolves by key) --
-- resolveBusinessFromWidgetKey filters `key = $1 and status = 'active'`.
create index widget_keys_key_active_idx on public.widget_keys (key) where status = 'active';

alter table public.widget_keys enable row level security;
alter table public.widget_keys force row level security;

grant select, insert on public.widget_keys to authenticated;
grant update (allowed_origins, status, revoked_at) on public.widget_keys to authenticated;

create policy "widget_keys_select_own_business" on public.widget_keys
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "widget_keys_insert_own_business" on public.widget_keys
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "widget_keys_update_own_business" on public.widget_keys
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

-- Backfill: every existing business's single widget_key/widget_allowed_origin
-- becomes its first widget_keys row, preserving the exact same key value
-- (embedded widget snippets already using it keep working with zero
-- migration effort for the business owner) and its origin, if one was set.
insert into public.widget_keys (business_id, key, allowed_origins, status, created_at)
select
  id,
  widget_key,
  case when widget_allowed_origin is not null then array[widget_allowed_origin] else '{}'::text[] end,
  'active',
  created_at
from public.businesses;

-- The old single-key/single-origin columns are now superseded. Dropping
-- them (rather than leaving them stale) avoids a second, out-of-sync
-- source of truth for widget identity. The businesses_update_own_org
-- RLS policy (Phase 11) stays -- it also backs the profile-field column
-- grant added in 20260813140000, not just widget_allowed_origin.
revoke update (widget_allowed_origin) on public.businesses from authenticated;

alter table public.businesses
  drop column widget_key,
  drop column widget_allowed_origin;
