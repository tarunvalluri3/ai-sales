# Phase 2 — Clerk authentication

## Goal
After this is implemented, Clerk is installed and configured with Organizations as the tenant boundary; a user can sign up, get routed into choosing or creating an organization, sign in, and sign out; an unauthenticated visitor cannot reach `/dashboard` by any path; and server code has a single, reliable helper for reading the authenticated identity (`userId`, `orgId`, `orgSlug`, `orgRole`). No business record, onboarding flow, or dashboard content is built — those are Phases 3/4/13.

## Current phase
Phase 2 — Clerk authentication. Confirmed from `STATE.md` §1 (Phase 1 complete, D1 resolved).

## User request
Implement Phase 2 per `docs/phases.md`. Decision D1 is resolved: Clerk Organizations is the tenant boundary. Cover Clerk installation/config, `proxy.ts` (not `middleware.ts`, per Next.js 16), sign-in/sign-up, organization creation and membership, protected routes, and authenticated server-side identity access.

## Skills and docs read
- `.claude/skills/clerk-nextjs-patterns/SKILL.md` and `references/middleware-strategies.md` — `proxy.ts` filename, public-first vs. protected-first matcher strategy, `auth()` server pattern
- `.claude/skills/clerk-orgs/SKILL.md` and `references/nextjs-patterns.md` — Membership modes, session tasks, `orgSlug`/`orgId` access, org-scoped route safety invariant
- `STATE.md` — current phase, resolved D1, planned env vars
- `docs/phases.md` — Phase 2 exit criterion and scope note ("do not build business onboarding here")
- `docs/security.md` §2 — the single server-side identity helper requirement, the "middleware is not your security boundary" rule
- `PRODUCT.md` §3 — actor model (business owner/member are both authenticated Clerk users; prospects are never authenticated)
- **Not found on disk:** `.claude/skills/clerk-setup/` exists as a directory but is empty (no `SKILL.md`, no files). Installation steps below come from `clerk-nextjs-patterns`/`clerk-orgs` content and Clerk's own package, not from a local `clerk-setup` skill — flagging this per `AGENTS.md`'s instruction to say so rather than guess.

## Existing code inspected
- `app/layout.tsx` — server component, renders `<html>`/`<body>`, no provider wrapping yet.
- `app/page.tsx` — static public placeholder, no auth-awareness.
- `app/api/health/route.ts` — public, unauthenticated by design (Phase 1).
- `lib/errors.ts`, `lib/api-response.ts` — existing server-only conventions to reuse, not replace.
- No `proxy.ts` or `middleware.ts` exists.
- `package.json` — no `@clerk/nextjs`.
- `.env.example` — already lists `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` as Phase-2 placeholders (written in Phase 0).

## Relevant existing architecture
- `docs/architecture.md`: `lib/` holds server-only modules, each starting with `import "server-only"`.
- `docs/security.md` §2: "Write a single server-side helper that returns `{ userId, businessId }` only for a validated, authorized pair, and route all business-owned data access through it." No `business_id` exists until Phase 3/4 links a Supabase business row to a Clerk org — so this phase's helper returns Clerk-level identity only (see Decision 4).
- `AGENTS.md` §2 / `docs/security.md` §2: `proxy.ts` is the Next.js 16 network-boundary file; `clerkMiddleware()` goes there; middleware is not the sole security boundary — every protected server operation must independently validate.

## Decisions and assumptions

1. **Membership mode: "Membership required."** `PRODUCT.md` §3 has no concept of a business owner or member acting outside an organization — every authenticated actor belongs to exactly one business (org) context at a time (a user *may* belong to more than one, but always acts within one). Personal accounts (no active org) don't map to anything in the product. "Membership required" forces every signed-in user through the `choose-organization` session task if they have no active org, which matches this model directly. This must be set in the Clerk Dashboard (Organizations settings) — it is account configuration, not code; the prompt implements the app-side handling (`taskUrls`, the hosted task page) assuming it's set this way.

2. **Middleware strategy: public-first.** `proxy.ts` protects `/dashboard(.*)` explicitly and leaves everything else public — the home page (`/`), `/api/health`, `/sign-in`, `/sign-up`, and the `choose-organization` session-task route all need to stay reachable without a session. This also matches the future public chat widget (Phase 11), which will need to be public too. Protected-first would require enumerating every future public route up front, which isn't knowable yet.

3. **Session task hosted at `/session-tasks/choose-organization`.** Required because Membership-required mode routes new sign-ups with no org through this task. Implemented per the `clerk-orgs` skill's documented pattern (`TaskChooseOrganization` component + `ClerkProvider taskUrls`).

4. **`lib/auth.ts` returns Clerk-level identity only — not the `{ userId, businessId }` shape from `docs/security.md` §2.** No Supabase business table exists until Phase 3, and the business/org link doesn't exist until Phase 4 (onboarding). This phase's helper (`getAuthContext()`) returns `{ userId, orgId, orgSlug, orgRole }` from a validated Clerk session, and is the foundation the Phase 3/4 helper will wrap once `business_id` resolution is possible. This is flagged explicitly so it isn't mistaken for the final tenant-scoped helper.

5. **Minimal, unstyled auth controls in `app/layout.tsx`.** `AGENTS.md` §10 reserves visual direction for the user — no design system is invented here. But sign-in/sign-up/sign-out and org switching need to be reachable to manually verify this phase, so the layout gets a plain, unstyled header: sign-in link when signed out; `UserButton` + `OrganizationSwitcher` when signed in. No new component library, no styling beyond existing Tailwind utility classes already in the codebase.

6. **`/dashboard` is a placeholder proving protection, not a real dashboard.** It renders the identity values from `getAuthContext()` as plain text so protection and identity access can be verified. Phase 13 builds the actual dashboard.

7. **Clerk Dashboard configuration (creating the Clerk application, enabling Organizations, setting Membership-required mode, obtaining the publishable/secret key pair) is a manual step outside this repo** and is not performed as part of this implementation — it requires access to your Clerk account. This prompt implements the code assuming those keys will be supplied in a local, gitignored `.env.local`. If you'd like me to run `clerk enable orgs` or other CLI-based Dashboard config via the `clerk-cli` skill once your Clerk project is linked, say so separately — that touches shared account configuration and isn't bundled into this implementation.

## Open decisions this depends on
None remaining — D1 is resolved (see `STATE.md` §4 Resolved decisions).

## Dependencies / packages required
- `@clerk/nextjs` (latest, Core 3 / v7+) — the only supported way to add Clerk to a Next.js App Router app. Not currently in `package.json`.

## Files likely to change
**Created:**
- `proxy.ts` — `clerkMiddleware()`, public-first matcher protecting `/dashboard(.*)`
- `lib/auth.ts` — `getAuthContext()` server-only helper
- `app/sign-in/[[...sign-in]]/page.tsx`
- `app/sign-up/[[...sign-up]]/page.tsx`
- `app/session-tasks/choose-organization/page.tsx`
- `app/dashboard/page.tsx` — protected placeholder

**Modified:**
- `app/layout.tsx` — wrap children in `<ClerkProvider taskUrls={{ 'choose-organization': '/session-tasks/choose-organization' }}>`, add the minimal signed-in/signed-out header from Decision 5
- `package.json` / `package-lock.json` — add `@clerk/nextjs`
- `.env.example` — annotate `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` as now required (Phase 2), not just planned
- `STATE.md` — move those two vars from "planned" to "in use" in §5, mark Phase 2 complete in §2/§1 once approved and verified, per its own update instructions

**Deleted:** None.

## Database changes
None. No Supabase table exists yet (Phase 3).

## Server / client boundaries
- `lib/auth.ts` starts with `import "server-only"`; wraps `auth()` from `@clerk/nextjs/server`, never client-importable.
- `app/dashboard/page.tsx` is a Server Component calling `getAuthContext()` directly — no client-side fetch of identity data.
- `app/layout.tsx`'s header uses Clerk's client components (`UserButton`, `OrganizationSwitcher`, sign-in link) which are safe client-side by Clerk's own design — no secret is involved.
- `CLERK_SECRET_KEY` is server-only (never referenced in a client component or `NEXT_PUBLIC_*` variable). `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is the one client-safe Clerk value, consistent with `docs/security.md` §5's table.
- `proxy.ts` runs at the edge/network boundary per Next.js 16 convention — it is not treated as the sole security boundary; `app/dashboard/page.tsx` independently calls `getAuthContext()` and redirects if unauthenticated, per `docs/security.md` §2's explicit warning.

## Implementation requirements
1. Install `@clerk/nextjs`.
2. `proxy.ts`: `clerkMiddleware()` with a route matcher protecting `/dashboard(.*)` only; the standard asset-exclusion matcher from the `clerk-nextjs-patterns` skill for `config.matcher`.
3. `app/layout.tsx`: wrap the existing `<html>/<body>` structure in `<ClerkProvider>` with `taskUrls={{ 'choose-organization': '/session-tasks/choose-organization' }}`. Add a minimal header: signed-out state shows a plain link/button to `/sign-in`; signed-in state shows `<OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/dashboard" afterCreateOrganizationUrl="/dashboard" />` and `<UserButton />`. Use Clerk's own conditional-rendering primitive (`<Show when="signed-in">` / `when="signed-out"`, or the SDK's equivalent for the installed version) rather than hand-rolled auth checks in a client component.
4. `app/sign-in/[[...sign-in]]/page.tsx` and `app/sign-up/[[...sign-up]]/page.tsx`: render Clerk's `<SignIn />` / `<SignUp />` components, catch-all route per Clerk's documented Next.js App Router pattern.
5. `app/session-tasks/choose-organization/page.tsx`: render `TaskChooseOrganization` with `redirectUrlComplete="/dashboard"`, per the `clerk-orgs` skill pattern.
6. `lib/auth.ts`: `import "server-only"`. Export an async `getAuthContext()` that calls `await auth()` from `@clerk/nextjs/server` (Core 3, per the pinned `@clerk/nextjs` install in Dependencies) and returns `{ userId, orgId, orgSlug, orgRole }` when `isAuthenticated` is `true`, or `null` otherwise. Do not throw; let callers decide whether to `redirect()`.
7. `app/dashboard/page.tsx`: Server Component. Call `getAuthContext()`. If `null`, `redirect('/sign-in')` (defense in depth — `proxy.ts` should already have blocked this, but per `docs/security.md` §2 this page must not rely on that alone). If non-null but `orgId` is missing, this shouldn't normally happen under Membership-required mode, but handle it by rendering a plain message directing the user to select an organization (do not crash). Otherwise render `userId`, `orgId`, `orgSlug`, `orgRole` as plain text.
8. Do not touch `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, or `postcss.config.mjs`.
9. Do not create any business, product, service, FAQ, or dashboard-content route — only the placeholder in requirement 7.

## Security requirements
- Reference `docs/security.md` §2 in full: Clerk is the identity source of truth; `proxy.ts` is not the sole security boundary; every protected server operation independently validates.
- No secret (`CLERK_SECRET_KEY`) is referenced from any client component or `NEXT_PUBLIC_*` variable — verify by grep before reporting done.
- `getAuthContext()` never accepts a client-supplied identity value; it only reads from the validated Clerk session via `auth()`.
- `/api/health` remains unauthenticated and untouched — Phase 2 does not change its behavior.

## Error handling
- Unauthenticated visitor requests `/dashboard` directly → `proxy.ts` redirects to Clerk's sign-in flow (or the configured sign-in URL) before the page renders; if that somehow fails, the page-level `getAuthContext()` check redirects to `/sign-in` as a second layer.
- Authenticated user with no active org hits `/dashboard` → handled per Requirement 7 (informational message, no crash) — expected to be rare under Membership-required mode since the session task should have already routed them to org selection.
- Clerk provider/network failure (e.g. misconfigured keys) → surfaces as Clerk's own error UI; this phase does not add custom handling beyond what Clerk provides, since inventing a fallback for a misconfigured third-party auth provider is out of scope.

## Acceptance criteria
- [ ] `@clerk/nextjs` present in `package.json`/`package-lock.json`
- [ ] `proxy.ts` exists, protects `/dashboard(.*)`, leaves `/`, `/api/health`, `/sign-in`, `/sign-up`, `/session-tasks/choose-organization` reachable unauthenticated
- [ ] `lib/auth.ts` exists, `server-only`-guarded, exports `getAuthContext()`
- [ ] `app/dashboard/page.tsx` independently redirects unauthenticated visitors even if hit directly
- [ ] Sign-up → routed to choose/create an organization → lands on `/dashboard` showing correct `userId`/`orgId`/`orgSlug`/`orgRole`
- [ ] Sign-out from `/dashboard` returns the visitor to an unauthenticated state and `/dashboard` becomes unreachable again
- [ ] No `CLERK_SECRET_KEY` reference in any client component or `NEXT_PUBLIC_*` variable (verified by grep)
- [ ] `.env.example` reflects the two Clerk vars as required for this phase
- [ ] `npm run lint`, `npm run build`, `npx tsc --noEmit` all pass
- [ ] No business/product/dashboard-content feature introduced
- [ ] `STATE.md` updated per its own instructions before the task is reported done

## Automated checks
```
npm run lint
npm run build
npx tsc --noEmit
```
`npm test` not applicable — no test runner exists yet. Tenant-isolation tests are not applicable yet — no business-owned data access exists until Phase 3, so there is nothing to isolate. (Clerk-level org isolation itself is Clerk's responsibility, not something this repo tests.)

## Manual testing steps
Requires real Clerk keys in a local, gitignored `.env.local` (see Decision 7) — these cannot be provided by the implementation itself.
1. `npm run dev`. In an incognito/private browser window, visit `http://localhost:3000/dashboard` while signed out → confirm redirect to sign-in, dashboard content never renders.
2. Sign up as a new user → confirm you're routed through organization choice/creation (Membership-required task) → confirm you land on `/dashboard` and it shows your `userId`, the new `orgId`, and `orgSlug`.
3. From `/dashboard`, use `UserButton` to sign out → confirm you're signed out and `/dashboard` immediately becomes unreachable again (retry step 1).
4. Sign back in as the same user → confirm `/dashboard` shows the same `orgId`/`orgSlug` as before (session round-trips correctly).
5. **Negative case:** while signed out, `curl -i http://localhost:3000/dashboard` → confirm an HTTP redirect (not a 200 with page content).
6. Confirm `http://localhost:3000/` and `http://localhost:3000/api/health` remain reachable while signed out.

## Out of scope
- Creating a Supabase `business` table or linking it to a Clerk org (Phase 3/4)
- Business onboarding flow beyond what authentication itself requires (Phase 4)
- Role/permission-based UI gating beyond what's needed to prove sign-in works (Phase 13+, as dashboard areas are built)
- Any dashboard content beyond the identity-echoing placeholder (Phase 13)
- Rate limiting, abuse protection (Phase 11 for the public chat endpoint)
- Enterprise SSO, invitations UI, custom roles (not required by the exit criterion; add only if you ask for it)
