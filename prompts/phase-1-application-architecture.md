# Phase 1 — Next.js application architecture

## Goal
After this is implemented, a real request can flow through a route handler with Zod-validated input, a typed success result, and a controlled (non-leaking) error response — proving out the route handler, validation, and error-handling conventions that every future phase's endpoints will follow. No product logic is added.

## Current phase
Phase 1 — Next.js application architecture. Confirmed from `STATE.md` §1 (Phase 0 is complete, all exit criteria met).

## User request
Start Phase 1 per `docs/phases.md`. Zod is installed now, per the Phase 0 decision to defer it until a real runtime boundary exists (`STATE.md` §2, `prompts/phase-0-foundation.md` "Decisions and assumptions").

## Skills and docs read
- `STATE.md` — current phase, completed Phase 0 entry, open decisions (none block Phase 1)
- `docs/phases.md` — Phase 1 exit criterion
- `PRODUCT.md` — confirmed no product logic belongs in this phase; used only to confirm scope boundaries, no feature behavior is implemented here
- `AGENTS.md` — §2 (Zod required at every runtime boundary), §9 (architecture boundaries, install a dependency only when the phase needs it, no speculative abstraction)
- `docs/architecture.md` (written in Phase 0) — folder conventions, deferred-Zod convention, error-handling convention
- No skill directories were needed (no auth, DB, or AI work in this phase)

## Existing code inspected
- `app/` — only `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`. No `app/api/` directory exists yet, no route handlers.
- `lib/errors.ts` — `AppError` (safe user message vs. internal detail) and `logAndGetUserMessage`, `server-only`-guarded. No existing response-shaping helper.
- `docs/architecture.md` — states Zod schemas will be colocated with the route handler/server action that owns the boundary, not centralized; states `lib/` holds server-only modules, each starting with `import "server-only"`.
- `package.json` — no `zod` present; confirms it needs adding.
- No `error.tsx` or `loading.tsx` exist anywhere in `app/`.

## Relevant existing architecture
- No `src/` — routes and route handlers live under top-level `app/` (Phase 0 decision).
- `lib/errors.ts` is the established error convention: never surface raw errors to the client; log internal detail server-side, return only a safe message.
- `AGENTS.md` §9: route handlers stay thin, business logic lives in services (not yet applicable — there is no business logic yet), no DB access in client components (not yet applicable — no DB exists until Phase 3).

## Decisions and assumptions

1. **What demonstrates the request flow, given "no product logic yet."** Phase 1's exit criterion requires an actual request to flow through a route handler with validated input, a typed result, and a controlled error response — but `PRODUCT.md` and `AGENTS.md` forbid building product features this early. The chosen vehicle is a **health-check endpoint**, `GET /api/health`: it is not a product feature (no business, tenant, or AI concept involved), it is genuinely useful infrastructure for later phases (Phase 18/19 monitoring, Vercel deployment health checks), and it naturally exercises every part of the required pattern: an optional `verbose` query parameter validated with Zod (demonstrating validated input and the controlled-error path when validation fails), and a typed JSON success shape (demonstrating the typed-result path). This is not disposable scaffolding — it is a legitimate, permanent endpoint.

2. **Shared response-shaping helper: `lib/api-response.ts`.** To keep future route handlers thin and consistent (AGENTS.md §9), a tiny `server-only` helper module provides `jsonSuccess<T>()` and `jsonError()` so every route handler returns responses in the same shape without repeating boilerplate. This is the "reusable server/client pattern" and "route handler convention" the phase goal calls for — kept to two small functions, no framework, no speculative options beyond what `/api/health` actually uses.

3. **No `error.tsx` / `loading.tsx` added.** Phase 1's goal says "loading and error boundaries where needed." The only page is the static Phase-0 placeholder at `app/page.tsx`, which fetches nothing and cannot error or suspend — a boundary would have no failure mode to catch. `/api/health` is a Route Handler, not a page, so React error/loading boundaries don't apply to it (it has its own try/catch → controlled JSON error response instead). None are added; this is recorded as a deliberate "not needed yet" rather than a silent omission.

4. **Zod schema colocation.** Per the Phase 0 convention in `docs/architecture.md`, the query-parameter schema for `/api/health` is defined directly in `app/api/health/route.ts`, not in a shared `lib/schemas/` file — it has exactly one consumer.

5. **Query-param access: `request.nextUrl.searchParams`, not `new URL(request.url)`.** The handler signature uses `NextRequest` (Next.js's Route Handler type), which already exposes a parsed `nextUrl`. Using it directly avoids a redundant second URL parse of the same string.

## Open decisions this depends on
None. D1–D6 in `STATE.md` §4 are all gated to Phases 2, 3, 7, 11, 6, and 10 respectively.

## Dependencies / packages required
- `zod` (latest v4) — required at every runtime boundary per `AGENTS.md` §2. Not currently in `package.json`. This is the deferred Phase 0 install, now justified by `/api/health`'s query-parameter validation, its first real consumer.

## Files likely to change
**Created:**
- `app/api/health/route.ts` — `GET` handler
- `lib/api-response.ts` — `jsonSuccess` / `jsonError` helpers, `server-only`-guarded

**Modified:**
- `package.json` / `package-lock.json` — add `zod`
- `docs/architecture.md` — add a short "Route handler conventions" section documenting the pattern `/api/health` establishes, and update the validation section to note Zod is now installed
- `STATE.md` — update per its own "How to update this file" section at the end of implementation (move Phase 1 to completed once approved, log the `zod` install against decision context, no new env vars, no DB changes)

**Deleted:** None.

## Database changes
None.

## Server / client boundaries
- `app/api/health/route.ts` is a server-only Route Handler by construction (Next.js Route Handlers never ship to the client).
- `lib/api-response.ts` starts with `import "server-only"`, consistent with every other `lib/` module, even though Route Handlers are already server-only — this keeps the convention uniform if the helper is ever imported from a server action or server component later.
- No secrets are read or exposed. No env vars are introduced.

## Implementation requirements
1. `lib/api-response.ts`: export `jsonSuccess<T>(data: T, init?: ResponseInit): Response` returning `{ ok: true, data }` as JSON, and `jsonError(message: string, status: number): Response` returning `{ ok: false, error: message }` as JSON with the given status code. Must start with `import "server-only";`.
2. `app/api/health/route.ts`: export `GET(request: NextRequest)` (import `NextRequest` from `next/server`).
   - Parse the `verbose` query parameter from `request.nextUrl.searchParams` (see Decision 5) with a Zod schema: optional, and if present must be exactly `"true"` or `"false"`.
   - On Zod validation failure, catch the `ZodError` and return `jsonError(...)` with HTTP 400, using a safe, non-leaking message (do not echo raw Zod internals to the client — summarize via `lib/errors.ts`'s convention).
   - On success, return `jsonSuccess({ status: "ok", timestamp: <ISO string>, ...(verbose === "true" ? { uptimeSeconds: process.uptime() } : {}) })` with a typed result shape (define a TypeScript type or infer it from a Zod output schema for the response body).
3. Update `docs/architecture.md` with a "Route handler conventions" section: route handlers are thin, parse/validate input with a colocated Zod schema, return responses via `lib/api-response.ts`, and convert thrown errors through `lib/errors.ts` before they reach `jsonError`. Update the existing "Validation" section's note that Zod is not yet installed — it now is, starting with this phase.
4. Do not touch `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, or `postcss.config.mjs`.
5. Do not add any business/tenant/AI-related route, type, or table. This phase proves the pipeline shape only.

## Security requirements
- Reference `docs/security.md` §7 (validate all external input with Zod) and §10 (never surface raw errors, stack traces, or internal detail to users) — `/api/health` is the first concrete application of both.
- No tenant, auth, or secret concerns apply yet (Phases 2/3 respectively) — `/api/health` is unauthenticated by design, appropriate for a health-check endpoint, and returns no business data.

## Error handling
- Invalid `verbose` value (e.g. `?verbose=maybe`) → Zod validation fails → caught → `jsonError` with HTTP 400 and a safe message (e.g. "Invalid query parameter: verbose"). No stack trace, no raw Zod error object, in the response body.
- Any unexpected thrown error inside the handler → caught by a top-level `try/catch` → logged server-side via `logAndGetUserMessage` from `lib/errors.ts` → `jsonError` with HTTP 500 and a generic safe message. No internal detail in the response body.

## Acceptance criteria
- [ ] `zod` present in `package.json` dependencies and `package-lock.json`
- [ ] `lib/api-response.ts` exists, exports `jsonSuccess` and `jsonError`, starts with `import "server-only";`
- [ ] `app/api/health/route.ts` exists, exports `GET`, validates `verbose` with Zod, returns a typed success shape
- [ ] Invalid `verbose` value returns HTTP 400 with a safe JSON error body, no leaked internals
- [ ] Valid request (no `verbose`, or `verbose=true`/`false`) returns HTTP 200 with the documented JSON shape
- [ ] `docs/architecture.md` documents the route handler convention and reflects that Zod is installed
- [ ] `npm run lint` passes with zero errors/warnings across the whole repo
- [ ] `npm run build` completes successfully
- [ ] `npx tsc --noEmit` passes
- [ ] No `error.tsx`/`loading.tsx` added (deliberate — see Decision 3)
- [ ] No product/business/tenant code introduced
- [ ] `STATE.md` updated per its own instructions before the task is reported done

## Automated checks
```
npm run lint
npm run build
npx tsc --noEmit
```
`npm test` is not applicable — no test runner exists yet. No tenant-isolation tests apply — no business-owned data access exists yet.

## Manual testing steps
1. `npm run dev`, then:
   - `curl http://localhost:3000/api/health` → expect HTTP 200, JSON `{ "ok": true, "data": { "status": "ok", "timestamp": "..." } }` (no `uptimeSeconds` since `verbose` was omitted).
   - `curl "http://localhost:3000/api/health?verbose=true"` → expect HTTP 200, same shape plus `uptimeSeconds`.
   - `curl "http://localhost:3000/api/health?verbose=false"` → expect HTTP 200, no `uptimeSeconds`.
2. **Negative case:** `curl "http://localhost:3000/api/health?verbose=maybe"` → expect HTTP 400, JSON `{ "ok": false, "error": "..." }` with a short, safe message — confirm the response body does **not** contain a Zod stack trace, internal file paths, or the word "ZodError".
3. Confirm `http://localhost:3000/` still renders the Phase 0 placeholder unchanged.

## Out of scope
- Any product, business, tenant, or AI-related route (Phases 2+)
- Authentication of any kind (Phase 2)
- Database access (Phase 3)
- Rate limiting / abuse protection (introduced properly in Phase 11 for the public-facing chat endpoint)
- `error.tsx`/`loading.tsx` UI boundaries (none needed yet — see Decision 3; revisit when a page actually fetches data)
