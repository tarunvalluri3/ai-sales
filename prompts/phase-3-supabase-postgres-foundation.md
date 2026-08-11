# Phase 3 — Supabase + PostgreSQL foundation

## Goal
After this is implemented, the app has a working Supabase connection, a `businesses` table linked to Clerk Organizations via `clerk_org_id`, RLS enabled and wired to Clerk session-token claims (defense in depth per resolved decision D2), and a passing tenant-isolation test proving Business A cannot read Business B's rows. No onboarding UI, no business creation flow — those are Phase 4.

## Current phase
Phase 3 — Supabase + PostgreSQL foundation. Confirmed from `STATE.md` §1. D2 resolved: RLS on every business-owned table + application-layer `business_id` filtering + Clerk session tokens wired into Supabase so RLS can see the caller.

## User request
Implement Phase 3 per `docs/phases.md`. Cover: Supabase connection, server/client Supabase utilities, initial migrations, the business/tenant table linked to Clerk orgs, RLS policies wired to Clerk session tokens, indexes and constraints.

## Skills and docs read
- `.claude/skills/supabase/SKILL.md` — core principles (verify against current docs, don't trust training data on Supabase specifics), RLS/security checklist, CLI and migration workflow (imperative vs. declarative), MCP troubleshooting.
- `.claude/skills/supabase-postgres-best-practices/references/security-rls-basics.md`, `security-rls-performance.md`, `schema-primary-keys.md`, `schema-constraints.md`, `schema-foreign-key-indexes.md`.
- **Live docs fetched and verified during research** (not taken from training data, per the skill's own instruction):
  - `https://supabase.com/docs/guides/auth/third-party/clerk.md` and `https://clerk.com/docs/integrations/databases/supabase` — current (non-deprecated) Clerk↔Supabase integration. The old JWT-template approach was deprecated **2025-04-01**; the current approach is Supabase's native "Third-Party Auth" provider plus an `accessToken` callback on the Supabase client.
  - `https://clerk.com/docs/guides/sessions/session-tokens` — **critical finding:** Clerk's session token claim shape changed. Organization claims are now a **nested `o` object** (`o.id`, `o.slg`, `o.rol`), not the old flat `org_id`/`org_slug`/`org_role`. Flat naming ("v1") was deprecated **2025-04-14**. Any RLS policy or code snippet found online using flat `org_id` is stale — this prompt uses `o.id`/`o.rol` throughout.
  - `https://supabase.com/docs/guides/api/api-keys.md` and the current Next.js quickstart — Supabase's API key naming changed: `anon`/`service_role` keys are being replaced by `publishable`/`secret` keys (`sb_publishable_...`/`sb_secret_...`), with the legacy keys slated for deprecation **by the end of 2026**. Current quickstarts use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, not `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Since this is a greenfield project started today, this prompt uses the current naming (see Decision 8).
- `STATE.md` §4/§5 — D2 resolved; planned-but-unwired Supabase env vars use the older naming and need correcting (see Decision 8).
- `docs/security.md` §3, §5, §9 — RLS strategy, env var table (stale naming, to be corrected), retrieval-isolation shape for later phases.
- `docs/phases.md` Phase 3 — exit criterion.
- **Not independently confirmed:** the exact internal mechanism by which `auth.jwt()` reads `request.jwt.claims` (needed to hand-simulate a JWT in a raw SQL test without a real Supabase Auth user). This is extremely well-established Supabase practice, but a live doc fetch didn't produce a first-party confirmation during research. Requirement 6 below asks the implementer to confirm it directly against the local Postgres instance (`select prosrc from pg_proc where proname = 'jwt' and pronamespace = 'auth'::regnamespace;`) before relying on it, rather than asserting it as fact here.

## Existing code inspected
- No `supabase/` directory, no Supabase CLI, no Docker available in this environment (checked: `supabase --version` → not found; `docker --version` → not found). Neither is installed as a dependency.
- `.env.local` exists (gitignored) with working Clerk keys only; no Supabase vars present.
- `lib/auth.ts` — `requireAuthContext()`, the Clerk identity helper this phase's Supabase client will sit alongside (not replace).
- `.env.example`, `STATE.md` §5 — currently list `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (legacy naming, see Decision 8).
- No `businesses` table, no migrations, no test infrastructure of any kind exists yet — this is the first phase to need any of the three.

## Relevant existing architecture
- `docs/architecture.md`: `lib/` holds server-only modules (`import "server-only"`); Zod colocated with the boundary it validates; route handlers thin, errors through `lib/errors.ts`; auth via `auth.protect()`/`lib/auth.ts`.
- `docs/security.md` §2: Clerk is identity source of truth; `docs/security.md` §3: no ORM, Supabase migrations are the schema source of truth, UUID primary keys unless there's a strong reason otherwise, defense-in-depth RLS per resolved D2.
- `AGENTS.md` §9: install a dependency only when the phase needs it; no speculative abstraction.

## Decisions and assumptions

1. **Migration workflow: imperative, not declarative.** No `supabase/schemas/` exists and this is a single new table — the declarative-schema diffing workflow (`supabase/schemas/` → generated migration) adds process overhead with no payoff yet. Per the `supabase` skill: use `supabase migration new create_businesses_table` to get a correctly named file, then hand-author the SQL. Revisit declarative schemas if/when the schema grows large enough that diffing pays for itself.

2. **Primary key: `uuid default gen_random_uuid()`, not the best-practices skill's `bigint identity`/UUIDv7 suggestion.** `docs/security.md` §3 (project contract) explicitly says "UUID primary keys unless there's a strong reason otherwise." The skill's index-fragmentation concern applies at large row counts; `businesses` will have on the order of thousands of rows at most (one per tenant), so the standard-library `gen_random_uuid()` is used rather than adding a `pg_uuidv7` extension dependency for a table this small.

3. **"Membership link" (per the Phase 3 exit criterion) = the `clerk_org_id` column on `businesses`, not a separate Supabase members table.** Clerk Organizations is already the source of truth for who belongs to which business (`docs/security.md` §2) — mirroring membership into a second Supabase table would be a duplicate, driftable source of truth with no current consumer. `businesses.clerk_org_id` (unique) is the entire link.

4. **No INSERT/UPDATE/DELETE policies added this phase — SELECT only.** No flow creates or mutates a business row yet; that's Phase 4 (onboarding), which will decide whether creation goes through an authenticated INSERT policy or a deliberate service-role server action, and add the corresponding policy then. Adding write policies now would be guessing at Phase 4's design. RLS is still enabled (and forced) on the table from the start, per the security checklist.

5. **Clerk JWT claim access: `(select auth.jwt()) -> 'o' ->> 'id'` for org id, `(select auth.jwt()) ->> 'sub'` for user id.** Per the verified current (v2) Clerk session token shape — see "Skills and docs read." The `(select ...)` wrapping follows the RLS performance rule (cache the function call once per statement instead of once per row).

6. **RLS isolation test: raw pgTAP with manual `set_config`/`set local role`, not the `basejump-supabase_test_helpers` `tests.authenticate_as()` pattern.** That helper is built around Supabase's own `auth.users` table (`auth.uid()`); this project uses Clerk as a third-party auth provider with a custom `o.id` claim and no `auth.users` rows at all, so the helper doesn't fit. The test instead directly sets `request.jwt.claims` and the Postgres role to simulate two different orgs' sessions. **The implementer must confirm this works against the actual local instance before finalizing the test** (see the "Not independently confirmed" note above) rather than assume it from this prompt alone.

7. **No browser Supabase client, no service-role client, this phase.** Every current page/route is a Server Component or Route Handler — nothing runs in a client component that needs Supabase yet, and no ingestion/admin operation needs the privilege-bypassing secret key yet. Both are added when a real caller needs them (client UI in Phase 5+/12, service-role for ingestion in Phase 6+), not speculatively.

8. **Env var naming corrected to Supabase's current key system.** `docs/security.md` §5 and `STATE.md` §5 currently list `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — the legacy naming, which Supabase is deprecating by end of 2026. Since this project starts today, this prompt uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` instead, matching Supabase's current quickstart. `docs/security.md`'s env var table is corrected as part of this prompt (a factual naming correction against verified current provider docs, not an architecture change) — flagging this explicitly since it edits a contract-adjacent doc.

9. **No generated TypeScript types (`supabase gen types`) this phase.** Generating types requires a linked project or local Docker instance (see Decision 10) and pays off once there are several tables; for one table, a small hand-written `Business` type in `lib/supabase/types.ts` is simpler and has no tooling dependency. Revisit once Phase 5+ adds enough tables to justify generation.

10. **Supabase project creation, Clerk↔Supabase third-party-auth wiring (both dashboards), and `supabase login`/`supabase link` are manual, external prerequisites this implementation cannot perform.** Same category as Phase 2's Clerk Dashboard setup. Additionally: this environment has **no Docker and no Supabase CLI installed**, so `supabase start` (local Postgres), `supabase db push`/`reset`, and `supabase test db` cannot be executed here. The prompt installs the CLI as a devDependency and writes the migration/test files, but actually running them against a live database — local (needs your Docker) or your linked remote project — is on you. See Manual testing steps.

## Open decisions this depends on
None remaining that gate Phase 3. D2 is resolved (see `STATE.md` §4). D3 (embedding dimension) is Phase 7's concern, not this one.

## Dependencies / packages required
- `@supabase/supabase-js` (latest v2) — the Supabase client. Not currently in `package.json`.
- `supabase` (latest, npm-distributed CLI) — as a devDependency, for `supabase init`/`migration new`/`test db`, pinned and lockfile-committed per the skill's supply-chain guidance. Not currently in `package.json`.

## Files likely to change
**Created:**
- `supabase/config.toml` and the rest of the `supabase/` scaffold from `supabase init` — adds `[auth.third_party.clerk]` with the project's Clerk domain (value from your Clerk Dashboard; use a placeholder/comment if unavailable at implementation time, matching the `.env.example` pattern).
- `supabase/migrations/<timestamp>_create_businesses_table.sql` (exact name from `supabase migration new create_businesses_table` — do not hand-invent the timestamp).
- `supabase/tests/database/*.sql` — pgTAP tenant-isolation test(s).
- `lib/supabase/server.ts` — `server-only` Supabase client factory using the `accessToken` callback wired to `requireAuthContext`'s underlying Clerk session (see Requirement 4).
- `lib/supabase/types.ts` — hand-written `Business` type matching the migration.

**Modified:**
- `.env.example` — add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as Phase-3-required; correct `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEY` (still planned, not required this phase).
- `docs/security.md` §5 — correct the env var table to current Supabase key naming (Decision 8).
- `docs/architecture.md` — add a "Database" section: `lib/supabase/server.ts` location and purpose, RLS-first convention, the Clerk claim shape used in policies, migration workflow (imperative, `supabase migration new`), where tests live.
- `package.json`/`package-lock.json` — add the two packages above.
- `STATE.md` — record the migration, table, env var corrections, and this phase's decisions per its own update instructions.

**Deleted:** None.

## Database changes
- New table `public.businesses`:
  - `id uuid primary key default gen_random_uuid()`
  - `clerk_org_id text not null` — unique constraint + index (the tenant link, see Decision 3)
  - `name text not null`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`, maintained by a trigger (`set updated_at = now()` on `before update`)
- RLS: `alter table businesses enable row level security;` and `force row level security;`. One policy: `select` for `authenticated` where `clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')`.
- Exact migration command: `supabase migration new create_businesses_table`, then hand-author the SQL body per the above. Applying it (`supabase db push` against a linked project, or `supabase start` + local apply) is a manual step per Decision 10.

## Server / client boundaries
- `lib/supabase/server.ts` starts with `import "server-only"`. It creates a Supabase client per-request using `accessToken: async () => (await auth()).getToken()` (from `@clerk/nextjs/server`) — never a static/cached client shared across requests with different users' identity.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are both client-safe by Supabase's own design (the publishable key identifies the project, not a caller — equivalent to the old anon key). `SUPABASE_SECRET_KEY` is not introduced this phase; if it were, it would never appear in a client component or `NEXT_PUBLIC_*` variable, per `docs/security.md` §5/§6.
- No client component uses Supabase this phase (Decision 7).

## Implementation requirements
1. Install `@supabase/supabase-js` and `supabase` (devDependency).
2. `supabase init` to scaffold `supabase/`. Edit `supabase/config.toml` to add:
   ```toml
   [auth.third_party.clerk]
   enabled = true
   domain = "<your-clerk-domain>.clerk.accounts.dev"
   ```
   Use a clearly marked placeholder for the domain if the real value isn't available at implementation time — do not fabricate one.
3. `supabase migration new create_businesses_table`, then write the SQL per "Database changes" above, including the `updated_at` trigger function and the unique index on `clerk_org_id`.
4. `lib/supabase/server.ts`:
   ```ts
   import "server-only";
   import { auth } from "@clerk/nextjs/server";
   import { createClient } from "@supabase/supabase-js";

   export function createServerSupabaseClient() {
     return createClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
       { accessToken: async () => (await auth()).getToken() },
     );
   }
   ```
   Confirm the exact `auth()` return shape's `getToken` signature against the installed `@clerk/nextjs` types (same verification discipline as Phase 2) before finalizing — do not assume it matches the snippet above without checking.
5. `lib/supabase/types.ts`: a minimal `Business` type (`id: string; clerk_org_id: string; name: string; created_at: string; updated_at: string;`) matching the migration exactly.
6. `supabase/tests/database/`: a pgTAP test that:
   - Seeds two `businesses` rows (as `postgres`/superuser, bypassing RLS — fixture setup, not the thing under test) with distinct `clerk_org_id` values.
   - Simulates "signed in as org A": sets the Postgres role to `authenticated` and `request.jwt.claims` to a JSON object shaped like a real Clerk v2 session token (at minimum `{"sub": "...", "o": {"id": "<org A's clerk_org_id>"}}`), per Decision 6 — **verify this simulation actually works against the local instance** (introspect `auth.jwt()`'s definition first) before relying on it.
   - Asserts: querying `businesses` as org A returns exactly org A's row, never org B's.
   - Repeats for org B, asserting the reverse.
   - This is the required tenant-isolation test per `AGENTS.md` §7.
7. Update `.env.example`, `docs/security.md` §5, `docs/architecture.md` per "Files likely to change."
8. Do not build any UI, server action, or route that creates/reads/writes a `businesses` row through the app — Phase 4's job. This phase proves the database/RLS foundation, not the product flow on top of it.
9. Do not touch `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, or anything under `app/` — no product surface changes.

## Security requirements
- Reference `docs/security.md` §1 (every business-owned table carries `business_id`/tenant link, tenant-scoped at the query level, never trust a client-supplied identifier) and §3 (RLS + service-role bypass warning — no service-role client exists yet, so this doesn't apply yet but stays true going forward).
- `docs/security.md` §11 review checklist, applied now: new table has a tenant link (`clerk_org_id`) ✓; query is tenant-scoped at the RLS level, not just application code ✓; a test proves cross-tenant reads fail (Requirement 6) ✓; no new `NEXT_PUBLIC_*` variable holds a secret ✓ (`SUPABASE_SECRET_KEY` is not introduced); new env vars land in `.env.example` and `STATE.md` ✓.
- The `SECURITY DEFINER` and view-related traps in the `supabase` skill's security checklist don't apply yet (no functions, no views this phase) — noted for when they do.

## Error handling
- Missing/misconfigured `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` at runtime → `createClient` throws or requests fail; no custom handling is added this phase since nothing in the app calls `createServerSupabaseClient()` yet (no consumer until Phase 4). Deferred, not silently ignored — flag as a known gap.
- RLS denial (querying a business you don't belong to) → Postgres/PostgREST returns zero rows for `SELECT`, not an error — this is RLS's normal, silent-filtering behavior and is exactly what the isolation test asserts, not a failure mode to handle specially.

## Acceptance criteria
- [ ] `@supabase/supabase-js` and `supabase` (CLI) present in `package.json`/`package-lock.json`
- [ ] `supabase/config.toml` includes `[auth.third_party.clerk]` (domain placeholder acceptable if real value unavailable)
- [ ] A migration file exists (CLI-generated name) creating `businesses` with the exact columns in "Database changes," RLS enabled + forced, one `SELECT` policy scoped via `(select auth.jwt()) -> 'o' ->> 'id'`, unique index on `clerk_org_id`, `updated_at` trigger
- [ ] `lib/supabase/server.ts` exists, `server-only`-guarded, uses the verified `accessToken` callback pattern
- [ ] `lib/supabase/types.ts` exists with a `Business` type matching the migration
- [ ] A pgTAP test under `supabase/tests/database/` proves cross-tenant `SELECT` isolation (Requirement 6) — **actually run and passing**, not just written (see Manual testing steps; this is the one acceptance item that depends on your environment, not mine)
- [ ] `.env.example`, `docs/security.md` §5 reflect the corrected Supabase key naming
- [ ] `docs/architecture.md` has a new "Database" section
- [ ] `npm run lint`, `npm run build`, `npx tsc --noEmit` all pass
- [ ] No `app/` route, page, or server action added
- [ ] `STATE.md` updated per its own instructions before the task is reported done

## Automated checks
```
npm run lint
npm run build
npx tsc --noEmit
```
Additionally, the tenant-isolation test itself:
```
supabase test db
```
This requires either a running local Supabase instance (`supabase start`, needs Docker) or equivalent access — **not runnable in this implementation environment** (no Docker, no linked project). Report honestly if this could not be executed and remains only written/reviewed, not verified.

## Manual testing steps
Requires: a real Supabase project, Clerk configured as its third-party auth provider (both dashboards), and either Docker (for `supabase start`) or a linked remote project — none of which this implementation can set up itself (Decision 10).
1. `supabase login` / `supabase link` to your project (or `supabase start` for local Postgres via Docker).
2. Apply the migration (`supabase db push`, or it applies automatically on `supabase start` from the `migrations/` folder) — confirm it applies cleanly with no errors, satisfying "migrations apply cleanly from scratch."
3. `supabase test db` — confirm the pgTAP tenant-isolation test passes.
4. From `psql` or the Supabase SQL editor, manually insert two `businesses` rows with different `clerk_org_id` values, then run a `select * from businesses;` as the `postgres` role (bypasses RLS, should show both) versus simulating each org's session (per Requirement 6's technique) to spot-check isolation outside the automated test too.
5. Confirm `public.businesses` is reachable via the Data API for the `authenticated` role (Supabase Dashboard → API settings) — new tables aren't always auto-exposed depending on project settings, per the `supabase` skill.

## Out of scope
- Any onboarding UI, business-creation flow, or server action that writes a `businesses` row (Phase 4)
- INSERT/UPDATE/DELETE RLS policies (Phase 4, once the creation flow's design is known)
- Products/services/FAQs tables (Phase 5)
- Generated TypeScript types via `supabase gen types` (Decision 9)
- Browser Supabase client, service-role client (Decision 7)
- Any change to `app/`
