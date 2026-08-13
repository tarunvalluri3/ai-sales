# Phase 13a — Dashboard shell, navigation, and overview

## Goal
After this, every signed-in business member sees a real, persistent dashboard shell (sidebar navigation on desktop, a collapsible off-canvas nav on mobile) wrapping all `/dashboard/*` pages, plus a real Overview page at `/dashboard` showing the business name and at-a-glance counts across every data area, with links into each section. The two throwaway manual-test pages from Phases 8 and 10 (`/dashboard/ai-test`, `/dashboard/leads-test`) are deleted. This is the first of three Phase 13 prompts — see "Why split into three" below.

## Current phase
Phase 13 — Business dashboard. Confirmed from `STATE.md` §1/§3.

## User request
Start Phase 13. Scope decision from the user: every existing unnavigated dashboard area becomes a real, navigated section — overview, business profile, products, services, FAQs, knowledge, conversations/leads, widget settings, all of it. `/dashboard/ai-test` and `/dashboard/leads-test` should be retired once real navigated UI covers their purpose, after verifying by inspection (not assumption) that nothing else depends on them. No existing dashboard-specific visual/brand system exists (Phase 12's tokens were scoped to the widget only) — decide explicitly whether the dashboard gets its own identity or borrows the widget's tokens for consistency, using the same design tools (21st.dev MCP, `ui-ux-pro-max`/`impeccable`) as Phase 12. Given the breadth, decide explicitly whether this is one prompt or several.

## Skills and docs read
- `STATE.md` (full file) — current phase, all prior phase entries, resolved decisions, migrations/tables, env vars, known gaps.
- `PRODUCT.md` (full file) — actor model, lead model, "what working means for v1."
- `docs/phases.md` — Phase 13's own entry: "Candidate areas: overview, business profile, products/services/FAQs, knowledge, conversations, leads, AI configuration. Build only areas the user approves. Exit: each built area is tenant-scoped and verified against a second test business."
- `docs/prompt-template.md` — this prompt's own contract.
- `docs/security.md` — not re-read line-by-line this prompt (no new tenant-scoping mechanism is introduced; every data read in this prompt reuses existing `requireBusinessContext()`-gated modules). Will be consulted again for Phase 13b/13c where new list/count queries against `leads`/`conversations` are added.
- `.claude/skills/ui-ux-pro-max/` and `.claude/skills/impeccable/` — referenced for the navigation/shell layout pattern and information-density guidance; used the same way Phase 12 used them (reference data, not a component installer).
- 21st.dev MCP (`mcp__21st__search`) — used for dashboard sidebar/shell layout inspiration only, same "inspiration, not installed code" rule as Phase 12's Decision 6.

## Existing code inspected
- `app/(dashboard)/layout.tsx` — the root layout for the whole `(dashboard)` route group (Clerk provider, Geist fonts, a bare header with `OrganizationSwitcher`/`UserButton`). No sidebar, no nav, no per-page chrome. This stays as the outermost layout; a new nested layout is added under it.
- `app/(dashboard)/globals.css` — minimal Tailwind v4 setup, two CSS variables (`--background`/`--foreground`), no color system, no design tokens beyond Geist font wiring.
- `app/(widget)/widget.css` — the Phase 12 widget's own token set (`--widget-primary: #4f46e5` / indigo, neutral grays, `--widget-*` custom properties feeding a Tailwind v4 `@theme inline` block), scoped only to the widget per Phase 12's Decision 5. Not imported anywhere outside `app/(widget)/`.
- `app/(dashboard)/dashboard/page.tsx` — current placeholder: resolves org → business via `getBusinessForOrg()`, redirects to `/onboarding` if none exists, otherwise renders just the business name centered on the page. This is being replaced by a real Overview page.
- `app/(dashboard)/dashboard/products/page.tsx`, `services/page.tsx`, `faqs/page.tsx`, `knowledge/page.tsx`, `leads/page.tsx`, `widget-settings/page.tsx` — all functional, all follow the same shape (`requireBusinessContext()` → list/read → Tailwind `zinc-*` utility classes, no shared nav/chrome, explicitly built "not wired into dashboard nav" per their own Phase 5/6/10/11 entries in `STATE.md`). These pages are **not modified in this prompt** — only wrapped by the new nested layout and linked from the new nav, per the decision below on what ships in 13a vs. 13b/13c.
- `app/(dashboard)/dashboard/ai-test/{page.tsx,actions.ts,ask-form.tsx}` and `app/(dashboard)/dashboard/leads-test/{page.tsx,actions.ts,conversation-tester.tsx}` — read in full. Both are self-contained: each page calls `requireBusinessContext()` directly, each action file only exports server actions consumed by its own page's client component, no other file imports anything from either directory.
- `Grep` across the whole repo (excluding `node_modules`) for `ai-test`/`leads-test` confirmed the only hits are: this file's own historical references inside `STATE.md`, `docs/architecture.md`, and past `prompts/*.md` files (point-in-time records, left as-is per `AGENTS.md` §5's "prompts are point-in-time implementation contracts" convention — not live code), plus `app/(dashboard)/dashboard/leads-test/actions.ts`'s own internal content. **No other file in the app links to or imports from either route.** Clean removal confirmed by inspection, not assumed.
- `lib/business.ts` — `getBusinessForOrg(orgId)` returns the full `Business` row (currently just `id`, `clerk_org_id`, `name`, `widget_key`, `widget_allowed_origin`, timestamps — no richer profile fields exist yet).
- `lib/business-context.ts` — `requireBusinessContext()` returns `{ userId, orgId, businessId, businessName }`, the standard pattern every dashboard page already uses.
- `lib/products.ts`, `lib/services.ts`, `lib/faqs.ts` — each exports a `list*ForBusiness(businessId)` returning full rows.
- `lib/leads.ts` — `listLeadsForBusiness(businessId)` returning full rows.
- `lib/conversations.ts` — only `createConversation()` and `getConversationForBusiness()` exist. **No list or count function for conversations exists yet.**
- `package.json` — no icon library, no UI component library, no additional font beyond `Geist`/`Geist_Mono` (via `next/font/google`). Confirmed nothing to reuse for nav icons; this prompt uses inline SVG, no new dependency.

## Relevant existing architecture
- `app/(dashboard)/` is a route group with its own root layout (Clerk provider + header). `app/(dashboard)/dashboard/` is itself the natural place for a **nested** layout, since the sidebar/nav chrome must wrap only `/dashboard/*` pages — not `/onboarding`, `/sign-in`, `/sign-up`, or `/session-tasks/choose-organization`, which intentionally have no dashboard chrome today and shouldn't gain any.
- Every dashboard page already independently calls `requireBusinessContext()` (redirects to onboarding/sign-in as needed) — this prompt's new nested layout adds a second call for nav-level data (business name), which is redundant with each page's own call but matches this project's existing "defense in depth, not relying on one layer" convention (e.g., `docs/architecture.md`'s Authentication section explicitly does this for `proxy.ts` + page-level checks).
- Server-only data access stays in `lib/*.ts` modules, tenant-filtered by `business_id` in addition to RLS — no exception in this prompt.
- No REST API surface is added; this is pure Server Component + Tailwind UI work, no Server Actions needed for read-only overview/nav (mobile nav toggle is local client state only, no data mutation).

## Decisions and assumptions

1. **Visual identity: borrow the widget's color tokens, keep the dashboard's own typography and layout system.** The dashboard is a materially different surface (dense navigation, tables, forms, multi-column layouts) than the widget's single chat panel, so it needs its own token set — but reusing the same indigo primary (`#4f46e5`)/neutral palette the widget already established gives the product one visible brand across the marketing-facing widget and the internal dashboard, which the user's phrasing ("intentionally borrows... for consistency") points toward. Concretely: a new `app/(dashboard)/globals.css` token block (`--dashboard-primary`, `--dashboard-primary-hover`, etc., mirroring the widget's naming convention) is added, scoped to `(dashboard)` the same way `widget.css` is scoped to `(widget)` — no shared CSS file, no cross-route-group import, each route group keeps its independent styling per Phase 12's established pattern. Typography stays Geist (already wired via `next/font/google` in the existing root layout) rather than switching to the widget's Inter — swapping the dashboard's established font is a real visual change with no product-driven reason, and the color-token alignment alone satisfies the "consistency" goal without unnecessary churn. **Flag this as worth confirming explicitly at approval time** if the user pictures something closer to a full shared design system.
2. **Three-prompt split, this is prompt 1 of 3.** Reasoning: (a) the sidebar's navigation structure and the color-token system are foundational — every later prompt's pages get wrapped by and styled against what this prompt establishes, so building it once, getting it approved and verified, then building on top of a settled foundation avoids rework; (b) the three groups have naturally different risk profiles — this prompt touches no database, no server actions, and deletes only self-contained pages (lowest risk); prompt 13b (business profile, products/services/FAQs/knowledge polish) touches existing tenant-scoped CRUD and may need a schema decision for business-profile fields beyond `name`; prompt 13c (conversations + leads) requires a **new** `listConversationsForBusiness()`/message-viewing capability that doesn't exist in any prior phase, and needs its own tenant-isolation verification against a second business, per the Phase 13 exit criterion. Splitting keeps each prompt's diff reviewable and each verification pass focused. **13b and 13c are not drafted yet** — they'll be written (and separately stopped-for-approval, per `AGENTS.md` §5) once this prompt is implemented and verified, so their designs can build on the shell this prompt actually produces rather than a guessed one.
3. **Nav shows only sections with a real, working page at the end of this prompt.** That's Overview (new), Products, Services, FAQs, Knowledge, Leads, Widget Settings — 7 items. "Business Profile" and "Conversations" are **not** added to the nav in this prompt, because no page exists yet for either (Business Profile has no dedicated page today — only inline on the old Overview placeholder; Conversations has no page or even a list-query function at all) — adding a nav entry for a page that 404s would be a broken link, which `AGENTS.md`'s "no half-finished implementations" rules out. Those two items are added to the nav by 13b (Business Profile) and 13c (Conversations) respectively, alongside the pages that back them.
4. **Overview's per-section counts reuse each area's existing `list*ForBusiness()` function and take `.length`**, rather than adding six dedicated `count`-only queries. At this product's actual data volume (a business's own products/services/FAQs/knowledge/leads), the extra row data fetched is negligible, and adding a parallel count-only query per table is speculative optimization for a scale this product isn't at — consistent with `AGENTS.md` §9's "no speculative abstraction." Flagged as a real tradeoff, revisit if any business's catalog grows large enough for this to matter.
5. **A new `countConversationsForBusiness(supabase, businessId)` is added to `lib/conversations.ts`** (the one new data-access function in this prompt) so the Overview page can show a conversation count without waiting for 13c's full conversation list — implemented as a tenant-filtered `select("id", { count: "exact", head: true })`, no row data fetched, no new migration (existing `conversations` table/RLS/grants already support authenticated `SELECT`, confirmed in `STATE.md` §6). This is a minimal, narrowly-scoped read, not a preview of 13c's list UI.
6. **Mobile nav is an off-canvas panel triggered by a hamburger button, client-side state only (`useState`, no persistence, no cookie).** No new dependency — implemented as a small client component (`app/(dashboard)/dashboard/_components/mobile-nav.tsx`) toggling a `fixed` overlay, matching the pattern already used for the widget's own responsive full-screen panel in Phase 12 (no reused code, just a consistent interaction idiom).
7. **The existing root header (`OrganizationSwitcher`/`UserButton`) in `app/(dashboard)/layout.tsx` is left as-is, unmoved.** It's already the correct place for account/org-level chrome (visible even outside `/dashboard`, e.g. on `/onboarding`); this prompt's new nested layout adds section-level nav below/beside it, not a replacement.
8. **No new npm dependency.** Nav icons are small inline SVGs (7 total, one per nav item), consistent with Phase 12's "no new dependency for UI, hand-built with Tailwind" decision.

## Open decisions this depends on
None. No entries in `STATE.md` §4 block this work.

## Dependencies / packages required
None. Confirmed against `package.json` — no icon library, UI kit, or font package is added.

## Files likely to change
**Created:**
- `app/(dashboard)/dashboard/layout.tsx` — new nested layout: calls `requireBusinessContext()`, renders `<Sidebar>` (desktop) + `<MobileNav>` (mobile) + `<main>{children}</main>`.
- `app/(dashboard)/dashboard/_components/sidebar.tsx` — desktop sidebar nav, server or client component (server is fine; active-link styling can be done via `usePathname` in a small client wrapper if needed — decide at implementation time based on what's cleanest, document the choice).
- `app/(dashboard)/dashboard/_components/mobile-nav.tsx` — client component, hamburger + off-canvas panel.
- `app/(dashboard)/dashboard/_components/nav-items.ts` — shared nav item list (label, href, icon) consumed by both sidebar and mobile nav, so the two never drift.
- `app/(dashboard)/dashboard/_components/stat-card.tsx` — small presentational component for the Overview page's counts.

**Modified:**
- `app/(dashboard)/dashboard/page.tsx` — replaced with the real Overview: business name, a grid of `StatCard`s (products/services/FAQs/knowledge documents/leads/conversations counts), links into each section.
- `app/(dashboard)/globals.css` — add the new dashboard color-token block (Decision 1).
- `lib/conversations.ts` — add `countConversationsForBusiness()` (Decision 5).
- `docs/architecture.md` — add a short "Dashboard shell and navigation (Phase 13a)" note documenting the nested-layout pattern and the token-borrowing decision, for future phases to follow.

**Deleted:**
- `app/(dashboard)/dashboard/ai-test/` (all three files).
- `app/(dashboard)/dashboard/leads-test/` (all three files).

## Database changes
None. No migration, no new table/column/index/policy. `countConversationsForBusiness()` is a new query against the existing `conversations` table using its existing RLS/grants (verified in `STATE.md` §6: `authenticated` already has `SELECT`).

## Server / client boundaries
- `app/(dashboard)/dashboard/layout.tsx`, the Overview page, and `Sidebar` (if implemented as a server component) run server-only, same as every existing dashboard page — `requireBusinessContext()` and every `lib/*.ts` call stay server-side.
- `MobileNav` (and `Sidebar` only if active-link highlighting requires `usePathname`) are client components — no secrets, no direct database access; they receive the nav item list and any needed business-scoped data as props from the server layout.
- No secret is newly introduced or newly exposed. No `NEXT_PUBLIC_*` variable added.

## Implementation requirements
1. `app/(dashboard)/dashboard/layout.tsx` calls `requireBusinessContext()` once, passes `businessName` down to the nav components (used for a small header label), and renders the shell: a fixed/sticky sidebar on `md:` and above, a top bar with a hamburger button below `md:`, and `<main>` wrapping `{children}`.
2. `nav-items.ts` exports exactly 7 entries in this order: Overview (`/dashboard`), Products (`/dashboard/products`), Services (`/dashboard/services`), FAQs (`/dashboard/faqs`), Knowledge (`/dashboard/knowledge`), Leads (`/dashboard/leads`), Widget Settings (`/dashboard/widget-settings`).
3. The active nav item (matching the current pathname, exact match for `/dashboard`, prefix match for nested routes like `/dashboard/products/[id]/edit`) gets a visually distinct state (background/text color from the new token set) and `aria-current="page"`.
4. Overview page (`app/(dashboard)/dashboard/page.tsx`) keeps the existing org/business-resolution guard (no `orgId` → prompt to select/create an org; no business → redirect to `/onboarding`) exactly as today, then renders: business name as a page heading, a responsive grid of 6 `StatCard`s (Products, Services, FAQs, Knowledge documents, Leads, Conversations — each showing a count and linking to its section; Conversations links to `/dashboard/leads` for now, since no conversations page exists until 13c — document this as a deliberate temporary link, not a bug), each count sourced from: `listProductsForBusiness`, `listServicesForBusiness`, `listFaqsForBusiness` (confirm exact export name by reading `lib/faqs.ts` before writing the call), a knowledge-documents list function (confirm exact export name by reading `lib/knowledge.ts`), `listLeadsForBusiness`, and the new `countConversationsForBusiness`.
5. `countConversationsForBusiness(supabase, businessId)` in `lib/conversations.ts` follows the exact existing file's conventions: takes the Supabase client as its first parameter (matching `createConversation`/`getConversationForBusiness`), tenant-filters by `business_id`, wraps any Supabase error in `AppError` with the same message style as the file's other two functions, returns a `number`.
6. Delete `app/(dashboard)/dashboard/ai-test/` and `app/(dashboard)/dashboard/leads-test/` entirely (all files in both directories).
7. `app/(dashboard)/globals.css` gains a token block modeled on `app/(widget)/widget.css`'s structure (a `:root` block of custom properties, a `@theme inline` block mapping them to Tailwind's color namespace) — reuse the widget's indigo primary/hover values exactly (`#4f46e5`/`#4338ca`) for the shared-brand primary color, but the dashboard's own neutral/surface/border scale (the existing `zinc-*` Tailwind utilities already used throughout every dashboard page today are fine to keep using directly — no need to also tokenize grays that Tailwind already provides).
8. Every existing dashboard page (`products`, `services`, `faqs`, `knowledge`, `leads`, `widget-settings`, and their nested `[id]/edit` routes) needs **no code change** in this prompt — they inherit the new nested layout automatically by virtue of living under `app/(dashboard)/dashboard/`. Confirm this is true by checking the build's route manifest after implementation (no route should move or change URL).
9. The desktop `Sidebar` and the mobile nav's item list are both wrapped in a semantic `<nav aria-label="Dashboard">` (or equivalent distinct label per instance, e.g. `"Dashboard, mobile"` if two `<nav>` landmarks are simultaneously present in the DOM) landmark — not a bare `<div>` list of links.
10. The hamburger trigger is a real `<button>` (native keyboard operability via Enter/Space is inherited from the element, not re-implemented) and carries `aria-expanded` reflecting the panel's current open/closed state plus `aria-controls` pointing at the off-canvas panel's `id`.
11. While the mobile off-canvas panel is open, pressing Escape closes it and returns focus to the hamburger trigger — the same pattern already established by the widget's chat panel in Phase 12 (`app/(widget)/widget/embed/_components/panel.tsx`, confirmed working via that phase's keyboard-only manual test).

## Security requirements
- No new tenant-scoping mechanism. `countConversationsForBusiness` follows the same `business_id`-filter-plus-RLS pattern as every other query in the codebase (`docs/security.md` §1's tenant isolation rule).
- `businessId`/`businessName` passed to nav/layout components come only from `requireBusinessContext()` — never from a route param, query string, or client-supplied value (`docs/security.md` §2).
- No secret touched. No new env var.

## Error handling
- Layout-level `requireBusinessContext()` failure behaves exactly as it already does everywhere else in the app (redirect to sign-in/onboarding) — no new error path introduced.
- If a count query fails, it should surface the same way `AppError` failures already do elsewhere (thrown, caught by the nearest error boundary / Next.js error handling) — no special-cased silent-zero fallback that could misrepresent real data as "nothing yet."

## Acceptance criteria
- [ ] Visiting `/dashboard` while signed in with a business shows a real Overview page: business name, 6 stat cards with correct counts, no more centered placeholder text.
- [ ] The sidebar (desktop, ≥768px) lists exactly the 7 nav items in the specified order, with the current page visually marked as active and carrying `aria-current="page"`.
- [ ] Below 768px, the sidebar is replaced by a hamburger-triggered off-canvas nav with the same 7 items; opening/closing works via mouse and keyboard (Enter/Space to open, Escape to close, focus returns to the trigger on close).
- [ ] Every one of the 7 nav links navigates to its existing, already-functional page with no 404 and no visual regression to that page's own content.
- [ ] `/dashboard/ai-test` and `/dashboard/leads-test` both return Next.js's standard 404 (routes no longer exist).
- [ ] No other route or page is broken by the deletion (confirmed via `npm run build`'s route manifest, and via `Grep` showing no remaining live-code reference).
- [ ] A second real test business shows its own correct counts and business name, not the first business's data (tenant-isolation spot check for this prompt's one new query, `countConversationsForBusiness`).
- [ ] `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

## Automated checks
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build` — confirm the route manifest no longer lists `/dashboard/ai-test` or `/dashboard/leads-test`, and every other existing route is still present and unchanged.
- No automated tenant-isolation test suite exists for this table beyond the already-written (not automatically run) pgTAP files — same standing gap as every prior phase. Manual cross-tenant verification below covers this prompt's one new query.

## Manual testing steps
1. Sign in as a real test business with existing products/services/FAQs/knowledge/leads. Visit `/dashboard`. Confirm the business name renders, all 6 stat cards show correct non-zero counts matching what's actually in each section, and each card links to the right page.
2. Click through all 7 sidebar nav items at desktop width. Confirm each lands on the correct, already-working page (no visual break from the new layout wrapper) and the sidebar highlights the correct active item on each.
3. Resize to mobile width (or use device emulation). Confirm the sidebar disappears and a hamburger button appears; tapping it opens the off-canvas nav with all 7 items; tapping a link or the backdrop closes it and navigates correctly.
4. Keyboard-only pass: Tab to the hamburger button, open with Enter, Tab through the nav items, close with Escape, confirm focus returns to the hamburger button.
5. Screen reader spot check (Windows Narrator or NVDA): confirm the nav is announced as a navigation landmark, the active page is announced as current, and the hamburger button's expanded/collapsed state is announced.
6. Log in as a second, different real test business with different (or zero) products/services/FAQs/knowledge/leads/conversations. Confirm its Overview page shows its own correct counts — not the first business's numbers, not a stale/cached value.
7. Directly request `GET /dashboard/ai-test` and `GET /dashboard/leads-test` (typed URL, not a link). Confirm both 404.
8. Re-run every negative/positive manual test already recorded as passing for Products/Services/FAQs/Knowledge/Leads/Widget Settings in their own phase entries (`STATE.md` §2) — spot-check at least one CRUD action per section — to confirm the new layout wrapper introduced no regression to any existing page's actual functionality.

## Out of scope
- Business Profile page/section (13b).
- Any restyling of Products/Services/FAQs/Knowledge/Leads/Widget Settings pages beyond automatically inheriting the new layout wrapper (13b).
- Conversations list/detail UI and its full data-access layer beyond the one minimal count function (13c).
- Any new business-profile database column (no product-scoped need identified yet; would require its own decision).
- Dark mode / theming beyond the single light palette already established by the widget (matches Phase 12's own "light-mode-only" decision).
- Any change to `app/(widget)/**` (unrelated route group, untouched).
