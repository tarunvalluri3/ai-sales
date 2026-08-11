# STATE.md

**Read this file first, at the start of every task.** It is the source of truth for where the project stands. Never infer the current phase from the codebase.

Last updated: 2026-08-11

---

## 1. Current phase

**Phase 3 — Supabase + PostgreSQL foundation**

Phase 2 is complete — its exit criterion in `docs/phases.md` confirmed met, see §2. No product features exist yet.

Resolve decision **D2** (RLS strategy) before writing migrations.

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
- Key files: `proxy.ts`, `lib/auth.ts`, `app/layout.tsx`, `app/dashboard/page.tsx`, `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx`, `app/session-tasks/choose-organization/page.tsx`.
- Migrations applied: none.
- Env vars added: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — now actually required (see §5). A local `.env.local` with real values already exists (gitignored, verified not to contain a placeholder — confirmed working via a live redirect to a Clerk `accounts.dev` instance during manual testing).
- Decisions made this phase: Membership mode = "Membership required" (Clerk Dashboard setting, not code — assumed set); middleware strategy = public-first, protecting only `/dashboard(.*)`; `lib/auth.ts` deliberately scoped to Clerk-level identity only, not the full `{ userId, businessId }` helper from `docs/security.md` §2 (that lands once Phase 3/4 links a business to an org) — see `prompts/phase-2-clerk-authentication.md` for full reasoning on all seven decisions.
- Known gaps carried forward: see §8 (Clerk's `createRouteMatcher` deprecation warning).

---

## 3. Next up

Phase 3 is now in progress (current phase, see §1). Decision D2 must be resolved first.

---

## 4. Open decisions

These must be resolved before the phase noted. **Do not implement past a decision's deadline phase while it is still open** — ask the user to decide first.

| # | Decision | Needed by | Status | Recommended default |
|---|---|---|---|---|
| D2 | Tenant isolation enforcement: Postgres RLS vs. application-layer only | Phase 3 | **OPEN** | Defense in depth: RLS enabled on every business-owned table, plus a mandatory `business_id` filter in the data-access layer. Note that the Supabase service role key bypasses RLS, so if all server access uses it, RLS protects nothing on its own. |
| D3 | Embedding model and vector dimension | Phase 7 | **OPEN** | Confirm the current Gemini embedding model and its output dimension from live provider docs at the start of Phase 7. Pin both here and in `.env.example` before writing the migration. Never guess the dimension. |
| D4 | Public chat widget identity mechanism | Phase 11 | **OPEN** | Per-business public widget key, resolved server-side to `business_id`, with an origin allowlist and rate limiting. See `docs/security.md` §4. |
| D5 | Approved knowledge source types for v1 | Phase 6 | **OPEN** | Start with pasted/typed text and structured records (products, services, FAQs) only. Add file upload and URL ingestion as separate, explicitly scheduled work. |
| D6 | Lead field specification | Phase 10 | **OPEN** | Define the exact lead schema in `PRODUCT.md` before Phase 10. `AGENTS.md` forbids inventing lead fields, so this must exist. |

### Resolved decisions

| # | Decision | Resolved | Outcome |
|---|---|---|---|
| D1 | Tenancy model: Clerk Organizations vs. one business per user | 2026-08-11 | **Clerk Organizations.** Multi-member businesses are already specified in `PRODUCT.md` §3, and retrofitting orgs after Phase 3's schema exists would be expensive. |

---

## 5. Environment variables in use

Only variables actually required by implemented phases. Keep in sync with `.env.example`.

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — client-safe. Required since Phase 2.
- `CLERK_SECRET_KEY` — **secret**, server-only. Required since Phase 2.

Still planned, not yet required (see `docs/security.md` §5):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`, `GEMINI_CHAT_MODEL`, `GEMINI_EMBEDDING_MODEL`

---

## 6. Database state

Migrations applied: _none_

Tables: _none_

---

## 7. Approved prompts

| Prompt file | Phase | Status |
|---|---|---|
| `prompts/phase-0-foundation.md` | 0 | implemented |
| `prompts/phase-1-application-architecture.md` | 1 | implemented |
| `prompts/phase-2-clerk-authentication.md` | 2 | implemented |

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
- An unauthenticated visitor cannot reach `/dashboard` by any path — verified: `curl -i http://localhost:3000/dashboard` while signed out returns `307` redirecting to the Clerk-hosted sign-in URL. Server code reliably obtains the authenticated identity via `lib/auth.ts`'s `getAuthContext()`.
- **Not independently verified end-to-end:** the full sign-up → choose/create-organization → land-on-`/dashboard`-with-correct-identity flow, and sign-out, were not driven through a real browser session in this environment (no interactive browser available here). The negative case (unauthenticated redirect) and the public-route reachability checks were verified via `curl`. Recommend you run through the full manual testing steps in `prompts/phase-2-clerk-authentication.md` yourself before treating this phase as fully verified.
- Clerk emitted a deprecation warning at dev-server startup: `createRouteMatcher` (used in `proxy.ts`) is deprecated in favor of "resource-based auth checks" (per-page/route). It still functions correctly today (confirmed by the redirect test above) and `app/dashboard/page.tsx` already does its own resource-level check via `getAuthContext()` as defense in depth, per `docs/security.md` §2's explicit warning that middleware alone isn't sufficient. No action taken this phase — noted here so future route/page additions keep including their own auth check rather than leaning on `proxy.ts` path-matching alone, and so this can be revisited before Clerk actually removes `createRouteMatcher`.

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
