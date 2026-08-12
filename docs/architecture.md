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
authentication. First used in Phase 4 (`lib/auth.ts`'s `requireAuthContext()`
takes an optional `{ role: "org:admin" }`, used by
`app/onboarding/actions.ts`'s Server Action). `"org:admin"` is Clerk's
default organization-admin role slug, confirmed against the installed
`@clerk/nextjs` 7.7.3 / `@clerk/shared` type definitions before
implementation (not memory).

Confirmed live in Phase 4 by directly replaying the onboarding Server
Action's POST request (captured via browser devtools, per this file's own
guidance above that render-time gating is not a security boundary) under a
signed-in **non-admin** org member's session, bypassing the UI entirely:
`auth.protect({ role: "org:admin" })` rejected the request server-side and
no `businesses` row was created for that member's org — the authorization
check holds independent of the page-level gate. **Honest gap:** the exact
status code / response shape returned to the replayed request was observed
live during this test but not recorded, and is not documented here. If the
precise shape matters later (e.g. building client-side handling for a
role-rejected Server Action), re-run the devtools replay described above
rather than assuming a value.

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

### Business-owned child tables (Phase 5)

`products`, `services`, and `faqs` (Phase 5) are the first tables keyed by
`business_id` rather than `clerk_org_id` directly. Their RLS policies join
through `businesses` to check org ownership:

```sql
business_id in (
  select id from public.businesses
  where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
)
```

Each has four policies (`select`/`insert`/`update`/`delete`), all scoped
this way — **any authenticated member of the owning org**, not just
`org:admin`. This is a deliberate authorization decision, not just an
implementation detail: unlike business creation (Phase 4, gated to
`org:admin` at the application layer), structured-knowledge CRUD has no
owner/member distinction in `PRODUCT.md`'s current role model, so RLS
imposes none either. Revisit if a stricter default is ever wanted — see
the resolved-decision entry in `STATE.md` §4.

Confirmed post-migration (per the standing "verify actual grants" rule
above): `authenticated` = `SELECT, INSERT, UPDATE, DELETE`, `anon` = none,
on all three tables — the first genuinely new tables since the Phase 3
default-privileges fix, closing that phase's "recommended, not required"
follow-up confirmation.

`lib/business-context.ts`'s `requireBusinessContext()` is the
`{ userId, businessId }` helper `docs/security.md` §2 asks for. It wraps
`requireAuthContext()` + `getBusinessForOrg()` and redirects (to
`/session-tasks/choose-organization` or `/onboarding`) rather than
throwing when the caller has no org or no business yet. All Phase 5 data
access resolves `businessId` through it — never from client input.

### Knowledge ingestion (Phase 6)

`knowledge_documents` and `knowledge_chunks` are the first ingestion
tables: the retrievable unit of business knowledge (a document, split
into chunks), with no embedding column yet — Phase 7 adds pgvector
storage. Same RLS/grant shape as `products`/`services`/`faqs` (join
through `businesses` via `business_id`), except `knowledge_chunks` has no
`update` policy or grant — chunks are always deleted and reinserted on a
content change (`lib/knowledge.ts`'s `regenerateChunksForDocument`), never
updated in place, since nothing yet depends on stable chunk IDs across
edits (no embeddings, no chunk-level references).

A `knowledge_documents` row is either `source_type = 'manual'` (pasted/
typed text, entered through `/dashboard/knowledge`, CRUD in
`lib/knowledge.ts`) or generated from a product/service/FAQ row
(`source_type = 'product'/'service'/'faq'`, `source_id` pointing at that
row, kept in sync by `lib/knowledge-sync.ts`). `source_id` has no FK
constraint — it references one of three different tables depending on
`source_type`, which Postgres can't express as a single FK — so integrity
for generated documents is entirely app-enforced: `lib/knowledge-sync.ts`
is the only writer of non-null `source_id` rows, and a partial unique
index on `(business_id, source_type, source_id)` (excluding `manual`)
prevents duplicates per record.

`lib/products.ts`, `lib/services.ts`, and `lib/faqs.ts` each call
`syncGeneratedDocument()` after a successful create/update and
`deleteGeneratedDocument()` after a successful delete, so every
structured record stays reachable by retrieval without a separate manual
step. If the sync call throws, the whole mutation is reported as failed
to the user (the existing `logAndGetUserMessage` catch in each Server
Action already does this) — a structured record is never left silently
out of sync with its generated knowledge document.

Chunking (`lib/chunking.ts`) is a hand-rolled, deterministic, pure text
splitter (paragraph → sentence → hard-cutoff fallback, 1000-char target,
150-char overlap by default) — not LangChain. LangChain is reserved for
Phase 8 (`docs/phases.md`); Phase 6 is pure text splitting with no model
call involved, so pulling in a LangChain package now would be premature
per `AGENTS.md` §9's "install a dependency only when the current phase
needs it."

All ingestion in this phase runs through the existing per-request
Clerk-authenticated Supabase client (`createServerSupabaseClient()`) —
no service-role client was introduced. Every ingestion event happens
synchronously inside the authenticated business member's own Server
Action (they're editing their own knowledge, or their own product/
service/FAQ), so RLS already grants exactly the access needed. A
service-role client is deferred until an actual decoupled/background job
needs one (e.g. a future embedding backfill).

## Error handling

`lib/errors.ts` defines `AppError` (a safe, user-facing message kept
separate from internal detail) and `logAndGetUserMessage` (logs the
internal detail server-side, returns only the safe message). Route
handlers and server actions should catch, log, and convert errors through
this convention rather than surfacing raw messages, stack traces, or
provider errors to the client. See `docs/security.md` §10.
