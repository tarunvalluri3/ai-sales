# Phase 5 — Products / Services / FAQs

## Goal
After this is implemented, an authenticated business member can create, read, update, and delete their business's products, services, and FAQs through three new tenant-scoped Supabase tables and minimal functional pages under `/dashboard`. Every query is scoped to the caller's own `business_id` at the query level (RLS + application-layer filter, matching the `businesses` pattern), and an isolation test proves Business A cannot read or mutate Business B's rows in any of the three new tables.

## Current phase
Phase 5 — Products / Services / FAQs. Confirmed from `STATE.md` §1.

## User request
"Read STATE.md, then AGENTS.md, then PRODUCT.md. We're starting Phase 5 — Products / Services / FAQs. Write the implementation prompt per docs/phases.md, then stop for my approval as usual."

## Skills and docs read
- `STATE.md` — current phase, Phase 4 completion detail, open decisions (D3–D6, none block this phase), env vars, database state.
- `AGENTS.md` — five non-negotiable rules, prompt-first workflow, checks, report format.
- `PRODUCT.md` §3 (actors), §6 (knowledge model — structured records must later be retrievable), §11.
- `docs/phases.md` — Phase 5 definition and exit criterion; Phase 13 (dashboard) scope boundary, to avoid pulling that phase's work forward.
- `docs/security.md` §1 (multi-tenancy), §2 (recommends a single `{ userId, businessId }` helper — not yet built), §3 (RLS/grants), §7, §11 (review checklist).
- `docs/prompt-template.md` — this template.
- `docs/architecture.md` — folder layout, route handler conventions, authentication pattern, database/grants conventions (including the "verify actual grants after every table-creating migration" lesson from Phase 3).
- `.claude/skills/supabase-postgres-best-practices/` referenced by `AGENTS.md` §6 as the doc to load for schema/RLS work — **not opened in this prompt-writing pass; load it during implementation**, since this prompt only specifies the contract, not the SQL authoring.

## Existing code inspected
- `supabase/migrations/20260811124354_create_businesses_table.sql` — the schema template: `uuid` PK via `gen_random_uuid()`, `timestamptz` timestamps, `set_updated_at()` trigger (already exists in the DB, reusable — do not redefine), RLS enabled + forced, explicit `grant select`, org-scoped policy using `(select auth.jwt()) -> 'o' ->> 'id'`.
- `supabase/migrations/20260811151559_add_businesses_insert_policy.sql` — the INSERT-policy template (`with check`, same org-match condition, no role check in RLS itself).
- `supabase/migrations/20260811145006_tighten_businesses_grants.sql` and `20260811150450_default_privileges_least_privilege.sql` — confirms new tables in `public` currently start with **zero** default grants to `anon`/`authenticated`; each new table's migration must explicitly `grant` what it needs.
- `supabase/tests/database/001_businesses_tenant_isolation.sql` and `002_businesses_insert_policy.sql` — the pgTAP isolation-test pattern (`set_config('request.jwt.claims', ...)` + `set local role authenticated`, `lives_ok`/`throws_ok`/`results_eq`).
- `lib/business.ts` — data-access pattern: `server-only`, one function per operation, explicit tenant filter in the query in addition to RLS, `AppError` on unexpected failure, a dedicated error class (`BusinessAlreadyExistsError`) for an expected/idempotent failure mode.
- `lib/supabase/server.ts` — `createServerSupabaseClient()`, new client per request, Clerk-token-authenticated. Reused as-is, no changes needed.
- `lib/supabase/types.ts` — one hand-written type per table (`Business`). Will gain `Product`, `Service`, `Faq`.
- `lib/auth.ts` — `requireAuthContext(options?)` wraps `auth.protect()`, returns Clerk-level identity only (`userId`, `orgId`, `orgSlug`, `orgRole`). Does **not** resolve `business_id`.
- `lib/errors.ts` — `AppError` / `logAndGetUserMessage` convention, reused as-is.
- `app/onboarding/page.tsx`, `onboarding-form.tsx`, `actions.ts` — the only existing precedent for a data-mutating page: Server Component does the auth/redirect gating, a `"use client"` form uses `useActionState`, a `"use server"` action Zod-validates then calls the data-access layer, unstyled-but-functional Tailwind (`zinc` palette, no design system).
- `app/dashboard/page.tsx` — currently a placeholder showing only the business name; redirects to `/onboarding` if no business exists for the org.
- `docs/architecture.md` — confirms the grant/RLS lessons above and the authentication-pattern documentation location this phase should extend.

## Relevant existing architecture
- No ORM; hand-authored SQL migrations are the schema source of truth (`supabase migration new <name>`).
- Defense-in-depth tenant isolation (resolved decision D2): RLS enabled + forced on every business-owned table, **plus** an explicit `business_id`/tenant filter in the application query — never rely on RLS alone.
- `docs/security.md` §2 explicitly asks for "a single server-side helper that returns `{ userId, businessId }` only for a validated, authorized pair," routing all business-owned data access through it — this has not been built yet because Phase 4 only ever scoped by `clerk_org_id` directly on `businesses` itself. Phase 5 is the first phase where child tables are keyed by `business_id`, so this is the natural point to add it.
- Route handlers/Server Actions stay thin; real logic lives in `lib/`.
- Errors always go through `AppError` / `logAndGetUserMessage`; never leak raw Postgres errors.
- Zod schemas colocated with the boundary they validate (Server Action file), not centralized.

## Decisions and assumptions
1. **Three separate tables** (`products`, `services`, `faqs`), not one polymorphic table — matches `docs/phases.md`'s Phase 5 title and `PRODUCT.md` §6's treatment of them as distinct record types, and keeps each table's columns honest (a FAQ has no price; a product/service has no question/answer).
2. **New helper `lib/business-context.ts`: `requireBusinessContext()`.** Wraps `requireAuthContext()` + `getBusinessForOrg()`, redirects to `/onboarding` if no org or no business exists (mirroring `app/dashboard/page.tsx`'s existing inline logic), and returns `{ userId, businessId, orgId }`. This satisfies `docs/security.md` §2's standing recommendation and removes the need for every products/services/FAQs page and action to re-derive `businessId` from `orgId` by hand. `app/dashboard/page.tsx` is **not** refactored to use it in this phase — out of scope, see below — but the new products/services/FAQs code uses it exclusively.
3. **Columns kept minimal, no speculative fields.** `products`/`services`: `id`, `business_id`, `name` (required), `description` (optional), `price` (optional `numeric(12,2)`, since not every product/service has a fixed price), `created_at`, `updated_at`. `faqs`: `id`, `business_id`, `question` (required), `answer` (required), `created_at`, `updated_at`. No `is_active`/status/draft field — nothing in `PRODUCT.md` or `docs/phases.md` calls for one yet, and Phase 6 (ingestion) is where "which records are retrievable" would become relevant if ever needed; adding it speculatively now would be exactly the kind of unrequested extra `AGENTS.md` §5 forbids. Flagging this so the user can override before approval if they want it.
4. **Authorization: any authenticated member of the business's org may perform full CRUD** on that business's products/services/FAQs — not restricted to `org:admin` the way business *creation* was in Phase 4. Reasoning: `PRODUCT.md` §3 describes "Business member" only as someone who "can take over conversations," with the fuller role model explicitly deferred ("Role model is defined in the phase that introduces it"); nothing in Phase 5's scope or `docs/phases.md` calls for an owner/member distinction on structured-knowledge CRUD, and inventing one now would be scope creep. RLS policies therefore gate on **org match only** (via a join through `businesses`), same shape as the existing `businesses_select_own_org`/`businesses_insert_own_org` policies. **Flagging this as worth a STATE.md decision entry if the user wants a stricter default** — recommend confirming before approval.
5. **UI scope: minimal functional CRUD pages, not a dashboard section.** `docs/phases.md` assigns "the business-facing dashboard... Candidate areas: ...products/services/FAQs" to **Phase 13** explicitly. Phase 5's exit criterion only requires that "full CRUD works for each type" — provable with plain, unstyled-but-functional pages in the same visual register as `app/onboarding/`, not dashboard navigation/polish. Pages live at `app/dashboard/products`, `app/dashboard/services`, `app/dashboard/faqs` (list + inline create form + per-row edit/delete) so they're reachable and testable now, but carry no shared dashboard chrome/nav — Phase 13 owns integrating them into a real dashboard experience.
6. **No route handlers (REST API) added.** CRUD is implemented as Server Actions colocated with each page, consistent with the only existing precedent (`app/onboarding/actions.ts`). A public/API surface for these resources is not requested and Phase 11+ is where any API contract work belongs.
7. **Delete is a hard delete**, not a soft-delete/archive flag — consistent with keeping columns minimal (decision 3) and because nothing in scope needs delete history.
8. **`price` accepts empty input as `null`, not `0`** — an unset price is different from a free product; the form and Zod schema treat a blank field as "no price," not zero.

## Open decisions this depends on
None of `STATE.md` §4's open decisions (D3, D4, D5, D6) block this phase — they concern embeddings (Phase 7), the public widget (Phase 11), knowledge source types (Phase 6, already resolved to include structured records), and leads (Phase 10) respectively.

## Dependencies / packages required
None. Uses the already-installed `@supabase/supabase-js`, `zod`, `@clerk/nextjs`, `server-only`, Next.js/React/Tailwind — nothing new in `package.json`.

## Files likely to change
**Created:**
- `supabase/migrations/<timestamp>_create_products_table.sql`
- `supabase/migrations/<timestamp>_create_services_table.sql`
- `supabase/migrations/<timestamp>_create_faqs_table.sql`
- `supabase/tests/database/003_products_tenant_isolation.sql`
- `supabase/tests/database/004_services_tenant_isolation.sql`
- `supabase/tests/database/005_faqs_tenant_isolation.sql`
- `lib/business-context.ts`
- `lib/products.ts`, `lib/services.ts`, `lib/faqs.ts`
- `app/dashboard/products/page.tsx`, `app/dashboard/products/product-form.tsx`, `app/dashboard/products/actions.ts`
- `app/dashboard/services/page.tsx`, `app/dashboard/services/service-form.tsx`, `app/dashboard/services/actions.ts`
- `app/dashboard/faqs/page.tsx`, `app/dashboard/faqs/faq-form.tsx`, `app/dashboard/faqs/actions.ts`

**Modified:**
- `lib/supabase/types.ts` — add `Product`, `Service`, `Faq` types.
- `docs/architecture.md` — extend the "Database" section with the products/services/faqs grant-check confirmation (per its own note: "worth a quick grant check on the first genuinely new table"), and document the new `requireBusinessContext()` helper under "Authentication."
- `STATE.md` — move Phase 5 into §2, update §1/§3, record decision 4 above (org-member-CRUD authorization) either as a new resolved-decision row or an explicit note if the user wants it revisited later, update §6 (database state) and §7 (approved prompts).

**Not modified:** `app/dashboard/page.tsx` (per decision 2/5 — no refactor to use the new helper, no nav added).

## Database changes
Three new migrations, run via `supabase migration new <name>` then hand-authored SQL, in the same shape as `20260811124354_create_businesses_table.sql`:

For each of `products`, `services`, `faqs`:
- `id uuid primary key default gen_random_uuid()`
- `business_id uuid not null references public.businesses(id) on delete cascade`
- type-specific columns (see Decision 3)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- index on `business_id` (e.g. `create index products_business_id_idx on public.products (business_id);`) — every tenant-scoped query filters on this column.
- `before update` trigger calling the **already-existing** `public.set_updated_at()` function (defined in the `businesses` migration — do not redefine it).
- `alter table ... enable row level security;` and `... force row level security;`
- Explicit grants: `grant select, insert, update, delete on public.<table> to authenticated;` (new tables default to zero grants per the Phase 3 fix — confirmed in `docs/architecture.md`).
- Four RLS policies (`select`, `insert`, `update`, `delete`), each scoped to org match **through a join to `businesses`**, since these tables don't carry `clerk_org_id` directly:
  ```sql
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  )
  ```
  (`insert`/`update` also need `with check` using the same condition.)

After each migration is applied, **verify actual grants** (per `docs/architecture.md`'s standing instruction) rather than assuming the migration's explicit `GRANT` is the only one in effect.

## Server / client boundaries
- All Supabase access stays server-only (`lib/products.ts`, `lib/services.ts`, `lib/faqs.ts`, `lib/business-context.ts` all start with `import "server-only";`).
- Server Actions (`actions.ts` files) are `"use server"`, validate with Zod, call the `lib/` data-access layer, never construct SQL or accept a client-supplied `business_id` — it always comes from `requireBusinessContext()`.
- Client components (`*-form.tsx`) are thin `useActionState` forms, no Supabase import, no secret.
- No new environment variables.

## Implementation requirements
1. `lib/business-context.ts` exports `requireBusinessContext()`: calls `requireAuthContext()`; if `orgId` is undefined, redirect to `/session-tasks/choose-organization`; calls `getBusinessForOrg(orgId)`; if `null`, redirect to `/onboarding`; returns `{ userId, businessId: business.id, orgId }`.
2. `lib/products.ts`, `lib/services.ts`, `lib/faqs.ts` each export: `list<Type>sForBusiness(businessId)`, `create<Type>(businessId, input)`, `update<Type>(businessId, id, input)`, `delete<Type>(businessId, id)`. Every function filters by `business_id` in the query itself (defense in depth alongside RLS), matching `lib/business.ts`'s existing pattern. `update`/`delete` use `.eq("business_id", businessId).eq("id", id)` so a forged/foreign `id` affects zero rows rather than erroring — return a typed not-found outcome the action layer can turn into a safe user-facing message.
3. Each `page.tsx` (Server Component): calls `requireBusinessContext()`, lists existing records, renders the create form and one edit/delete control per row.
4. Each `actions.ts`: one Zod schema per operation (create/update/delete), colocated; calls `requireBusinessContext()` for `businessId`; calls the `lib/` layer; converts thrown errors via `logAndGetUserMessage`; revalidates/redirects appropriately (`revalidatePath` on the relevant `/dashboard/<type>` path after mutation, no full-page redirect needed since it's a list+form page).
5. Empty `description` submits as `null`, not `""`; empty `price` submits as `null`, not `0` or `NaN` (Decision 8).

## Security requirements
- `docs/security.md` §1: every new table carries `business_id`, every query tenant-scoped at the query level, never trust a client-supplied `business_id`.
- `docs/security.md` §2: `business_id` resolved only via `requireBusinessContext()`, never accepted as a hidden form field or trusted from the client.
- `docs/security.md` §3: RLS + explicit grants, per the Database changes section above.
- `docs/security.md` §7: all external input (form fields) Zod-validated at the Server Action boundary.
- `docs/security.md` §11 checklist applies in full — walk it before closing this phase.

## Error handling
- Supabase query failure (any CRUD op): caught, logged via `logAndGetUserMessage`, safe generic message returned to the form state — no raw Postgres error reaches the client.
- Zod validation failure: safe, specific message (e.g. "Enter a product name (1–120 characters).") returned to form state, no exception thrown.
- Update/delete targeting a nonexistent or foreign-tenant `id`: zero rows affected (per Decision/Requirement 2's `.eq` scoping) is treated as a safe no-op with a "not found" message — never a raw DB error, never a distinguishable-from-cross-tenant-attempt error (would leak existence information).
- Missing `orgId`/`businessId`: `requireBusinessContext()` redirects rather than erroring, matching `app/dashboard/page.tsx`'s and `app/onboarding/page.tsx`'s existing pattern.

## Acceptance criteria
- [ ] `products`, `services`, `faqs` tables exist with `business_id`, RLS enabled + forced, four scoped policies each, indexes on `business_id`, and `updated_at` triggers.
- [ ] Grants confirmed (not assumed) to be exactly `authenticated: SELECT, INSERT, UPDATE, DELETE` and `anon: none` on all three tables after migration.
- [ ] A business owner/member can create, list, edit, and delete a product, a service, and an FAQ through the new pages, with data persisted correctly.
- [ ] A second, different business (different Clerk org) cannot see, edit, or delete the first business's products/services/FAQs — proven by pgTAP test, not inspection.
- [ ] All three new `lib/` modules and `business-context.ts` are `server-only`-guarded.
- [ ] No client-supplied `business_id` is trusted anywhere in the new code.
- [ ] `npm run lint`, `npm run build`, and `npx tsc --noEmit` all pass.
- [ ] `STATE.md` updated per its own "How to update this file" checklist.

## Automated checks
- `npm run lint`
- `npm run build`
- `npx tsc --noEmit`
- `supabase test db` — run the three new pgTAP files (`003_products_tenant_isolation.sql`, `004_services_tenant_isolation.sql`, `005_faqs_tenant_isolation.sql`), each proving Business A cannot `select`/`update`/`delete` Business B's rows and cannot `insert` a row claiming Business B's `business_id`. If this implementation environment still lacks Docker/local Supabase CLI access (as in every prior phase), state that plainly rather than claiming a run that didn't happen, and rely on the manual SQL-editor spot-check below as the honest fallback — same posture as Phases 3/4.

## Manual testing steps
1. Sign in as an org admin with an existing business (from Phase 4 onboarding). Visit `/dashboard/products`. Create a product with a name only (no description/price) — confirm it appears in the list.
2. Create a product with name, description, and price — confirm all three persist and display correctly.
3. Edit that product's price to blank — confirm it saves as no price, not `0`.
4. Delete a product — confirm it disappears from the list and a second delete attempt (e.g. stale tab, resubmit) is a safe no-op, not an error page.
5. Repeat 1–4 for `/dashboard/services` and `/dashboard/faqs` (FAQ: question + answer both required — confirm empty submission is rejected with a clear message).
6. **Negative/isolation test:** sign in as a member of a *second* business (or simulate via the Supabase SQL editor with a different `o.id` claim, same technique as Phase 3/4's manual spot-checks). Confirm this session's `/dashboard/products` list never shows Business A's products, and a direct update/delete attempt against Business A's row id (e.g. replayed Server Action call) affects zero rows.
7. Confirm `anon`/unauthenticated requests to the Supabase Data API for all three tables return no rows (grant check).

## Out of scope
- Dashboard navigation, overview page, or any shared dashboard chrome/layout — Phase 13.
- Converting products/services/FAQs into retrievable knowledge documents/chunks — Phase 6.
- A public/REST API for these resources — not requested, no phase currently calls for it.
- Owner-vs-member role distinction for structured-knowledge CRUD beyond org membership — flagged in Decision 4; only build if the user asks before approval.
- Soft delete / archive / status field — flagged in Decision 3; only build if the user asks before approval.
- Any change to `app/dashboard/page.tsx` beyond what already exists.
