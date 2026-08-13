# Phase 13b — Business profile page, and polish for Products/Services/FAQs/Knowledge

## Goal
After this, the dashboard nav has 8 real sections instead of 7: a new "Business Profile" page (`/dashboard/profile`) lets an org admin edit the business's name plus four new optional profile fields (description, contact email, contact phone, website) — the first write path to any of these since onboarding created `name` — and the four existing structured-data sections (Products, Services, FAQs, Knowledge) are visually restyled to match the Phase 13a shell's design language (the shared `--dashboard-primary` token, card-style rows, consistent spacing/typography), with **zero change to their existing Server Actions, validation, or data-access logic**. The four new fields are dashboard-display-only in this prompt — they do not reach the AI (see Decision 1 and "Out of scope").

## Current phase
Phase 13 — Business dashboard. Confirmed from `STATE.md` §1/§3. This is the second of three planned Phase 13 prompts (13a, shell/nav/overview, completed and fully verified 2026-08-13 — see `STATE.md` §2). 13c (conversations + leads) remains undrafted.

## User request
"Proceed to drafting Phase 13b — business profile page, plus polishing/restyling Products, Services, FAQs, and Knowledge to match the new dashboard shell. Follow the normal prompt-first workflow and stop for approval as usual."

**Correction after the first draft, before approval:** the user confirmed Decision 2 (org:admin-only editing) as originally written, but rejected the original Decision 1 (name-only profile). The business profile gets four new optional fields — `description`, `contact_email`, `contact_phone`, `website` — alongside the existing required `name`. The user explicitly confirmed these stay dashboard-display-only in this prompt: they must not reach `lib/rag.ts`'s `askSalesEmployee()` or the AI system prompt in any way — `PRODUCT.md` §7's category-1 "business profile information" context stays `name`-only exactly as it is today. Wiring these into the AI persona is a separate, later decision, not something to assume either way here.

## Skills and docs read
- `STATE.md` (§1–§3, §6, §7) — Phase 13a's closed entry (nav structure, token decisions, deviation record), current database state, resolved decisions.
- `PRODUCT.md` — re-checked §3 (actor model) and §8 (lead model, for its precedent on how this project documents field specs) for whether "business profile" has any specified field beyond `name`. It does not — `businesses` has never had more than `name` as an identity field in any phase.
- `docs/phases.md` — Phase 13's own candidate-areas list includes "business profile" without specifying fields; exact scope is this prompt's job, same as every other phase.
- `docs/security.md` §2 (trusted identity) and §3 (tenant isolation) — re-consulted because this prompt's one write path is new (`businesses.name`), unlike Phase 13a's read-only work.
- `.claude/skills/ui-ux-pro-max/` and `.claude/skills/impeccable/` — same reference use as 13a, this time for form/list-row visual polish rather than nav/shell layout.

## Existing code inspected
- `lib/business.ts` — `getBusinessForOrg(orgId)` and `createBusinessForOrg(orgId, name)` only. **No update function exists.** Both existing functions filter by `clerk_org_id`, not `businessId` — the established convention for this specific file (every other `lib/*.ts` module filters by `businessId`, but `business.ts` predates `requireBusinessContext()` and has never been changed to match).
- `supabase/migrations/20260813130000_add_widget_columns_to_businesses.sql` — read in full. Confirms the `businesses` table already has a permissive row-level RLS `UPDATE` policy (`businesses_update_own_org`, org-match `USING`/`WITH CHECK`, no column restriction at the policy level) from Phase 11. What currently blocks writing `name` is purely the **column-level `GRANT`** — Phase 11 granted `update (widget_allowed_origin)` only, specifically so the widget-settings path couldn't also rename the business or regenerate its key through the same form. This means enabling a `name` update needs **one new column-level grant, no RLS policy change** — the authorization boundary this prompt adds is additive, not a weakening of an existing one.
- `app/(dashboard)/onboarding/actions.ts` — `createBusiness()` calls `requireAuthContext({ role: "org:admin" })` before creating the business row. This is the only existing precedent for "who may act on the business's own identity" (as opposed to D7's "any authenticated org member," which `STATE.md` §4 records as scoped specifically to products/services/FAQs CRUD, not the business row itself).
- `app/(dashboard)/dashboard/products/{page.tsx,product-form.tsx,actions.ts}`, `app/(dashboard)/dashboard/knowledge/{page.tsx,knowledge-form.tsx}`, `app/(dashboard)/dashboard/_components/delete-button.tsx`, `app/(dashboard)/dashboard/products/[id]/edit/page.tsx` — read in full. Services and FAQs follow the identical shape (confirmed by their existing `STATE.md` Phase 5/6 entries describing "same shape as products"). Every list page: `<ul>` of `<li>` rows (`border border-zinc-200`, `rounded-md`), each with an Edit link and a `DeleteButton`, plus a create form below. Every form: `useActionState`, native `<label>`/`<input>`/`<textarea>`, `bg-zinc-900 text-white` submit button, `role="alert"` error text. **Server Actions in every `actions.ts` are untouched by this prompt** — they already validate via Zod, scope by `businessId`, and follow this project's `AppError`/`logAndGetUserMessage` convention correctly; nothing here needs a logic change, only the JSX/className layer.
- `app/(dashboard)/onboarding/onboarding-form.tsx` — the closest existing precedent for a single-field business-identity form; the new profile form follows the same shape (one text field, one submit button) rather than inventing a new pattern.
- `app/(dashboard)/dashboard/_components/nav-items.tsx` (Phase 13a) — confirmed it's the single place both `Sidebar` and `MobileNav` read from; adding "Business Profile" here is sufficient to add it to both surfaces.
- `app/(dashboard)/globals.css` (Phase 13a) — confirmed `--color-dashboard-primary`/`--color-dashboard-primary-hover` are already available as Tailwind utilities (`bg-dashboard-primary`, `hover:bg-dashboard-primary-hover`, etc.) from 13a's token block.
- `lib/rag.ts` — `askSalesEmployee(businessId, businessName, question, history?)`'s system prompt currently sources exactly one business-profile field, `businessName`, per Phase 9's Decision 1 ("business profile context limited to `businesses.name` — no richer profile invented"). Confirmed this file is **not** touched by this prompt — the four new fields stop at the dashboard layer.
- `lib/schemas/lead.ts` — read for its existing `emailSchema`/`phoneSchema` shape (`z.string().trim().email()`; a loose `/^[+()\-.\s\d]{7,20}$/` regex) as the established validation precedent for email/phone in this codebase. Both are module-private (not exported), so the new business-profile schema defines its own equivalents rather than importing them — same validation shape, no cross-module coupling between an unrelated lead concept and a business-profile concept.

## Relevant existing architecture
- Column-level `GRANT` is this project's established mechanism for "some fields of a row are writable via this path, others aren't" (Phase 11 precedent, `docs/security.md`). This prompt adds a second instance of that pattern (`grant update (name) on public.businesses to authenticated`) rather than inventing a new one.
- `docs/architecture.md`'s Authentication section documents the `auth.protect({ role })` pattern for admin-gated actions (Phase 4 precedent, reused here).
- Every restyle in this prompt stays within the existing Server Component + Server Action architecture — no new client-side data fetching, no new API route.

## Decisions and assumptions

1. **Business Profile has five editable fields: `name` (required, unchanged constraint) plus four new optional columns — `description`, `contact_email`, `contact_phone`, `website`.** Confirmed explicitly by the user after the first draft proposed name-only. **Explicitly scoped as dashboard-display-only in this prompt** — none of the four new fields are read by `lib/rag.ts`'s `askSalesEmployee()` or reach the AI system prompt in any way; `PRODUCT.md` §7's category-1 "business profile information" stays exactly `businessName` as Phase 9 left it. Wiring these into the AI persona is a separate, materially larger decision (touching prompt construction, `askSalesEmployee()`'s signature, and `docs/security.md`'s "no fabricated business facts" boundary around what counts as approved context) and is explicitly deferred, not assumed either way — see "Out of scope."
2. **Editing the business profile (all five fields) is `org:admin`-only, not "any authenticated org member."** Confirmed explicitly by the user as written in the first draft. `STATE.md`'s resolved decision D7 ("any authenticated org member" for CRUD) is explicitly scoped to products/services/FAQs — structured *knowledge* records, not the business's own identity. The only existing precedent for "who may act on the business row itself" is business *creation*, which already requires `org:admin` (`app/(dashboard)/onboarding/actions.ts`). Editing the business's own identity fields is the same category of action, so this prompt follows that precedent rather than D7's. Enforced at the application layer via `requireAuthContext({ role: "org:admin" })`, since a column-level Postgres `GRANT` has no concept of Clerk org roles — the database grant only controls *which columns*, same as the existing `widget_allowed_origin` grant; the database still permits any `authenticated` org member's own row to be touched at the RLS layer, matching this project's established "RLS proves tenant match, the app layer proves authorization" division of labor (`docs/security.md` §2/§3).
3. **Nav order becomes: Overview, Business Profile, Products, Services, FAQs, Knowledge, Leads, Widget Settings** — Business Profile placed second, immediately after Overview, since it's business-identity-level (like Widget Settings, which sits last as a technical/integration setting) rather than catalog data. `nav-items.tsx` gains one new entry and one new icon; `Sidebar`/`MobileNav` need no other change (Phase 13a already built both to read from one shared list).
4. **Route is `/dashboard/profile`**, not `/dashboard/business-profile` or `/dashboard/settings` — short, unambiguous given no other "profile" concept exists in this product (no user profile page; Clerk's `UserButton` already covers personal-account settings in the root header).
5. **Restyle scope is presentational only: `className` changes, layout/spacing/hierarchy changes, and swapping `bg-zinc-900`/`text-zinc-900`-as-accent for the new `dashboard-primary` token where a primary action or active state is shown.** No `actions.ts` file is touched in this prompt (their Zod schemas, `AppError` handling, and `revalidatePath`/`redirect` calls are all correct and unrelated to visual design). `DeleteButton` (`app/(dashboard)/dashboard/_components/delete-button.tsx`) is shared across Products/Services/FAQs/Knowledge — restyled once, in place, rather than forked per section.
6. **List rows move from bare `<ul>`/`<li>` to a card-row pattern** (rounded border, `bg-white`, hover state) consistent with Overview's `StatCard` visual language from 13a, for a coherent look across the whole shell. Exact visual details (spacing scale, hover treatment) are an implementation-time judgment call within the token system already established — not enumerated field-by-field here, consistent with how 13a's prompt didn't over-specify pixel values either.
7. **Empty states get a small visual upgrade** (currently plain `<li>` text like "No products yet.") — still no illustration/icon system invented, just brought in line with the new card-row treatment (e.g., the same card shell with muted centered text), no new dependency.
8. **No change to knowledge document chunk preview** or any other Phase 6-specific behavior on the knowledge edit page — out of scope, this prompt only touches the list page, the create/edit form shell, and shared components.
9. **Validation bounds for the four new fields**, all optional (blank submits as `null`, matching this codebase's existing `catalogDescriptionSchema`/`catalogPriceSchema` blank-becomes-null convention from `lib/schemas/catalog.ts`): `description` — trimmed, max 500 characters, no format check beyond length (a free-text summary); `contact_email` — `z.string().trim().email()`, same shape as `lib/schemas/lead.ts`'s private `emailSchema`, independently defined (no cross-import, per the "Existing code inspected" note above); `contact_phone` — the same loose `/^[+()\-.\s\d]{7,20}$/` shape as `lib/schemas/lead.ts`'s private `phoneSchema`, independently defined for the same reason; `website` — `z.string().trim().url()`, rejecting anything that isn't a well-formed URL (e.g. requires a scheme — `https://example.com`, not `example.com`; flagging this as a real UX tradeoff worth confirming if a bare-domain input should be auto-prefixed with `https://` instead of rejected — implementer's call within this bound if not otherwise specified).

## Open decisions this depends on
None formally blocking in `STATE.md` §4 (empty). Decisions 1 and 2 were both explicitly confirmed by the user after the first draft (see "User request" above) — no longer open.

## Dependencies / packages required
None. Confirmed against `package.json` — no new package.

## Files likely to change
**Created:**
- `app/(dashboard)/dashboard/profile/page.tsx` — server component, resolves `requireBusinessContext()` for the current field values plus the caller's `orgRole` (view-only for non-admins, matching the existing non-admin "ask your admin" pattern from onboarding).
- `app/(dashboard)/dashboard/profile/profile-form.tsx` — client component, five fields (`name`, `description`, `contact_email`, `contact_phone`, `website`), same `useActionState` shape as `onboarding-form.tsx`/every other form in this codebase.
- `app/(dashboard)/dashboard/profile/actions.ts` — `updateBusinessProfileAction`, Zod-validated, `requireAuthContext({ role: "org:admin" })`-gated.
- `lib/schemas/business.ts` — new shared schema module (`businessProfileSchema`), following this codebase's existing convention (`lib/schemas/catalog.ts`, `lib/schemas/knowledge.ts`, `lib/schemas/lead.ts`) of colocating a schema shared by more than one boundary in its own `lib/schemas/` file rather than inline in the action.

**Modified:**
- `lib/business.ts` — add `updateBusinessProfile(orgId: string, input: BusinessProfileInput): Promise<Business>`, filtered by `clerk_org_id` (matching this file's existing convention, not `lib/products.ts`'s `businessId` convention).
- `lib/supabase/types.ts` — extend the `Business` type with the four new nullable columns.
- `app/(dashboard)/dashboard/_components/nav-items.tsx` — add the Business Profile entry + icon.
- `app/(dashboard)/dashboard/products/{page.tsx,product-form.tsx}`, `services/{page.tsx,service-form.tsx}`, `faqs/{page.tsx,faq-form.tsx}`, `knowledge/{page.tsx,knowledge-form.tsx}` — visual restyle only.
- `app/(dashboard)/dashboard/_components/delete-button.tsx` — visual restyle only.
- `app/(dashboard)/dashboard/products/[id]/edit/page.tsx`, `services/[id]/edit/page.tsx`, `faqs/[id]/edit/page.tsx`, `knowledge/[id]/edit/page.tsx` — heading/spacing restyle only (these are thin wrappers around the shared form components, per the Products example already inspected).
- `docs/architecture.md` — extend the Phase 13a "Dashboard shell and navigation" note with a short addendum on the column-grant pattern reused here, where the `org:admin`-only business-identity precedent now lives in code, and an explicit note that the four new fields are dashboard-only and not part of the AI's context (cross-referencing the "AI orchestration" section's existing Phase 9 Decision 1).

**No changes:** any `actions.ts` under `products/`, `services/`, `faqs/`, `knowledge/` (logic untouched); `lib/products.ts`, `lib/services.ts`, `lib/faqs.ts`, `lib/knowledge.ts`, `lib/knowledge-sync.ts` (untouched); `lib/rag.ts` and any other AI-orchestration file (untouched — see Decision 1); `app/(dashboard)/dashboard/page.tsx` (Overview, untouched — no new stat card for "Business Profile," it's not count-based).

## Database changes
One new migration, e.g. `supabase/migrations/20260813140000_add_business_profile_fields.sql`:

```sql
-- Business profile fields beyond `name` (Phase 13b). All four nullable --
-- optional at signup and after. Dashboard-display-only: not read by
-- lib/rag.ts's askSalesEmployee(), which still sources business-profile
-- context from `name` alone (Phase 9 Decision 1, unchanged by this
-- migration). Wiring these into the AI persona is a separate, later
-- decision.
alter table public.businesses
  add column description text,
  add column contact_email text,
  add column contact_phone text,
  add column website text;

-- The existing businesses_update_own_org RLS policy (Phase 11) already
-- permits UPDATE on org-matched rows at the row level -- only the
-- column-level GRANT restricts which columns, same mechanism already used
-- for widget_allowed_origin. org:admin-only enforcement happens at the
-- application layer (requireAuthContext({ role: "org:admin" })), since
-- Postgres GRANT has no concept of Clerk org roles.
grant update (name, description, contact_email, contact_phone, website)
  on public.businesses to authenticated;
```

No new table, index, or RLS policy — four new nullable columns and one extended column-level grant only. Exact command: `npx supabase db push --linked`, then verify live via `npx supabase db query --linked` that `authenticated` can now update all five columns (and still cannot update `id`/`clerk_org_id`/`widget_key`) — same verification style as every prior grant change in this project.

## Server / client boundaries
- `updateBusinessProfileAction` runs server-only (`"use server"`), calls `requireAuthContext({ role: "org:admin" })` — never trusts a client-supplied role or business ID.
- `lib/business.ts`'s new `updateBusinessProfile()` takes `orgId` from the validated auth context only, per `docs/security.md` §2.
- No secret touched, no new env var, no `NEXT_PUBLIC_*` addition.
- `profile-form.tsx` is a client component (form interactivity only, same as every other form in this codebase) — no direct database access.

## Implementation requirements
1. `lib/schemas/business.ts`'s `businessProfileSchema`: `name` (`z.string().trim().min(2).max(120)`, matching `createBusinessSchema`'s existing bounds); `description` (optional, trimmed, blank → `null`, max 500 chars); `contactEmail` (optional, trimmed, blank → `null`, else `z.string().email()`); `contactPhone` (optional, trimmed, blank → `null`, else the `/^[+()\-.\s\d]{7,20}$/` shape); `website` (optional, trimmed, blank → `null`, else `z.string().url()`) — per Decision 9, following `lib/schemas/catalog.ts`'s existing blank-becomes-`null` transform pattern for every optional field.
2. `lib/business.ts`'s `updateBusinessProfile(orgId, input)`: `update({ name, description, contact_email, contact_phone, website }).eq("clerk_org_id", orgId).select().single()`, wraps any Supabase error in `AppError` with a message consistent with this file's existing two functions' style.
3. `app/(dashboard)/dashboard/profile/actions.ts`'s `updateBusinessProfileAction`: parses `businessProfileSchema`, calls `requireAuthContext({ role: "org:admin" })` first (a non-admin caller never reaches the database call — `auth.protect({ role })`'s existing rejection behavior, already proven live in Phase 4), then `updateBusinessProfile()`, then `revalidatePath("/dashboard/profile")` and `revalidatePath("/dashboard")` (the Overview page shows the business name too).
4. `app/(dashboard)/dashboard/profile/page.tsx`: resolve `requireBusinessContext()` plus the current row's four new fields (extend `requireBusinessContext()`'s return or fetch the row directly — implementer's call, consistent with how `businessName` was already added to `requireBusinessContext()` in Phase 5); resolve the caller's org role (via `requireAuthContext()`'s existing `orgRole` field, confirmed present on `AuthContext`) to decide whether to render `ProfileForm` (org:admin) or a read-only display of all five current values plus the same "ask your admin to make changes" messaging pattern already used in `app/(dashboard)/onboarding/page.tsx` for non-admins.
5. `nav-items.tsx`: insert a `{ label: "Business Profile", href: "/dashboard/profile", icon: ProfileIcon }` entry as the second item (after Overview, before Products) — one new small inline SVG icon, same convention as the existing 7.
6. Every restyled list page keeps its exact existing data-fetching call, exact existing empty-state condition, and exact existing `Edit`/`DeleteButton` wiring — only the surrounding markup/`className`s change. Verify this by diffing each restyled file's non-JSX logic (the `requireBusinessContext()` call, the `list*ForBusiness()` call, the `.map()` callback's data access) against its current version — none of that should change.
7. Every restyled form keeps its exact existing `useActionState` wiring, exact existing field `name`/`id`/validation attributes (`required`, `minLength`, `maxLength`, `inputMode`, etc.), and exact existing reset-on-success behavior — only `className`s and layout change.
8. `DeleteButton`'s restyle keeps its exact existing `useActionState` wiring and hidden `id` input — only the button/error-text styling changes.
9. Primary actions (submit buttons, active list-row accents if any) adopt `bg-dashboard-primary`/`hover:bg-dashboard-primary-hover`/`text-dashboard-on-primary` in place of the current `bg-zinc-900`/`text-white`, for visual consistency with the Phase 13a nav's active state. Destructive actions (`DeleteButton`) keep their existing `text-red-600` — not overridden by the primary token.

## Security requirements
- `docs/security.md` §2: `updateBusinessProfileAction`'s `businessId`/`orgId` come only from `requireAuthContext()`, never from form input or a hidden field (unlike the products/services/FAQs edit actions, which do take a client-supplied `id` — here there's no analogous per-row ID, since a business only ever edits its own single row resolved server-side).
- `docs/security.md` §3 (tenant isolation): `updateBusinessProfile()`'s `clerk_org_id` filter, plus RLS's existing `businesses_update_own_org` policy, are the two enforcement layers — matching this project's defense-in-depth convention. A cross-tenant update attempt (forged org context, if it were somehow possible) would still be blocked by RLS even if the application-layer filter were bypassed.
- New column-level grant is additive and narrow: `authenticated` gains `UPDATE` on `name`/`description`/`contact_email`/`contact_phone`/`website` only — `id`, `clerk_org_id`, `widget_key` remain unwritable via this or any existing grant. Verify this live (see Database changes above).
- Non-admin org members must not be able to reach `updateBusinessProfileAction` and have it succeed — verified by the same direct-Server-Action-bypass method already used and documented for Phase 4's onboarding admin check (`docs/architecture.md`'s Authentication section).
- Per `PRODUCT.md` §7 and Decision 1: the four new fields are not approved AI context. Confirm at implementation time (grep or read) that `lib/rag.ts` gained no new field reference — a silent scope-creep here would put unapproved business data in front of the model without a security/product review, which `AGENTS.md` §3 rule 4 (no fabricated business facts / only approved context reaches the AI) exists specifically to prevent.

## Error handling
- Invalid `name`/`description`/`contact_email`/`contact_phone`/`website`: existing `role="alert"` inline error pattern, same as every other form in this codebase — no new error UI pattern introduced. Each field's own validation message names the field so a multi-field form's single error slot (matching this codebase's existing one-`error`-string-per-`ActionState` convention) isn't ambiguous about which field failed.
- Non-admin attempts to update: `auth.protect({ role: "org:admin" })`'s existing rejection behavior (Phase 4 precedent) — the profile page itself never renders the form for a non-admin, so this is defense-in-depth against a direct Server Action call, not the primary UI gate.
- Any Supabase failure on update: existing `AppError`/`logAndGetUserMessage` convention, no raw error surfaced.

## Acceptance criteria
- [ ] `/dashboard/profile` is reachable from both the desktop sidebar and mobile nav, in the specified position (second item).
- [ ] An `org:admin` can change all five fields (name plus the four optional ones); the change is reflected immediately on `/dashboard/profile`, and the name change is also reflected on `/dashboard` (Overview heading) after the update.
- [ ] A non-admin org member sees all five current values read-only, with no functional form, on `/dashboard/profile`.
- [ ] A non-admin org member's direct Server Action invocation of `updateBusinessProfileAction` (bypassing the UI) fails and does not change the business row — confirmed the same way as Phase 4's equivalent check.
- [ ] A blank or 1-character name is rejected with an inline error, no database write attempted. An invalid email, an invalid URL, and a description over 500 characters are each independently rejected with an inline error, no database write attempted.
- [ ] All four optional fields can be left blank and persist as `null`, not empty strings.
- [ ] Products, Services, FAQs, and Knowledge list/create/edit pages are visually restyled (card rows, `dashboard-primary` accents, consistent spacing) with **zero functional regression** — every existing create/edit/delete action still works exactly as before.
- [ ] A second real test business's profile edit does not affect the first business's data (tenant isolation spot check on the new write path).
- [ ] `lib/rag.ts` is confirmed unchanged and the AI's answers are unaffected by the new fields (spot check: set a `description`/`website` value, ask the AI something only that field would answer, confirm it still gives the category-4 fallback rather than using the new field).
- [ ] `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

## Automated checks
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build` — confirm `/dashboard/profile` appears in the route manifest and every existing route is unchanged.
- No automated pgTAP test is written for this migration — same standing gap as most grant-only/nullable-column changes in this project (e.g. Phase 11's `widget_allowed_origin` grant) — covered by the live `has_column_privilege`-style manual check instead (see Database changes).

## Manual testing steps
1. As an `org:admin` on a real test business, visit `/dashboard/profile`. Confirm all five current values are pre-filled (blank for unset optional fields), change all five, save, and confirm the new values show on `/dashboard/profile`, and the new name shows on `/dashboard` (Overview).
2. As a non-admin member of the same business (or simulate via a second Clerk test user), visit `/dashboard/profile`. Confirm all five values display read-only with no editable form.
3. Attempt a direct Server Action call to `updateBusinessProfileAction` as a non-admin (same bypass technique as Phase 4's documented check). Confirm it fails and the business row is unchanged.
4. Submit a blank name, a 1-character name, an invalid email (`not-an-email`), an invalid URL (`not a url`), and a 501-character description, one at a time. Confirm each is rejected inline with no persisted change.
5. Clear all four optional fields and save. Confirm they persist as `null` (not empty strings) and the profile page correctly shows them as blank/unset on reload.
6. Log in as a second, different real test business. Edit its profile. Confirm the first business's data is unaffected (tenant isolation).
7. Ask the AI (via `/dashboard/ai-test`'s successor — actually via the widget or any existing chat surface, since `/dashboard/ai-test` no longer exists after 13a) a question that only a new profile field would answer (e.g. "what's your website?" after setting one). Confirm it still gives the category-4 unknown/fallback response, not an answer sourced from the new field — proving Decision 1's dashboard-only boundary held.
8. Click through Products, Services, FAQs, and Knowledge. Confirm the new card-row visual treatment renders correctly, and every existing action still works: create one row, edit it, delete it, in each of the four sections.
9. Confirm the shared `DeleteButton`'s restyle didn't break its pending/error states — trigger a delete, observe the pending label, and (if reproducible) an error state.
10. Confirm the new Business Profile nav item appears correctly in both desktop sidebar and mobile off-canvas nav, in the correct position, with correct active-state highlighting when on `/dashboard/profile`.
11. Re-run a subset of Phase 13a's manual tests (keyboard-only Tab through the now-8-item nav, screen-reader announcement of the new item) to confirm the addition didn't regress the nav's existing accessibility behavior.

## Out of scope
- Wiring `description`/`contact_email`/`contact_phone`/`website` into the AI's system prompt or context (Decision 1) — a separate, later decision, not assumed either way here.
- Conversations and Leads sections (13c).
- Any change to Products/Services/FAQs/Knowledge validation, data model, or Server Action logic — restyle only.
- Widget Settings page restyle — not requested this prompt; can be folded into 13c or a later polish pass if wanted.
- Business deletion or org-transfer flows — not specified anywhere in `PRODUCT.md`, not this prompt's job.
- Auto-prefixing a bare domain (e.g. `example.com` → `https://example.com`) for the `website` field — rejected as invalid instead, per Decision 9; revisit if this proves annoying in practice.
