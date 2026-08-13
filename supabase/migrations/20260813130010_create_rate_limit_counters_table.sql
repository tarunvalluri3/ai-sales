-- Rate limiting (Phase 11, resolved decision D4): a lightweight Postgres
-- fixed-window counter table, not Redis or an external service --
-- consistent with this project's "no new infra unless justified"
-- discipline. Enforced per widget key, per IP, and per conversation
-- (docs/security.md §4) via public.increment_rate_limit_counter(), added
-- in the next migration.
--
-- Not business-owned data -- identifiers are IP addresses, widget keys,
-- and conversation ids, none of which are themselves tenant-scoped rows,
-- so no business_id column. RLS is still enabled and forced with zero
-- policies (deny-all for anon/authenticated) as defense in depth, even
-- though only the service role (which bypasses RLS) ever touches it.

create table public.rate_limit_counters (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('ip', 'key', 'conversation')),
  identifier text not null,
  window_start timestamptz not null,
  request_count int not null default 1,
  unique (scope, identifier, window_start)
);

alter table public.rate_limit_counters enable row level security;
alter table public.rate_limit_counters force row level security;

-- No grants to anon/authenticated -- new tables default to zero grants
-- already (see the Phase 3 default-privileges migration), and no policy
-- is added, so this table is unreachable by anything but the service role.
