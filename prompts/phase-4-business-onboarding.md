# Phase 4 — Business onboarding

## Goal
After this is implemented, a signed-in Clerk organization admin who has no
`businesses` row yet can visit an onboarding flow, submit a business name,
and have a `businesses` row created and correctly scoped to their Clerk
organization — with no manual database work. The dashboard becomes
reachable only once that row exists, and redirects to onboarding when it
doesn't.

## Current phase
Phase 4 — Business onboarding. Confirmed from `STATE.md` §1.

## User request
"Read STATE.md, then AGENTS.md, then PRODUCT.md. We're starting Phase 4 —
Business onboarding. Write the implementation prompt per docs/phases.md,
then stop for approval."

## Skills and docs read
- `STATE.md` (full) — current phase, Phase 3 grants lessons, D1/D2 resolved,
  no other open decision blocks this phase.
- `AGENTS.md` (full) — five rules, prompt-first workflow, checks, report
  format.
- `PRODUCT.md` (full) — actors (§3), target workflow (§5): "completes
  onboarding, business record created, user linked as owner."
- `docs/phases.md` — Phase 4 entry: "must create the business record and
  correctly associate the authenticated user as its owner... exact fields
  are decided in this phase's prompt... Exit: a new user can go from
  sign-up to an owned business record with no manual database work."
- `docs/security.md` (full) — §1 multi-tenancy, §2 authentication ("write a
  single server-side helper... route all business-owned data access
  through it"), §3 database/RLS.
- `docs/architecture.md` (full) — route handler conventions, Zod
  colocation convention, Authentication section (notes `auth.protect()`
  accepts a role check, "not needed yet, add when a route actually
  requires it" — this phase is that route), Database section (grants
  lesson, RLS claim shape).
- `docs/prompt-template.md` — this file's own structure.
- No skill referenced beyond what's listed in `AGENTS.md` §6 was needed;
  no missing file encountered.

## Existing code inspected
- `supabase/migrations/20260811124354_create_businesses_table.sql` —
  `businesses` has `id`, `clerk_org_id` (unique), `name`, timestamps. RLS
  enabled + forced. Only a `SELECT` policy exists, scoped to
  `clerk_org_id = (select auth.jwt()) -> 'o' ->> 'id'`. `grant select ...
  to authenticated` only — no `INSERT` grant or policy.
- `lib/auth.ts` — `requireAuthContext()` wraps `auth.protect()` with no
  options, returns `{ userId, orgId, orgSlug, orgRole }`. Clerk-level
  identity only.
- `lib/supabase/server.ts` — `createServerSupabaseClient()`, per-request,
  server-only, RLS-authenticated via Clerk's `accessToken` callback.
- `lib/supabase/types.ts` — hand-written `Business` type matching the
  migration exactly.
- `lib/api-response.ts`, `lib/errors.ts` — `jsonSuccess`/`jsonError`
  envelope (route-handler convention) and `AppError`/
  `logAndGetUserMessage` (safe user-facing errors, logged server-side).
  Not directly reused here since this phase uses a Server Action, not a
  route handler, but `AppError`/`logAndGetUserMessage` still apply.
- `app/dashboard/page.tsx` — protected page, calls `requireAuthContext()`,
  shows a "select or create an organization" message when `orgId` is
  missing, otherwise dumps raw Clerk identity fields as a placeholder. No
  business lookup exists yet.
- `app/session-tasks/choose-organization/page.tsx` — Clerk's
  `TaskChooseOrganization` component, `redirectUrlComplete="/dashboard"`.
- `app/layout.tsx` — `ClerkProvider` with the choose-organization task URL
  wired, header with `OrganizationSwitcher`/`UserButton`
  (`afterCreateOrganizationUrl="/dashboard"`, `afterSelectOrganizationUrl="/dashboard"`).
- `supabase/tests/database/001_businesses_tenant_isolation.sql` — existing
  pgTAP pattern for simulating two Clerk-org sessions via
  `set_config('request.jwt.claims', ...)` + `set local role authenticated`.
  This phase follows the same pattern for the new `INSERT` policy test.

## Relevant existing architecture
- No ORM; hand-authored imperative Supabase migrations
  (`supabase migration new <name>`).
- RLS-first tenant isolation (D2) plus an application-layer filter as
  defense in depth (`docs/security.md` §3) — every business-owned query
  must carry an explicit `clerk_org_id`/`business_id` filter in the query
  itself, not rely on RLS alone.
- New tables/grants are not auto-exposed — every privilege the app needs
  must be an explicit `grant` in the migration, and grants must be
  manually re-verified after applying (`STATE.md` §1, `docs/architecture.md`
  Database section) — this phase adds an `INSERT` grant, not a new table,
  so the default-privileges fix from Phase 3 does not need to be revisited,
  but the new grant itself still needs a post-apply check.
- Server Actions and Route Handlers are non-document requests: an
  unauthenticated caller gets a `404`, not a redirect
  (`docs/architecture.md` Authentication section).
- Zod schemas are colocated with the boundary they validate, not
  centralized, unless shared by more than one boundary.
- Errors never reach the client raw; convert through `AppError`/
  `logAndGetUserMessage`.

## Decisions and assumptions

1. **Fields for this phase: `name` only.** `businesses` already has `id`,
   `clerk_org_id`, `name`, timestamps from Phase 3. `PRODUCT.md` does not
   specify a richer v1 business-profile shape, and `docs/phases.md`
   explicitly assigns exact-field decisions to this phase's prompt. Adding
   speculative profile fields (address, industry, description, etc.) here
   would be unrequested scope — defer to whichever phase first needs them
   (candidate: Phase 13 dashboard, or a dedicated profile phase if the user
   asks for one). No migration changes the `businesses` table shape.

2. **No new "owner" column.** Phase 3 already decided membership is Clerk's
   job, not a separate table (`STATE.md` §2, Phase 3 entry). "Owner" is
   modeled as: the Clerk user who is an `org:admin` of the org linked via
   `clerk_org_id`. Creating a Clerk organization automatically makes the
   creator its admin, so "associate the authenticated user as owner" is
   satisfied by Clerk itself once the `businesses` row exists — no new
   schema is needed to record it separately.
   **Flag for `STATE.md`:** this is a real modeling decision (owner =
   Clerk org admin role, not a stored field) and should be recorded as
   resolved, not left implicit.

3. **INSERT RLS policy scoped to org match only, not role.** The new
   policy mirrors the existing `SELECT` policy:
   `clerk_org_id = (select auth.jwt()) -> 'o' ->> 'id'`. It does **not**
   also check the caller's role via the raw JWT claim
   (`(select auth.jwt()) -> 'o' ->> 'rol'`), because that claim's exact
   string format (e.g. `"org:admin"` vs `"admin"`) has never been observed
   against a live token in this project — `STATE.md` only confirms `o.id`
   was observed live (Phase 3). Guessing it wrong in a migration would
   silently block all business creation with no clear error.
   **Assumption:** "must be an org admin to create the business" is
   instead enforced at the application layer, using Clerk's own typed SDK
   surface (`auth.protect({ role: "org:admin" })`), which is Clerk's
   documented, stable API — not a hand-parsed JWT claim.
   `docs/architecture.md` already flags this exact mechanism as available
   and unused ("not needed yet, add when a route actually requires it").
   **Verified against the installed package** (not memory), per user
   request before approval: `@clerk/nextjs` `7.7.3`,
   `node_modules/@clerk/shared/dist/types/organizationMembership.d.ts`'s
   `OrganizationCustomRoleKey` doc comment states "Clerk provides the
   default Roles `org:admin` and `org:member`"; `auth.protect({ role })`
   is a real overload of `AuthProtect` in
   `node_modules/@clerk/nextjs/dist/types/server/protect.d.ts`. `"org:admin"`
   is confirmed correct.
   RLS's job here stays narrowly "tenant isolation" (rule 1 in `AGENTS.md`
   §3); "who may act as the business's owner" is an authorization rule,
   correctly enforced where the identity types are known, not reconstructed
   from a raw JWT shape.

4. **`requireAuthContext()` gains an optional `options` parameter**,
   forwarded to `auth.protect()`. Existing call sites (`app/dashboard/page.tsx`)
   are unaffected — no options means today's behavior exactly. This is the
   smallest way to reach `auth.protect({ role: "org:admin" })` for the
   create path without duplicating the helper.
   **Implementation note:** `Parameters<typeof auth.protect>` does not work
   here — `auth.protect` is overloaded, and TypeScript's `Parameters<>`
   resolves to only the *last* overload signature (the no-args
   `AuthProtectOptions` one), not the role/permission-checking one,
   producing a type error. The narrowly-typed `options?: { role: "org:admin" }`
   (the one literal this project actually uses) was used instead of
   fighting Clerk's overload set with a generic passthrough.

5. **Duplicate-create race is treated as idempotent success, not an
   error.** The onboarding page checks for an existing business before
   rendering the form, but a double-submit (two tabs, slow network, retry)
   can still race two inserts for the same org. The unique index on
   `clerk_org_id` (Phase 3) will reject the second one — the Server Action
   catches that specific Postgres error (unique violation, code `23505`)
   and redirects to `/dashboard` exactly as if it had succeeded, since the
   desired end state (a business row exists for this org) already holds.
   Any other database error is treated as a real failure and surfaced via
   `AppError`/`logAndGetUserMessage`.

6. **Non-admin org members with no business yet see a static message, not
   the form.** `/onboarding` checks `orgRole`; a member (not admin) is told
   to ask their organization's admin to finish setup. No invite/notify
   mechanism is built — out of scope, not requested.

7. **No `.env` or dependency changes.** This phase only adds a migration, a
   service module, a Server Action, and two pages — everything needed
   already exists from Phases 2–3.

## Open decisions this depends on
None. D1 and D2 (`STATE.md` §4) are already resolved and directly govern
this phase's approach. D3–D6 are unrelated to onboarding.

## Dependencies / packages required
None. No new package needed — `zod`, `@clerk/nextjs`, `@supabase/supabase-js`
are already installed.

## Files likely to change
- `supabase/migrations/<timestamp>_add_businesses_insert_policy.sql` — new.
- `supabase/tests/database/002_businesses_insert_policy.sql` — new pgTAP
  test.
- `lib/auth.ts` — modified: `requireAuthContext()` accepts an optional
  `auth.protect()`-compatible options argument.
- `lib/business.ts` — new server-only service module:
  `getBusinessForOrg(orgId)`, `createBusinessForOrg(orgId, name)`.
- `app/onboarding/page.tsx` — new protected page.
- `app/onboarding/onboarding-form.tsx` — new client component (form +
  pending/error state via `useActionState`).
- `app/onboarding/actions.ts` — new Server Action (`"use server"`),
  colocated Zod schema.
- `app/dashboard/page.tsx` — modified: looks up the business for the
  current org, redirects to `/onboarding` if none exists, renders the
  business name instead of raw debug fields.
- `STATE.md` — updated per `AGENTS.md` §5/§8 after implementation.

## Database changes

New migration (`supabase migration new add_businesses_insert_policy`):

```sql
-- Allows an authenticated caller to create the businesses row for their
-- own Clerk organization. Mirrors the existing SELECT policy's org-match
-- shape; deliberately does not also gate on role here (see the
-- implementation prompt's Decision 3) — "must be an org admin" is
-- enforced at the application layer via auth.protect({ role: "org:admin" }),
-- not a hand-parsed JWT role claim.

grant insert on public.businesses to authenticated;

create policy "businesses_insert_own_org" on public.businesses
  for insert
  to authenticated
  with check (
    clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
  );
```

Exact commands:
```
supabase migration new add_businesses_insert_policy
# paste the SQL above into the generated file
supabase link   # if not already linked
supabase db push
```

After applying, verify actual grants per the Phase 3 lesson
(`docs/architecture.md` Database section):
```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'businesses';
```
Expect exactly: `authenticated` → `SELECT`, `INSERT`; `anon` → none;
`service_role` → default/broad (untouched, as before).

No changes to table shape, columns, or the existing `SELECT` policy.

## Server / client boundaries
- `lib/business.ts` — `server-only`, uses `createServerSupabaseClient()`
  (already server-only, per-request, RLS-authenticated).
- `app/onboarding/actions.ts` — Server Action (`"use server"`), runs
  server-side only; the only code path that performs the insert.
- `app/onboarding/onboarding-form.tsx` — client component; holds only the
  form UI and `useActionState` wiring. No Supabase or Clerk secret access.
- `app/onboarding/page.tsx`, `app/dashboard/page.tsx` — Server Components,
  call `requireAuthContext()`/`getBusinessForOrg()` directly.
- No secret newly introduced. No `NEXT_PUBLIC_*` change.

## Implementation requirements

1. `lib/auth.ts`: extend `requireAuthContext` to accept an optional
   parameter typed as whatever `auth.protect()` accepts (import the type
   from `@clerk/nextjs/server` rather than hand-rolling it), pass it
   through unchanged. No behavior change for existing callers that pass
   nothing.

2. `lib/business.ts` (new, `server-only`):
   - `getBusinessForOrg(orgId: string): Promise<Business | null>` —
     `createServerSupabaseClient()`, `.from("businesses").select("*").eq("clerk_org_id", orgId).maybeSingle()`. Throw `AppError` on an
     unexpected Supabase error (not "no rows", which is a valid `null`
     result).
   - `createBusinessForOrg(orgId: string, name: string): Promise<Business>` —
     inserts `{ clerk_org_id: orgId, name }`, `.select().single()`. On a
     Postgres unique-violation (`error.code === "23505"`), throw a
     dedicated `BusinessAlreadyExistsError` (small class, not `AppError` —
     it's an internal control-flow signal the action treats as success,
     not a user-facing failure). Any other error throws `AppError` via
     `logAndGetUserMessage`-compatible construction.

3. `app/onboarding/actions.ts` (new, `"use server"`):
   - Colocated Zod schema: `name` — string, trimmed, min 2 / max 120
     characters.
   - Calls `requireAuthContext({ role: "org:admin" })`. If it throws
     (unauthenticated or wrong role), let it propagate — Server Action
     non-document-request behavior applies (`docs/architecture.md`).
   - If `context.orgId` is falsy, return a form-error state (should not
     normally happen — the page already gates on `orgId` — but the action
     must not assume the page ran first).
   - Validate `name` from `FormData`. On failure, return
     `{ error: "<safe message>" }` (no `redirect()`), so the form can show
     it.
   - Call `createBusinessForOrg`. Catch `BusinessAlreadyExistsError`
     silently (idempotent success path). Catch anything else, return
     `{ error: logAndGetUserMessage(error) }`.
   - On success (including the already-exists case), `redirect("/dashboard")`
     — outside the `try`/`catch` so Next's internal redirect signal is never
     accidentally caught.

4. `app/onboarding/onboarding-form.tsx` (new client component):
   - `useActionState(createBusiness, { error: undefined })` (React 19,
     already in use — Next.js 16 App Router convention).
   - Single text input for `name`, submit button, disabled + pending label
     while `isPending`, error text rendered when `state.error` is set.

5. `app/onboarding/page.tsx` (new):
   - `requireAuthContext()` (no role option — this check must run before
     deciding whether to show the form or the "ask an admin" message, both
     of which are valid outcomes regardless of role).
   - No `orgId` → `redirect("/session-tasks/choose-organization")`.
   - `getBusinessForOrg(orgId)` → if a row already exists, `redirect("/dashboard")` (onboarding is not re-enterable once done).
   - `orgRole !== "org:admin"` → render the static "ask your admin" message,
     no form.
   - Otherwise render `<OnboardingForm />`.

6. `app/dashboard/page.tsx` (modify):
   - Keep the existing `orgId`-missing message unchanged.
   - When `orgId` exists, call `getBusinessForOrg(orgId)`. No row →
     `redirect("/onboarding")`.
   - Row exists → render the business `name` (replace the raw
     userId/orgId/orgSlug/orgRole dump — that was always placeholder
     content for Phase 2, and a real business record now exists to show
     instead).

## Security requirements
- `docs/security.md` §1: every query against `businesses` keeps its
  explicit `clerk_org_id` filter even though RLS also enforces it —
  defense in depth, not either/or.
- `docs/security.md` §2: `business_id`/`clerk_org_id` never comes from the
  client. `getBusinessForOrg`/`createBusinessForOrg` only ever receive
  `orgId` that came from `requireAuthContext()`'s validated session, never
  from form input or a query param.
- `docs/security.md` §3: RLS stays enabled + forced; the new `INSERT`
  policy is the only privilege widening, scoped to exactly the org match
  needed.
- `docs/security.md` §7: the only untrusted input in this phase is the
  `name` field — validated with Zod before use, never interpolated into
  SQL (Supabase client parameterizes it).
- `docs/security.md` §10: no raw Supabase/Postgres error ever reaches the
  client — every failure path from `lib/business.ts` is either a typed
  control-flow signal (`BusinessAlreadyExistsError`) handled internally,
  or converted through `AppError`/`logAndGetUserMessage`.

## Error handling
- Unauthenticated visit to `/onboarding` or the Server Action: Clerk's
  `auth.protect()` behavior applies per `docs/architecture.md`
  (redirect for the page, `404` for the action).
- Authenticated but not an org admin, submitting directly to the action
  (bypassing the UI's own gate): `auth.protect({ role: "org:admin" })`
  fails closed — verify manually what Clerk actually returns here (see
  Manual testing) since this exact path (role-checked Server Action) is
  new to this project.
- No active org: page redirects to the existing choose-organization task;
  action returns a form error if reached directly with no `orgId`.
- Invalid name: form re-renders with a specific validation message, input
  preserved (native form re-submit, not cleared).
- Duplicate create (race): silent idempotent success, redirect to
  dashboard, no error shown.
- Any other database failure: generic safe message via
  `logAndGetUserMessage`, internal detail logged server-side only.

## Acceptance criteria
- [ ] Migration applies cleanly; `INSERT` grant + policy exist exactly as
      specified; `SELECT` policy/grant unchanged.
- [ ] Post-migration grant check shows `authenticated` = `SELECT, INSERT`
      only, `anon` = none.
- [ ] A signed-in org admin with no existing business, visiting
      `/dashboard`, is redirected to `/onboarding`.
- [ ] Submitting a valid name creates exactly one `businesses` row scoped
      to that org, then redirects to `/dashboard`, which now shows the
      business name.
- [ ] Submitting an empty/too-short name re-renders the form with a
      validation error and creates no row.
- [ ] A signed-in org member (non-admin) with no existing business,
      visiting `/onboarding`, sees the "ask your admin" message, not the
      form.
- [ ] Visiting `/onboarding` when a business already exists for the org
      redirects straight to `/dashboard`.
- [ ] A direct attempt (e.g. `psql`/SQL editor as the `authenticated` role)
      to insert a `businesses` row with a `clerk_org_id` that does not
      match the caller's own org JWT claim is rejected by RLS.
- [ ] `npm run lint`, `npm run build`, `npx tsc --noEmit` all pass.

## Automated checks
- `npm run lint`
- `npm run build`
- `npx tsc --noEmit`
- `supabase test db` — runs `001_businesses_tenant_isolation.sql` (still
  unexecuted from Phase 3, per `STATE.md` §8) and the new
  `002_businesses_insert_policy.sql`. Note from Phase 3: this
  implementation environment has no Docker/Supabase CLI project access, so
  this remains something the user runs, not the agent — report honestly
  that it was written but not executed here, exactly as Phase 3 did.

## Manual testing steps
1. Apply the migration (`supabase db push`) and run the grant-verification
   query above; confirm the exact grant set.
2. As a fresh Clerk user: sign up, create a new organization (or select an
   existing one where you're admin) via the header's
   `OrganizationSwitcher`.
3. Visit `/dashboard` — confirm redirect to `/onboarding`.
4. Submit an empty name — confirm inline validation error, no row created
   (check via Supabase dashboard or SQL).
5. Submit a valid name (e.g. "Acme Test Co") — confirm redirect to
   `/dashboard` and the business name renders there.
6. Reload `/onboarding` directly — confirm it redirects to `/dashboard`
   (business already exists).
7. Invite/create a second Clerk user as a plain member (not admin) of a
   *different*, business-less organization; sign in as them, visit
   `/onboarding` — confirm the "ask your admin" message renders, no form,
   and directly POSTing to the action (e.g. via devtools) is rejected —
   note and report exactly what Clerk returns (404 vs. something else) so
   `docs/architecture.md`'s Authentication section can be updated with
   this newly-observed behavior.
8. Negative RLS check: in the Supabase SQL editor, simulate an
   `authenticated` session for org A (per the pgTAP fixture pattern) and
   attempt `insert into businesses (clerk_org_id, name) values ('org_b_id', 'x')` — confirm it is rejected.
9. Attempt to create a second business for the same org (e.g. open two
   tabs, submit both) — confirm only one row exists afterward and neither
   submission shows an error.

## Out of scope
- Any `businesses` column beyond `name` (address, industry, logo, etc.) —
  not specified in `PRODUCT.md`, defer until a phase actually needs it.
- Editing or deleting a business record — not part of "create and
  associate an owner"; a future dashboard phase (13) if requested.
- Inviting additional members during onboarding — Clerk's own
  `OrganizationSwitcher`/invite UI already exists independently of this
  app; no custom invite flow is being built.
- Any change to products/services/FAQs — Phase 5.
- Any change to the public chat widget or its identity mechanism — Phase
  11, decision D4.
