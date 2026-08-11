# STATE.md

**Read this file first, at the start of every task.** It is the source of truth for where the project stands. Never infer the current phase from the codebase.

Last updated: 2026-08-11

---

## 1. Current phase

**Phase 3 — Supabase + PostgreSQL foundation**

Implemented; **pending your verification.** No Docker/Supabase CLI access in the implementation environment, so the migration was never applied and the tenant-isolation test was never run by the agent — see §8 for exactly what's verified vs. not. Phase 2 is complete, see §2.

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

### Phase 3 — Supabase + PostgreSQL foundation — implemented 2026-08-11, pending user verification
- What exists now: `supabase/` scaffold (`supabase init`) with `[auth.third_party.clerk]` enabled in `config.toml` (domain observed live during Phase 2 testing — confirm against your Clerk Dashboard). Migration `supabase/migrations/20260811124354_create_businesses_table.sql` creates `public.businesses` (`id uuid pk`, `clerk_org_id text` unique-indexed, `name`, `created_at`/`updated_at` with an update trigger), enables + forces RLS, grants `SELECT` to `authenticated` (required in addition to RLS — new tables aren't auto-exposed to Data API roles by default), and a policy scoping `SELECT` to the caller's Clerk org via `(select auth.jwt()) -> 'o' ->> 'id'` (current Clerk v2 claim shape, not the deprecated flat `org_id`). `lib/supabase/server.ts` exports `createServerSupabaseClient()` (server-only, per-request client using Supabase's native third-party-auth `accessToken` callback wired to Clerk). `lib/supabase/types.ts` has a hand-written `Business` type. A pgTAP tenant-isolation test exists at `supabase/tests/database/001_businesses_tenant_isolation.sql`.
- Key files: `supabase/config.toml`, `supabase/migrations/20260811124354_create_businesses_table.sql`, `supabase/tests/database/000_setup.sql`, `supabase/tests/database/001_businesses_tenant_isolation.sql`, `lib/supabase/server.ts`, `lib/supabase/types.ts`.
- Migrations applied: **written, not applied by the agent** — no Docker/Supabase CLI project access in this environment. User will apply via `supabase link` + `supabase db push` against the real project.
- Env vars added: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — now required (see §5). `SUPABASE_SECRET_KEY` still planned, not required (no privileged-access code yet).
- Decisions made this phase: imperative migrations, not declarative; UUID primary key per `docs/security.md` §3 (declined the best-practices skill's UUIDv7/bigint suggestion — table is low-cardinality); "membership link" = `businesses.clerk_org_id`, no separate members table (Clerk owns membership); SELECT-only RLS policy this phase (no INSERT/UPDATE path exists until Phase 4's onboarding flow); Clerk JWT claims read as `o.id`/`sub` (verified current v2 shape, not deprecated flat `org_id`); pgTAP test uses manual `set_config`/`set local role` simulation, not `basejump`'s `tests.authenticate_as()` (that helper targets Supabase's own `auth.users` model, doesn't fit Clerk third-party claims); no browser or service-role Supabase client yet; Supabase env var naming corrected to current `publishable`/`secret` key system in `.env.example` and `docs/security.md` §5 (legacy `anon`/`service_role` naming is being deprecated by Supabase by end of 2026) — full reasoning in `prompts/phase-3-supabase-postgres-foundation.md`.
- Known gaps carried forward: see §8 — tenant-isolation verification method, and the unconfirmed `auth.jwt()`/`request.jwt.claims` mechanism underlying the pgTAP test.

---

## 3. Next up

Phase 4 — Business onboarding, once you confirm Phase 3's migration and tenant-isolation verification succeeded.

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

Migrations applied: _none by the agent_ — `supabase/migrations/20260811124354_create_businesses_table.sql` is written and pending your `supabase db push`.

Tables: `public.businesses` (pending apply) — `id`, `clerk_org_id` (unique), `name`, `created_at`, `updated_at`; RLS enabled + forced, one `SELECT` policy scoped to the caller's Clerk org.

---

## 7. Approved prompts

| Prompt file | Phase | Status |
|---|---|---|
| `prompts/phase-0-foundation.md` | 0 | implemented |
| `prompts/phase-1-application-architecture.md` | 1 | implemented |
| `prompts/phase-2-clerk-authentication.md` | 2 | implemented |
| `prompts/clerk-resource-based-auth.md` | — (Phase 2 cleanup) | implemented |
| `prompts/phase-3-supabase-postgres-foundation.md` | 3 | implemented |

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

**Phase 3 exit criterion (docs/phases.md) — implementation done, verification split between agent and user:**
- `npm run lint`, `npm run build`, `npx tsc --noEmit` — all pass (this is pure TypeScript; it does not touch the database).
- **"Migrations apply cleanly from scratch" and "a tenant-isolation test proves Business A cannot read Business B's rows" — NOT verified by the agent.** This environment has no Docker and no linked Supabase project, so `supabase db push`/`supabase test db` were never run here. Per your instruction, verification is happening on your side via `supabase link` + `supabase db push` against the real project, plus the manual SQL-editor spot-check (two rows, two simulated sessions) from the prompt's manual testing steps 1–4 — **not** the automated `supabase test db` pgTAP run, which remains written and reviewed but unexecuted. Please report back whether both the migration applied cleanly and the cross-tenant SELECT was actually blocked before this phase is treated as done.
- The `set_config('request.jwt.claims', ...)` + `set local role authenticated` technique the pgTAP test relies on is extremely standard Supabase practice but was **not independently confirmed against this project's actual `auth.jwt()` definition** during research (see the prompt's "Not independently confirmed" note). If you do run `supabase test db` at some point, treat a failure there as "go verify the claims-simulation technique," not necessarily "the RLS policy is wrong."
- `businesses`' reachability via the Data API for the `authenticated` role (the explicit `GRANT` in the migration) is also unverified — worth confirming in the same pass.

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
