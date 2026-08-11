# Migrate off `createRouteMatcher` to per-resource `auth.protect()`

## Goal
After this is implemented, route protection is expressed per-resource (`auth.protect()` called directly in the protected page/route handler/server action) instead of centrally in `proxy.ts` via `createRouteMatcher`. `proxy.ts` is simplified to the bare `clerkMiddleware()` Clerk still requires. `docs/architecture.md` documents the new pattern so Phases 11 and 13 are written against it, not the deprecated one. No product features change; `/dashboard`'s protection behavior is preserved, not expanded.

## Current phase
Phase 3 — Supabase + PostgreSQL foundation (per `STATE.md` §1). This prompt is auth-pattern debt cleanup carried over from Phase 2, not Phase 3 work — it touches only what Phase 2 already built (`proxy.ts`, `lib/auth.ts`, `app/dashboard/page.tsx`) plus its own documentation. It does not start Phase 3 (no Supabase code, no migrations).

## User request
Clerk logs a deprecation warning for `createRouteMatcher` at dev-server startup (surfaced during Phase 2 manual testing). User confirmed: migrate now rather than carry the debt through three more phases, since it's cheap today (one protected resource) and gets more expensive later. Scope: `proxy.ts` simplified/removed as appropriate, `app/dashboard/page.tsx` migrated to the new pattern, and `docs/architecture.md` updated so future phases don't get written against the old pattern. Filed as its own prompt per `AGENTS.md` §5 since it touches auth and is therefore not eligible for the trivial-change exemption.

## Skills and docs read
- `https://clerk.com/docs/guides/development/upgrading/upgrade-guides/migrate-from-create-route-matcher` (fetched live) — the official migration guide. Key facts: `createRouteMatcher` will be removed in the next major version of `@clerk/nextjs` (no fixed date; "plan on your own schedule"); the replacement is calling `auth.protect()` directly inside each protected Server Component / Route Handler / Server Action; `clerkMiddleware()` and the existing `config.matcher` export in `proxy.ts` are **kept** — only the `isProtectedRoute`/`auth.protect()`-inside-middleware logic is removed.
- Installed package source (ground truth, not the docs prose): `node_modules/@clerk/nextjs/dist/types/app-router/server/auth.d.ts` and `.../server/protect.d.ts` — confirms `auth` (from `@clerk/nextjs/server`) is both callable (`auth()`) and has `auth.protect(...)`, which returns `Promise<SignedInAuthObject>` (same shape as a successful `auth()` call: `userId`, `orgId`, `orgSlug`, `orgRole`, etc.). Behavior table from the doc comment: authenticated+authorized → returns the `Auth` object; authenticated+not authorized → 404; unauthenticated → redirects to sign-in for **document** requests (pages), returns **404** (not a redirect) for **non-document** requests (Route Handlers, API calls).
- `docs/architecture.md` — current "Route handler conventions" and folder-layout sections, to extend rather than restructure.
- `STATE.md` §8 — the known-limitation entry logged during Phase 2 that this prompt resolves.
- `docs/security.md` §2 — "middleware is not your security boundary... every protected server operation must independently validate" — this migration moves the codebase *into* better alignment with that rule, not away from it.

## Existing code inspected
- `proxy.ts` — currently `clerkMiddleware(async (auth, req) => { if (isProtectedRoute(req)) await auth.protect(); })` with `createRouteMatcher(["/dashboard(.*)"])` and the standard asset-exclusion `config.matcher`.
- `lib/auth.ts` — currently exports `getAuthContext()`, which calls `await auth()` and returns `null` if `!session.isAuthenticated`, else `{ userId, orgId, orgSlug, orgRole }`. `server-only`-guarded.
- `app/dashboard/page.tsx` — currently calls `getAuthContext()`, manually `redirect("/sign-in")` if `null`, then branches on `orgId` presence.
- `app/api/health/route.ts` — intentionally public, unauthenticated; not a protected resource, unaffected by this migration.
- No other page, route handler, or server action exists yet that would need migrating (Phase 3+ hasn't started).

## Relevant existing architecture
- `docs/architecture.md` "Route handler conventions" (Phase 1) doesn't yet mention auth at all — `/api/health` is unauthenticated, so the gap was never exercised.
- `lib/auth.ts`'s Phase 2 decision (`prompts/phase-2-clerk-authentication.md`, Decision 4) already scoped it to Clerk-level identity only, not the future `{ userId, businessId }` helper — that scoping is unaffected by this migration and stays as-is.

## Decisions and assumptions

1. **`lib/auth.ts`'s `getAuthContext()` is renamed to `requireAuthContext()` and wraps `auth.protect()`, not `auth()`.** This is the one function in the codebase whose entire job is "get identity for a protected resource" — there is currently no caller that wants a non-throwing/nullable identity check, so keeping a second non-throwing variant around would be unused speculative surface (`AGENTS.md` §9: no speculative abstraction). If a future phase needs a non-throwing check, it can be added then, against a real caller.

2. **`proxy.ts` is kept, not deleted, but reduced to `export default clerkMiddleware();` with its existing `config.matcher`.** Clerk's own migration guide is explicit that `clerkMiddleware()` remains required (it establishes the auth context that `auth()`/`auth.protect()` read downstream) — only the path-matching protection logic is removed. Deleting the file entirely would break every `auth()`/`auth.protect()` call in the app.

3. **No behavior change for Route Handlers is exercised by this migration**, since `/api/health` is deliberately unauthenticated and no protected Route Handler exists yet. The 404-not-redirect distinction for non-document requests is documented in `docs/architecture.md` now so Phase 11 (chat API) is written correctly the first time, but there is nothing to migrate there today.

4. **`app/dashboard/page.tsx`'s existing `orgId`-missing handling is preserved as-is.** `auth.protect()` only guarantees authentication (and authorization, if a role/permission is passed — none is needed here since `/dashboard` has no role requirement yet); it does not guarantee an active organization. The existing plain-text "select or create an organization" branch stays.

## Open decisions this depends on
None. This doesn't touch tenancy, RLS, or any decision in `STATE.md` §4.

## Dependencies / packages required
None. `@clerk/nextjs` is already installed (Phase 2); this migration uses APIs already present in the installed version (verified above).

## Files likely to change
**Modified:**
- `proxy.ts` — remove `createRouteMatcher`/`isProtectedRoute`/the `if` guard; keep `clerkMiddleware()` and `config.matcher` unchanged.
- `lib/auth.ts` — rename `getAuthContext` → `requireAuthContext`; implementation calls `await auth.protect()` instead of `await auth()` + manual `isAuthenticated` check.
- `app/dashboard/page.tsx` — call `requireAuthContext()`; remove the manual `if (!context) redirect("/sign-in")` block and the now-unused `redirect` import (protection is handled by `auth.protect()` itself).
- `docs/architecture.md` — add an "Authentication" section: `proxy.ts` only establishes the Clerk auth context (no path-based protection); every protected Server Component/Route Handler/Server Action calls `auth.protect()` (directly, or via `lib/auth.ts`'s `requireAuthContext()` where Clerk-level identity is also needed) at the top of the resource; note the document-vs-non-document (redirect vs. 404) behavior difference for future Route Handler work.
- `STATE.md` — remove/resolve the Phase 2 known-limitation entry about the deprecation warning; record this cleanup.

**Deleted:** None.

**Created:** None.

## Database changes
None.

## Server / client boundaries
No change to the boundary model. `lib/auth.ts` remains `server-only`-guarded. `proxy.ts` and `app/dashboard/page.tsx` remain server-only by construction (middleware and Server Component respectively).

## Implementation requirements
1. `proxy.ts`: reduce to
   ```ts
   import { clerkMiddleware } from "@clerk/nextjs/server";

   export default clerkMiddleware();

   export const config = {
     matcher: [ /* unchanged from current file */ ],
   };
   ```
   Remove the `createRouteMatcher` import entirely.
2. `lib/auth.ts`: rename the export to `requireAuthContext`, keep the `AuthContext` type as-is, replace the body with `const session = await auth.protect();` followed by mapping `{ userId, orgId, orgSlug, orgRole }` from `session` (no `null` branch — `auth.protect()` throws/redirects before returning if unauthenticated, so the return type becomes non-nullable `Promise<AuthContext>`).
3. `app/dashboard/page.tsx`: replace `const context = await getAuthContext(); if (!context) redirect("/sign-in");` with `const context = await requireAuthContext();`. Remove the `redirect` import if no longer used elsewhere in the file. Keep the `!context.orgId` branch unchanged.
4. `docs/architecture.md`: add the "Authentication" section per Files-likely-to-change above, placed after "Route handler conventions" (auth applies to pages too, so it doesn't belong solely inside that section).
5. Do not touch `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `app/layout.tsx`, `app/sign-in/...`, `app/sign-up/...`, or `app/session-tasks/...` — none of these need to change for this migration.
6. Do not add role/permission checks, protect any additional route, or touch `/api/health` — out of scope.

## Security requirements
- Reference `docs/security.md` §2: this migration is a direct implementation of "every protected server operation must independently validate" — it removes the *only* layer that was central/path-based and makes the per-resource check the sole mechanism, consistent with the rule.
- No secret handling changes. No tenant scoping changes (none exists yet — Phase 3+).

## Error handling
- Unauthenticated visitor to `/dashboard` (a document request) → `auth.protect()` redirects to the sign-in flow, same observable behavior as today's manual `redirect("/sign-in")` (verify the redirect target is equivalent during manual testing — Clerk's default may differ slightly from the hardcoded path).
- No error handling changes for `/api/health` — it remains unauthenticated and untouched.

## Acceptance criteria
- [ ] `proxy.ts` no longer imports or uses `createRouteMatcher`
- [ ] `proxy.ts` still exports `clerkMiddleware()` and the existing `config.matcher`
- [ ] `lib/auth.ts` exports `requireAuthContext()` (not `getAuthContext()`), returns non-nullable `Promise<AuthContext>`, still `server-only`-guarded
- [ ] `app/dashboard/page.tsx` uses `requireAuthContext()`, has no manual null-check redirect, no unused `redirect` import
- [ ] Unauthenticated `curl -i http://localhost:3000/dashboard` still returns a redirect (not a 200, not an unhandled error)
- [ ] `docs/architecture.md` has a new "Authentication" section describing the per-resource pattern and the document-vs-non-document behavior difference
- [ ] No dev-console deprecation warning about `createRouteMatcher` on `npm run dev` startup
- [ ] `npm run lint`, `npm run build`, `npx tsc --noEmit` all pass
- [ ] `STATE.md` §8's Phase 2 deprecation-warning entry is resolved/updated
- [ ] No product feature, new route, or unrelated file touched

## Automated checks
```
npm run lint
npm run build
npx tsc --noEmit
```
No new tests apply — no business-owned data access exists yet.

## Manual testing steps
1. `npm run dev`. Confirm the startup log no longer prints the `createRouteMatcher` deprecation warning.
2. Signed out: `curl -i http://localhost:3000/dashboard` → confirm an HTTP redirect (3xx) to a sign-in URL, same as the Phase 2 behavior (verify the target URL is equivalent/acceptable, not necessarily byte-identical).
3. Signed out, in a browser: visit `/dashboard` → confirm redirect to sign-in renders correctly (not a raw error page).
4. Sign in with an existing test account (from Phase 2 manual testing) that has an active organization → visit `/dashboard` → confirm it renders `userId`/`orgId`/`orgSlug`/`orgRole` exactly as before.
5. Confirm `http://localhost:3000/`, `http://localhost:3000/api/health`, `/sign-in`, `/sign-up` remain reachable signed out (unchanged from Phase 2).

## Out of scope
- Any Phase 3 (Supabase) work
- Adding `auth.protect()` to `/api/health` or any new route (none exist to protect yet)
- Role/permission-gated protection (`auth.protect({ role })`) — not needed until a route actually requires it
- A non-throwing/nullable identity check variant — add only when a real caller needs one
