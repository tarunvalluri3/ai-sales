# STATE.md

**Read this file first, at the start of every task.** It is the source of truth for where the project stands. Never infer the current phase from the codebase.

Last updated: 2026-08-11

---

## 1. Current phase

**Phase 5 — Products / Services / FAQs**

Phase 4 (Business onboarding) is complete and fully verified by the user — see §2. No prompt written yet for Phase 5; hold off per explicit user instruction until asked. Per `docs/phases.md`: business-owned structured knowledge (products, services, FAQs), CRUD, validation, tenant isolation, and these records must be reachable by retrieval later (Phase 6+). Per `docs/phases.md`'s exit criterion, isolation tests are required for every new table this phase adds.

---

## 2. Completed phases

### Phase 0 — Project foundation — completed 2026-08-11
- What exists now: `create-next-app` boilerplate replaced (metadata, home page); `.env.example` documenting the full planned core env var set (no real values); `docs/architecture.md` documenting the no-`src/` layout, `lib/` server-only convention, validation convention (deferred), and error-handling convention; `lib/errors.ts` (`AppError` + `logAndGetUserMessage`), server-only-guarded.
- Key files: `app/layout.tsx`, `app/page.tsx`, `.env.example`, `docs/architecture.md`, `lib/errors.ts`.
- Migrations applied: none.
- Env vars added: none actually wired — `.env.example` documents the planned set only; still none required by any implemented phase.
- Decisions made this phase: kept top-level `app/` (no `src/`); deferred installing Zod to Phase 1 (no runtime boundary exists yet — see `prompts/phase-0-foundation.md` "Decisions and assumptions" for full reasoning); added `server-only` package now since it has an immediate use (`lib/errors.ts`) and directly serves the phase's server/client-boundary goal; `eslint.config.mjs` updated (trivial-change exemption) to ignore `.agents/**` and `.claude/**` so lint reflects application code only.
- Known gaps carried forward: none.

### Phase 1 — Next.js application architecture — completed 2026-08-11
- What exists now: `GET /api/health` — a real, permanent (not disposable) health-check route handler validating an optional `verbose` query param with Zod, returning a typed JSON success shape via a shared response helper, and a controlled 400/500 JSON error shape on failure, with no internal detail leaked. `lib/api-response.ts` (`jsonSuccess`/`jsonError`) establishes the shared response-envelope convention for all future route handlers. `docs/architecture.md` gained a "Route handler conventions" section and its Validation section now reflects Zod as installed.
- Key files: `app/api/health/route.ts`, `lib/api-response.ts`, `docs/architecture.md`.
- Migrations applied: none.
- Env vars added: none.
- Decisions made this phase: `/api/health` chosen as the vehicle proving the route-handler/validation/error pattern (legitimate permanent infra, not product logic); query params read via `request.nextUrl.searchParams`, not `new URL(request.url)`; no `error.tsx`/`loading.tsx` added (no page yet fetches data or can fail) — see `prompts/phase-1-application-architecture.md` for full reasoning.
- Known gaps carried forward: none.

### Phase 2 — Clerk authentication — completed 2026-08-11
- What exists now: Clerk installed with Organizations as the tenant boundary. `proxy.ts` (Next.js 16 network-boundary file, not `middleware.ts`) protects `/dashboard(.*)` via `clerkMiddleware()`; everything else (`/`, `/api/health`, `/sign-in`, `/sign-up`, `/session-tasks/choose-organization`) stays public. `lib/auth.ts` exports `getAuthContext()` — a `server-only` helper returning Clerk-level identity (`userId`, `orgId`, `orgSlug`, `orgRole`) from a validated session; it does **not** resolve `business_id` (no Supabase business table exists until Phase 3/4). `app/dashboard/page.tsx` is a placeholder that independently redirects unauthenticated visitors via `getAuthContext()` (defense in depth, not relying on `proxy.ts` alone). `app/layout.tsx` wraps the app in `ClerkProvider` with `taskUrls` for the `choose-organization` session task, and adds a minimal unstyled header (sign-in link when signed out; `OrganizationSwitcher` + `UserButton` when signed in).
  **Superseded same day** by `prompts/clerk-resource-based-auth.md`: `proxy.ts` no longer does path-based protection (bare `clerkMiddleware()` now), and `lib/auth.ts`'s helper was renamed `getAuthContext()` → `requireAuthContext()`, now wrapping `auth.protect()`. See that prompt's own entry below.
- Key files: `proxy.ts`, `lib/auth.ts`, `app/layout.tsx`, `app/dashboard/page.tsx`, `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx`, `app/session-tasks/choose-organization/page.tsx`.
- Migrations applied: none.
- Env vars added: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — now actually required (see §5). A local `.env.local` with real values already exists (gitignored, verified not to contain a placeholder — confirmed working via a live redirect to a Clerk `accounts.dev` instance during manual testing).
- Decisions made this phase: Membership mode = "Membership required" (Clerk Dashboard setting, not code — assumed set); middleware strategy = public-first, protecting only `/dashboard(.*)`; `lib/auth.ts` deliberately scoped to Clerk-level identity only, not the full `{ userId, businessId }` helper from `docs/security.md` §2 (that lands once Phase 3/4 links a business to an org) — see `prompts/phase-2-clerk-authentication.md` for full reasoning on all seven decisions.
- Known gaps carried forward: none — the `createRouteMatcher` deprecation was resolved same day, see next entry.

### Clerk resource-based auth migration — completed 2026-08-11
- What exists now: `proxy.ts` reduced to bare `clerkMiddleware()` (context-establishment only, no path-based protection); `lib/auth.ts`'s helper renamed `getAuthContext()` → `requireAuthContext()`, now wrapping `auth.protect()` (redirects unauthenticated document requests to sign-in; would 404 non-document requests, per Clerk's documented behavior — not yet exercised, no protected Route Handler exists); `app/dashboard/page.tsx` calls `requireAuthContext()` directly instead of a manual null-check + `redirect()`. `docs/architecture.md` gained an "Authentication" section documenting this as the pattern for all future protected pages/routes/actions.
- Key files: `proxy.ts`, `lib/auth.ts`, `app/dashboard/page.tsx`, `docs/architecture.md`.
- Migrations applied: none.
- Env vars added: none.
- Decisions made this phase: kept `proxy.ts` (still required to establish auth context) rather than deleting it; did not add a non-throwing/nullable identity variant since nothing needs one yet — see `prompts/clerk-resource-based-auth.md`.
- Known gaps carried forward: none.

### Phase 3 — Supabase + PostgreSQL foundation — completed 2026-08-11, fully verified
- What exists now: `supabase/` scaffold (`supabase init`) with `[auth.third_party.clerk]` enabled in `config.toml` (domain observed live during Phase 2 testing). Migration `supabase/migrations/20260811124354_create_businesses_table.sql` creates `public.businesses` (`id uuid pk`, `clerk_org_id text` unique-indexed, `name`, `created_at`/`updated_at` with an update trigger), enables + forces RLS, and a policy scoping `SELECT` to the caller's Clerk org via `(select auth.jwt()) -> 'o' ->> 'id'` (current Clerk v2 claim shape — org claims are nested under `o` (`o.id`/`o.slg`/`o.rol`), **not** the deprecated flat `org_id`/`org_slug`/`org_role`). `lib/supabase/server.ts` exports `createServerSupabaseClient()` (server-only, per-request client using Supabase's native third-party-auth `accessToken` callback wired to Clerk — this is the current, non-deprecated Clerk↔Supabase integration; the old JWT-template approach was deprecated 2025-04-01). `lib/supabase/types.ts` has a hand-written `Business` type. A pgTAP tenant-isolation test exists at `supabase/tests/database/001_businesses_tenant_isolation.sql` (written, not run — see the two grant-fix entries below for what *was* independently verified).
- Key files: `supabase/config.toml`, `supabase/migrations/20260811124354_create_businesses_table.sql`, `supabase/tests/database/000_setup.sql`, `supabase/tests/database/001_businesses_tenant_isolation.sql`, `lib/supabase/server.ts`, `lib/supabase/types.ts`.
- Migrations applied: **applied and verified by user 2026-08-11.** Migration applied cleanly; cross-tenant SELECT isolation confirmed working (Business A cannot read Business B's row) — this is the Phase 3 exit criterion from `docs/phases.md`, confirmed met.
- Env vars added: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — required since this phase (see §5). `SUPABASE_SECRET_KEY` still planned, not required (no privileged-access code yet).
- Decisions made this phase: imperative migrations, not declarative; UUID primary key per `docs/security.md` §3 (declined the best-practices skill's UUIDv7/bigint suggestion — table is low-cardinality); "membership link" = `businesses.clerk_org_id`, no separate members table (Clerk owns membership); SELECT-only RLS policy this phase (INSERT is Phase 4's job — see §1); no browser or service-role Supabase client yet (add when a real caller needs one); Supabase env var naming corrected to current `publishable`/`secret` key system in `.env.example` and `docs/security.md` §5 (legacy `anon`/`service_role` naming is being deprecated by Supabase by end of 2026) — full reasoning in `prompts/phase-3-supabase-postgres-foundation.md`.
- Known gaps carried forward: none — the two grant-hardening entries below closed the remaining gaps found after this phase.

### Tighten businesses table grants — completed 2026-08-11
- What exists now: user manually verified Data API exposure after Phase 3 and found `anon`/`authenticated` both held full CRUD plus `TRUNCATE`/`REFERENCES`/`TRIGGER` on `businesses` — broader than Phase 3's Decision 4 intended. Diagnosis: Postgres `GRANT` is additive, so Phase 3's explicit `grant select ... to authenticated` never overrode a pre-existing database-level `ALTER DEFAULT PRIVILEGES` from this project's provisioning (predating Supabase's April-2026 auto-expose opt-out default). Data was not actually exposed to unauthorized reads — RLS (enabled + forced, one `SELECT` policy) already gated `SELECT`/`INSERT`/`UPDATE`/`DELETE` regardless of the broad grants — but `TRUNCATE` bypasses RLS entirely (not a row-scoped operation), so the excess `TRUNCATE` grant was a real gap, not cosmetic. Migration `supabase/migrations/20260811145006_tighten_businesses_grants.sql` revokes all privileges from `anon` and revokes `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`REFERENCES`/`TRIGGER` from `authenticated`, leaving only the existing `SELECT` grant. `docs/architecture.md`'s "Database" section gained a note: verify actual grants after any migration that creates a table, don't assume the migration's explicit `GRANT` is the only one in effect.
- Key files: `supabase/migrations/20260811145006_tighten_businesses_grants.sql`, `docs/architecture.md`.
- Migrations applied: **applied and verified by user 2026-08-11.** Confirmed: `authenticated` has `SELECT` only, `anon` has zero grants, `TRUNCATE` is denied for both, and cross-tenant isolation still holds correctly.
- Env vars added: none.
- Decisions made this phase: scoped to `businesses` only, not a database-wide `ALTER DEFAULT PRIVILEGES` fix for future tables (separate follow-up, see next entry); `service_role` left untouched (expected to bypass RLS/hold broad privileges by design) — see `prompts/tighten-businesses-table-grants.md`.
- Known gaps carried forward: none — fully verified.

### Default privileges: least-privilege by default — completed 2026-08-11, fully verified
- What exists now: migration `supabase/migrations/20260811150450_default_privileges_least_privilege.sql` runs `alter default privileges in schema public revoke all on tables from anon, authenticated;` so every table created from here on starts with zero default grants to those roles, instead of needing the `businesses`-style fix repeated per table. Not retroactive — doesn't affect `businesses` (already fixed separately) or anything created before this migration ran. `service_role` untouched. `docs/architecture.md`'s "Database" section documents this.
- Key files: `supabase/migrations/20260811150450_default_privileges_least_privilege.sql`, `docs/architecture.md`.
- Migrations applied: **applied and verified by user 2026-08-11.** A throwaway test table created after this migration had zero `anon`/`authenticated` grants, confirming the fix applies to the role that creates tables via this project's migrations — test table then dropped (not a permanent schema object).
- Env vars added: none.
- Decisions made this phase: scoped to `public` schema, `TABLES` only — not sequences/functions/other schemas (add if the same pattern shows up elsewhere); `service_role` untouched — see `prompts/default-privileges-least-privilege.md`.
- Known gaps carried forward: none. Recommended (not required) to re-confirm with a real table at Phase 5 as further end-to-end proof, since the verification so far used a throwaway table rather than a table created by a "real" phase migration.

### Phase 4 — Business onboarding — completed 2026-08-11, fully verified
- What exists now: migration `supabase/migrations/20260811151559_add_businesses_insert_policy.sql` grants `insert` on `businesses` to `authenticated` and adds policy `businesses_insert_own_org` (org-match only, same shape as the existing `SELECT` policy — no role check in RLS, see decision below). `lib/business.ts` (server-only): `getBusinessForOrg(orgId)` and `createBusinessForOrg(orgId, name)`, both querying with an explicit `clerk_org_id` filter in addition to RLS; a duplicate insert (unique-violation, Postgres code `23505`) throws `BusinessAlreadyExistsError`, a distinct internal control-flow signal, not a user-facing `AppError`. `lib/auth.ts`'s `requireAuthContext()` gained an optional `{ role: "org:admin" }` parameter forwarded to `auth.protect()` — existing no-args call sites unaffected. `app/onboarding/page.tsx` (protected): no `orgId` → redirect to the existing choose-organization task; business already exists for the org → redirect to `/dashboard`; non-admin org member with no business → static "ask your admin" message; org admin with no business → renders `app/onboarding/onboarding-form.tsx` (client component, `useActionState`). `app/onboarding/actions.ts` (`"use server"`): Zod-validates `name` (trimmed, 2–120 chars), calls `requireAuthContext({ role: "org:admin" })`, creates the row, treats `BusinessAlreadyExistsError` as idempotent success, redirects to `/dashboard`. `app/dashboard/page.tsx` now looks up the business for the org and redirects to `/onboarding` if none exists; renders the business name instead of the old raw Clerk-field dump. pgTAP test `supabase/tests/database/002_businesses_insert_policy.sql` written (not executed — see below) asserting org A can insert its own row and cannot insert a row claiming org B.
- Key files: `supabase/migrations/20260811151559_add_businesses_insert_policy.sql`, `supabase/tests/database/002_businesses_insert_policy.sql`, `lib/business.ts`, `lib/auth.ts`, `app/onboarding/page.tsx`, `app/onboarding/onboarding-form.tsx`, `app/onboarding/actions.ts`, `app/dashboard/page.tsx`.
- Migrations applied: **applied and verified by user 2026-08-11.** Grants confirmed: `authenticated` → `SELECT, INSERT`; `anon` → none.
- Env vars added: none.
- Decisions made this phase: "owner" = the Clerk user who is `org:admin` of the org linked via `clerk_org_id` — no new `businesses` column for it, consistent with Phase 3's "Clerk owns membership" decision. The new `INSERT` RLS policy is scoped to org match only (RLS's actual job, tenant isolation); "must be an org admin to create" is enforced at the application layer via `auth.protect({ role: "org:admin" })` rather than a hand-parsed `o.rol` JWT claim whose exact string format had never been observed live — verified against the installed `@clerk/nextjs` 7.7.3 / `@clerk/shared` type definitions before implementation (not memory): the default Clerk org roles are `org:admin`/`org:member`, and `auth.protect({ role })` is a real, current overload. `businesses` gained no new columns — only `name` was in scope; a richer business-profile shape was deliberately deferred (not specified in `PRODUCT.md`). Full reasoning: `prompts/phase-4-business-onboarding.md`.
- **Manual verification confirmed by user 2026-08-11 (all steps in `prompts/phase-4-business-onboarding.md`):** org-admin create flow works end-to-end; empty-name validation blocks creation; re-visiting `/onboarding` after a business exists redirects to `/dashboard`; non-admin member sees the "ask your admin" message, not the form; negative RLS check confirmed an `authenticated` session cannot insert a row for a different org; double-submit race handled idempotently (one row, no error shown). **Direct-POST bypass (Server Action invoked outside the UI, replayed under a non-admin session) confirmed `auth.protect({ role: "org:admin" })` rejects server-side, independent of the page-level UI gate — no `businesses` row was created for the non-admin's org.** Verification method: absence of a row for that org, not an inspected response — the exact status code/response shape was observed live but not recorded, and is documented as an honest gap in `docs/architecture.md`'s Authentication section rather than guessed at. Re-run the devtools replay later if the precise shape is ever needed.
- Known gaps carried forward: `supabase test db` (pgTAP `001_businesses_tenant_isolation.sql` and `002_businesses_insert_policy.sql`) still has not been executed by anyone — same standing gap as Phase 3, superseded in practice by the manual SQL-editor/direct-POST verification above, which covers the same ground.

---

## 3. Next up

Phase 5 — Products / Services / FAQs is current (see §1). No prompt written yet — **hold off writing it until the user explicitly asks**, per direct instruction. When asked: follow the standard `AGENTS.md` §5 workflow, inspect the `businesses` table/RLS pattern from Phases 3–4 as the template for tenant-scoped CRUD, and add isolation tests for every new table per `docs/phases.md`'s Phase 5 exit criterion.

---

## 4. Open decisions

These must be resolved before the phase noted. **Do not implement past a decision's deadline phase while it is still open** — ask the user to decide first.

| # | Decision | Needed by | Status | Recommended default |
|---|---|---|---|---|
| D3 | Embedding model and vector dimension | Phase 7 | **OPEN** | Confirm the current Gemini embedding model and its output dimension from live provider docs at the start of Phase 7. Pin both here and in `.env.example` before writing the migration. Never guess the dimension. |
| D4 | Public chat widget identity mechanism | Phase 11 | **OPEN** | Per-business public widget key, resolved server-side to `business_id`, with an origin allowlist and rate limiting. See `docs/security.md` §4. |
| D5 | Approved knowledge source types for v1 | Phase 6 | **OPEN** | Start with pasted/typed text and structured records (products, services, FAQs) only. Add file upload and URL ingestion as separate, explicitly scheduled work. |
| D6 | Lead field specification | Phase 10 | **OPEN** | Define the exact lead schema in `PRODUCT.md` before Phase 10. `AGENTS.md` forbids inventing lead fields, so this must exist. |

### Resolved decisions

| # | Decision | Resolved | Outcome |
|---|---|---|---|
| D1 | Tenancy model: Clerk Organizations vs. one business per user | 2026-08-11 | **Clerk Organizations.** Multi-member businesses are already specified in `PRODUCT.md` §3, and retrofitting orgs after Phase 3's schema exists would be expensive. |
| D2 | Tenant isolation enforcement: Postgres RLS vs. application-layer only | 2026-08-11 | **Defense in depth.** RLS enabled on every business-owned table, plus mandatory `business_id` filtering in the application data-access layer, with Clerk session tokens wired into Supabase so RLS policies can see the caller. |

---

## 5. Environment variables in use

Only variables actually required by implemented phases. Keep in sync with `.env.example`.

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — client-safe. Required since Phase 2.
- `CLERK_SECRET_KEY` — **secret**, server-only. Required since Phase 2.

- `NEXT_PUBLIC_SUPABASE_URL` — client-safe. Required since Phase 3.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — client-safe. Required since Phase 3.

Still planned, not yet required (see `docs/security.md` §5):
`SUPABASE_SECRET_KEY`, `GOOGLE_API_KEY`, `GEMINI_CHAT_MODEL`, `GEMINI_EMBEDDING_MODEL`

---

## 6. Database state

Migrations applied and verified (2026-08-11):
1. `supabase/migrations/20260811124354_create_businesses_table.sql` — creates `public.businesses`, RLS, SELECT policy.
2. `supabase/migrations/20260811145006_tighten_businesses_grants.sql` — revokes excess `anon`/`authenticated` grants on `businesses` down to `authenticated: SELECT` only.
3. `supabase/migrations/20260811150450_default_privileges_least_privilege.sql` — `ALTER DEFAULT PRIVILEGES` so future tables in `public` no longer inherit broad grants automatically.
4. `supabase/migrations/20260811151559_add_businesses_insert_policy.sql` — grants `insert` on `businesses` to `authenticated`; adds policy `businesses_insert_own_org` (org-match only, same shape as the `SELECT` policy).

Tables: `public.businesses` — columns `id` (uuid pk), `clerk_org_id` (text, unique), `name`, `created_at`, `updated_at` (auto-maintained via trigger). RLS enabled + forced. Two active policies: `SELECT` for `authenticated` (scoped to `clerk_org_id = (select auth.jwt()) -> 'o' ->> 'id'`) and `INSERT` for `authenticated` (same org-match condition via `with check`). Grants: `authenticated` = `SELECT, INSERT`; `anon` = none; `service_role` = default (bypasses RLS, unrestricted, as intended). Rows now exist as real businesses are created through the onboarding flow.

No other tables exist.

---

## 7. Approved prompts

| Prompt file | Phase | Status |
|---|---|---|
| `prompts/phase-0-foundation.md` | 0 | implemented |
| `prompts/phase-1-application-architecture.md` | 1 | implemented |
| `prompts/phase-2-clerk-authentication.md` | 2 | implemented |
| `prompts/clerk-resource-based-auth.md` | — (Phase 2 cleanup) | implemented |
| `prompts/phase-3-supabase-postgres-foundation.md` | 3 | implemented |
| `prompts/tighten-businesses-table-grants.md` | — (Phase 3 fix) | implemented |
| `prompts/default-privileges-least-privilege.md` | — (Phase 3 fix) | implemented |
| `prompts/phase-4-business-onboarding.md` | 4 | implemented |

Status values: `draft` · `approved` · `implemented` · `superseded`

---

## 8. Known limitations / debt

- `npm run build` and `npx tsc --noEmit` pass cleanly as of Phase 1.
- `npm run lint` previously reported 15 errors / 304 warnings, all inside `.agents/` and `.claude/` skill-package files (not application code). Fixed 2026-08-11 under the trivial-change exemption: `eslint.config.mjs` now ignores `.agents/**` and `.claude/**` (they are skill packages, not app code, and were never intended to be linted as part of this project). `npm run lint` reports zero errors and zero warnings across the whole repo.

**Phase 0 exit criteria (docs/phases.md) — all met:**
- `npm run lint` passes on a clean checkout — confirmed, zero errors/warnings.
- `npm run build` passes — confirmed.
- `.env.example` exists — confirmed.
- Folder conventions are documented — confirmed, `docs/architecture.md`.

**Phase 1 exit criterion (docs/phases.md) — met:**
- A request flows through a route handler with validated input, a typed result, and a controlled error response — confirmed via `GET /api/health`: valid requests return HTTP 200 with a typed JSON body; an invalid `verbose` value returns HTTP 400 with a safe error body containing no leaked internals (manually verified with curl, see prompt's manual testing steps).

**Phase 2 exit criterion (docs/phases.md) — met:**
- An unauthenticated visitor cannot reach `/dashboard` by any path — verified: `curl -i http://localhost:3000/dashboard` while signed out returns `307` redirecting to the Clerk-hosted sign-in URL. Server code reliably obtains the authenticated identity via `lib/auth.ts`'s `requireAuthContext()`.
- **Signed-in click-through confirmed by user 2026-08-11:** `/dashboard` renders the correct `userId`/`orgId`/`orgSlug` for a real test account, both before and after the resource-based auth migration below.
- **Resolved 2026-08-11** (`prompts/clerk-resource-based-auth.md`): Clerk's `createRouteMatcher` deprecation warning is gone. `proxy.ts` now only runs bare `clerkMiddleware()` (no path-based protection); `lib/auth.ts`'s `requireAuthContext()` wraps `auth.protect()` and is called directly in `app/dashboard/page.tsx`, matching Clerk's current recommended pattern. Redirect behavior for unauthenticated visitors confirmed unchanged (same sign-in URL as before). `docs/architecture.md` gained an "Authentication" section documenting the per-resource pattern, including the document-vs-non-document (redirect vs. 404) behavior difference Phase 11 will need.

**Phase 3 exit criterion (docs/phases.md) — met and fully verified (by user, not the agent — this implementation environment has no Docker/Supabase CLI project access):**
- Migration applied cleanly from scratch. ✓
- Tenant-isolation proven: Business A cannot read Business B's row. ✓ (verified via `supabase link` + `supabase db push` + a manual SQL-editor spot-check — two rows, two simulated Clerk-org sessions — not the automated `supabase test db` pgTAP run, which remains written but never executed by anyone.)
- Data API reachability for `authenticated` confirmed working. ✓
- Grants hardened to least privilege and re-verified twice (see the two grant-fix entries in §2): `authenticated` = `SELECT` only, `anon` = none, `TRUNCATE` denied for both, isolation still holds after tightening, and a throwaway table proved the schema-wide default-privileges fix applies to future tables too.
- **Still genuinely unconfirmed (low-stakes, not blocking):** the exact internal mechanism pgTAP's `001_businesses_tenant_isolation.sql` assumes (`auth.jwt()` reading `request.jwt.claims` via `set_config`) was never independently verified against this project's live instance, because the manual SQL-editor spot-check was used instead of running that test file. If `supabase test db` is ever run and that specific test fails, treat it as "go verify the claims-simulation technique in that file," not "the RLS policy itself is wrong" — the policy is proven correct by the manual verification above, independent of whether that particular test file works.

**Phase 4 exit criterion (docs/phases.md) — met and fully verified by user 2026-08-11:**
"A new user can go from sign-up to an owned business record with no manual database work." ✓ Confirmed end-to-end: org-admin create flow, empty-name validation, re-onboarding redirect, non-admin "ask your admin" gate, negative RLS insert check, double-submit race handling, and a direct-POST Server Action bypass (replayed under a non-admin session, outside the UI) all passed — see the Phase 4 entry in §2 for the full list. The role-check behavior of `auth.protect({ role: "org:admin" })` for an authenticated-but-unauthorized Server Action caller, previously only type-verified, is now confirmed live: it rejects server-side and no `businesses` row was created for the non-admin's org. Exact observed status/response recorded in `docs/architecture.md`'s Authentication section.

---

## How to update this file

At the end of every implementation, the agent must:

1. Move the phase entry into §2 if the phase is complete, and update §1 and §3.
2. Add any new env vars to §5 and migrations/tables to §6.
3. Update the prompt's status in §7.
4. Record any decision that got resolved, and any new decision that got deferred, in §4.
5. Add anything knowingly left unfinished to §8.
6. Update the "Last updated" date at the top.

If the agent implemented something but did not update this file, the work is not finished.
