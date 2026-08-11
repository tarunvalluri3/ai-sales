# Architecture conventions

Established in Phase 0. Extend, don't restructure, in later phases unless a
prompt explicitly proposes a change here.

## Folder layout

No `src/` directory — `app/` sits at the repo root. This was already the
state of the repo when this convention was written, and `tsconfig.json`'s
`@/*` → `./*` path alias assumes it.

- `app/` — routes, layouts, route handlers (App Router).
- `lib/` — server-only shared modules (utilities, error handling, and, from
  Phase 1 on, the data-access layer and AI orchestration code). Every file in
  `lib/` that isn't safe to import into a client component starts with
  `import "server-only";`, so an accidental client import fails the build
  instead of shipping server logic into the browser bundle.
- `components/` — introduced when the first shared UI component exists.
  Not created speculatively.

## Validation

Zod is the required validation library at every runtime boundary
(`AGENTS.md` §2, §9). Installed starting Phase 1, where the first request
flows through a route handler (`app/api/health/route.ts`).

Convention: Zod schemas are colocated with the route handler or server
action that owns the boundary they validate, not centralized in a generic
`lib/validation.ts` grab-bag. A schema shared by more than one boundary can
move to a `lib/` module named for what it validates (e.g.
`lib/schemas/lead.ts`), not a catch-all file.

## Route handler conventions

Established in Phase 1 via `app/api/health/route.ts`. Route handlers:

- Stay thin — parse/validate input, call into `lib/` (or, from Phase 3 on,
  a service module) for any real logic, and shape the response. No business
  logic inline in the handler once such logic exists.
- Validate all input (query params, body, headers) with a Zod schema
  colocated in the same file, per the Validation convention above.
- Return responses through `lib/api-response.ts`'s `jsonSuccess`/`jsonError`
  helpers, so every endpoint shares one JSON envelope shape
  (`{ ok: true, data }` / `{ ok: false, error }`).
- Never let a thrown error reach the client directly — catch it, convert it
  through `lib/errors.ts`'s `AppError` / `logAndGetUserMessage`, and return
  it via `jsonError` with a safe message and an appropriate status code.

## Authentication

Established in Phase 2, migrated to the resource-based pattern immediately
after (see `prompts/clerk-resource-based-auth.md`) once Clerk deprecated
the alternative.

`proxy.ts` (the Next.js 16 network-boundary file) only runs
`clerkMiddleware()` to establish the auth context for downstream `auth()`
calls — it does **not** perform path-based route protection.
`createRouteMatcher` is deprecated by Clerk and is not used.

Every protected Server Component, Route Handler, or Server Action calls
`auth.protect()` directly (or, where Clerk-level identity is also needed,
`lib/auth.ts`'s `requireAuthContext()`, which wraps it) at the top of the
resource. Behavior differs by request type:

- **Document requests (pages):** an unauthenticated visitor is redirected
  to sign-in.
- **Non-document requests (Route Handlers, Server Actions):** an
  unauthenticated caller gets a `404`, not a redirect — plan API error
  handling around this when Phase 11 adds protected routes.

`auth.protect()` also accepts a role/permission check
(`auth.protect({ role: 'org:admin' })`) for authorization, not just
authentication — not needed yet, add when a route actually requires it.

## Database

Established in Phase 3. No ORM — Supabase migrations under
`supabase/migrations/` are the schema source of truth (imperative, not
declarative: `supabase migration new <name>`, then hand-authored SQL).
Tests live under `supabase/tests/database/` (pgTAP, run via
`supabase test db`).

`lib/supabase/server.ts` exports `createServerSupabaseClient()` —
`server-only`-guarded, builds a **new client per call** authenticated as
the current Clerk session via Supabase's native third-party auth
integration (`accessToken: async () => (await auth()).getToken()`). Never
share one client instance across requests for different users.

Tenant isolation is RLS-first (resolved decision D2, `STATE.md` §4): every
business-owned table has RLS enabled and forced, with a policy scoped to
the caller's Clerk organization, plus an application-layer `business_id`/
tenant-link filter as defense in depth — never rely on application code
alone.

RLS policies read the caller's Clerk identity from `auth.jwt()`. Clerk's
current (v2, since 2025-04-14) session token nests organization claims
under `o`: `(select auth.jwt()) -> 'o' ->> 'id'` for the org id (not the
deprecated flat `org_id`), `(select auth.jwt()) ->> 'sub'` for the user
id. Always wrap `auth.jwt()` in `(select ...)` so Postgres caches it once
per statement instead of calling it per row.

New tables are **not** auto-exposed to Data API roles by default
(`supabase/config.toml`'s `[api] auto_expose_new_tables`) — an explicit
`grant select/insert/update/delete on <table> to authenticated;` is
required in addition to RLS policies, or the policy has nothing to act on.

New tables may also inherit **broader** default privileges than intended,
from a database-level `ALTER DEFAULT PRIVILEGES` set at project
provisioning time — independent of, and not overridden by, any `GRANT` a
migration adds (`GRANT` is additive; it can't revoke a grant that already
exists from another source). This bit `businesses`: `anon` and
`authenticated` both held full CRUD plus `TRUNCATE`/`REFERENCES`/`TRIGGER`
despite the table's migration only explicitly granting `SELECT` to
`authenticated` — RLS still blocked unauthorized row access, but
`TRUNCATE` bypasses RLS entirely (it's not a row-scoped operation), so
this was a real gap, not a cosmetic one (fixed in
`supabase/migrations/20260811145006_tighten_businesses_grants.sql`).
**After applying a migration that creates a table, verify its actual
grants** (Dashboard table permissions view, or `select grantee,
privilege_type from information_schema.role_table_grants where
table_name = '<table>';`) — don't assume the migration's explicit `GRANT`
is the only one in effect.

`supabase/migrations/20260811150450_default_privileges_least_privilege.sql`
closed this at the source: `alter default privileges in schema public
revoke all on tables from anon, authenticated;` means every table created
from that migration onward starts with zero default grants to those
roles, so each table's own migration is what explicitly opens the access
it needs — verified working via a throwaway test table. Still worth a
quick grant check on the first genuinely new table (Phase 5) as
end-to-end confirmation.

A hand-written type per table lives in `lib/supabase/types.ts` (e.g.
`Business`). Switch to `supabase gen types` once there are enough tables
to justify the generation step.

## Error handling

`lib/errors.ts` defines `AppError` (a safe, user-facing message kept
separate from internal detail) and `logAndGetUserMessage` (logs the
internal detail server-side, returns only the safe message). Route
handlers and server actions should catch, log, and convert errors through
this convention rather than surfacing raw messages, stack traces, or
provider errors to the client. See `docs/security.md` §10.
