# Phase 18 — Analytics / monitoring

## Goal
After this is implemented: (1) every business member can view a new `/dashboard/analytics` page showing tenant-scoped business metrics (conversation volume, message volume by role, lead counts by qualification/status, callback requests, conversion rate, and conversations currently needing attention) derived entirely from existing tables; and (2) the AI/business-logic code paths that currently log ad hoc, inconsistent `console.log`/`console.error` lines emit a single consistent structured event format instead, so production log output (captured by Vercel, the project's existing deployment target — no new tool) is actually usable for debugging and tracking meaningful events, without ever including secrets or prospect PII.

## Current phase
Phase 18 — Analytics / monitoring. Confirmed from `STATE.md` §1/§3. Phases 16 (WhatsApp) and 17 (Razorpay) were explicitly deferred by the user's 2026-08-14 decision (`STATE.md` §1/§4, decision D11) — this is a reorder only, no security-rule change.

## User request
Implement Phase 18 as a single prompt end-to-end (per the new standing process rule, D11), scoped per the user's explicit answers to a clarifying question asked before writing this prompt:
- **In scope:** in-app business analytics (dashboard metrics built on existing Supabase data) + server-side structured logging.
- **Out of scope:** any third-party error-tracking or product-analytics service (Sentry, PostHog, Vercel Analytics, etc.) — no new dependency, no new API key/DSN, no new secret.

## Skills and docs read
- `STATE.md` (§1, §3, §4, §5, §6) — current phase, env vars, database state, resolved decisions.
- `PRODUCT.md` §10 — confirms WhatsApp/Razorpay are "out of scope until explicitly scheduled," consistent with the D11 reorder.
- `docs/phases.md` — Phase 18's entry: "Production observability after the core product works. Approved tools only. Track meaningful events without logging secrets or unnecessary personal data." No explicit exit criterion is written for Phase 18 in this file (unlike every other phase) — flagged below under "Decisions and assumptions."
- `docs/security.md` — not re-read in full this pass; no new secret, auth, or tenancy mechanism is introduced, so no new obligations beyond the standing rules already applied identically to every other dashboard page in this codebase.
- `docs/architecture.md` — not modified structurally; this phase adds one new documented pattern (structured event logging) per its existing convention of recording cross-cutting patterns.
- No skill was needed for this phase (no Clerk, Supabase-schema, or UI-redesign work beyond the existing dashboard page pattern).

## Existing code inspected
- `app/(dashboard)/dashboard/page.tsx`, `_components/stat-card.tsx` — the existing Overview page's pattern: `requireBusinessContext()` for tenant scoping, a `createServerSupabaseClient()` instance, parallel data fetches, `<StatCard label count href />` tiles in a responsive grid.
- `app/(dashboard)/dashboard/_components/nav-items.tsx` — the `NAV_ITEMS` array (9 entries, Overview → Widget Settings) and its hand-drawn inline SVG icon convention (no icon library).
- `lib/conversations.ts` — client-injection convention (`supabase` passed in, not constructed internally), `countConversationsForBusiness`, `countConversationsNeedingAttention` (already exactly the "currently needing attention" metric this phase needs, reused as-is).
- `lib/leads.ts` — the alternate convention (constructs its own `createServerSupabaseClient()` internally) used by every lead-related function; `Lead`/`LeadStatus` types in `lib/supabase/types.ts` (not opened this pass, referenced from existing imports) carry `qualification` (`hot`/`warm`/`cold`), `status` (`new`/`contacted`/`converted`/`lost`), `requested_callback` (boolean, Phase 14c).
- `lib/errors.ts` — `AppError` + `logAndGetUserMessage()`, the existing (unstructured) server-side error-logging convention. Left untouched by this phase — see "Decisions and assumptions."
- `app/api/chat/route.ts` — the widget's only entry point; already calls `flagConversationNeedsAttention()` on `escalate: true` and has three rate-limit checkpoints (`ip`, `key`, `conversation`), none of which currently log anything on rejection.
- `lib/tools/check-faq-topic.ts` (read in full) and confirmed the same pattern exists in `lib/tools/check-product-details.ts` and `lib/tools/request-callback.ts` (per `STATE.md`'s Phase 14a/14b/14c entries): each tool's `execute*` function calls ad hoc `console.log`/`console.error` with a mix of positional arguments (`businessId`, free-text `topic`, a result-reason string) — not structured, not consistent between tools.
- `lib/rag.ts` — one unstructured `console.error` for an unrecognized tool-call name; otherwise no event logging around escalation or tool dispatch.

## Relevant existing architecture
- Every dashboard page is protected via `requireBusinessContext()` (redirects, not throws, on missing org/business) and reads through a per-request `createServerSupabaseClient()`, with RLS plus an explicit `business_id` filter on every query (defense in depth, per `AGENTS.md` §3 rule 1).
- Two established data-access conventions coexist: client-injected functions (`lib/conversations.ts`, take `supabase` as a parameter, shared between the Clerk-authenticated dashboard path and the service-role widget path) and self-constructing functions (`lib/leads.ts`, dashboard-only). Analytics is dashboard-only and read-only, so it follows the `lib/leads.ts` shape: a page-level `createServerSupabaseClient()` passed to a new `lib/analytics.ts`, matching `lib/conversations.ts`'s injected-client pattern for consistency with the one metric it reuses directly (`countConversationsNeedingAttention`).
- No table in this schema currently persists a historical log of discrete events (escalations, tool calls, rate-limit rejections) — only current-state columns (`conversations.needs_attention`, which gets cleared) or implicit facts inferable from existing rows (a `leads` row implies a conversation qualified; `messages.role = 'human_agent'` implies a staff reply happened). This phase does not add an event-log table — see "Decisions and assumptions" for why.

## Decisions and assumptions
1. **No new database table, migration, or grant.** All in-app analytics metrics are computed from existing tables (`conversations`, `messages`, `leads`) that the signed-in business member's session can already read under existing RLS policies and grants — no schema change is needed to satisfy the user's chosen scope. Flag for `STATE.md`: worth recording as a lightweight decision, not necessarily a lettered `D` entry, since it is fully derivable from this prompt's own scope answer rather than an open ambiguity.
2. **`docs/phases.md` has no written exit criterion for Phase 18**, unlike every other phase entry. This prompt does not edit `docs/phases.md` (out of scope for this prompt — a docs-only fix would need its own trivial-change pass or approval). The acceptance criteria below serve as the de facto exit criterion for this implementation.
3. **Structured logging is scoped narrowly**, to the handful of call sites that already log ad hoc business-event information today (`app/api/chat/route.ts`'s escalation/rate-limit paths, the three tool `execute*` functions, `lib/rag.ts`'s unrecognized-tool-call branch) — not a sweep of every `console.*` call in the codebase. `lib/errors.ts`'s `logAndGetUserMessage()` (the general error-logging path, used everywhere) is deliberately left unmodified: it already serves its purpose (internal detail server-side, safe message to the client) and rewriting it is a larger, separately-scoped concern with a much bigger blast radius than "track meaningful events."
4. **The structured logger has a closed metadata shape** (`string | number | boolean | null` values only, no free-text field) specifically so a caller cannot accidentally pass prospect-supplied message content, contact info, or tool-call free-text arguments (e.g. a FAQ `topic` string) into a log line — enforced by the TypeScript type, not runtime redaction. This directly serves `docs/phases.md`'s "without logging secrets or unnecessary personal data" instruction. Tool-call logging therefore logs *outcomes* (`tool: "check_faq_topic", result: "found"`) not *inputs* (never the topic/product-name string itself) — a deliberate narrowing versus the current ad hoc lines, which do log the raw free-text argument.
5. **No date-bucketed chart.** "Last 7 days" / "last 30 days" conversation counts are computed as two extra `count`-only queries with a `.gte("created_at", cutoff)` filter (cutoff computed in JS at request time), not a new SQL function or a charting library — consistent with `docs/security.md`/`AGENTS.md`'s "smallest option that fits" discipline and this project's existing "no charting library" precedent (Overview page uses plain stat tiles, no chart).
6. **New UI component, not a chart:** breakdowns (leads by qualification, leads by status, messages by role) render as a small labeled list inside a card (`StatBreakdown`), reusing `StatCard`'s visual language (border, rounded corners, zinc palette) rather than introducing a new visual system.
7. **Nav placement:** "Analytics" is inserted into `NAV_ITEMS` after "Leads" and before "Widget Settings" — it is a read-only insight surface over conversation/lead data, logically grouped with the data it summarizes, and kept out of the settings tail.
8. **Conversion rate** = `leads.total / conversations.total`, rendered as a percentage, `0%` when `conversations.total` is `0` (guarded, not a divide-by-zero). This is a simple ratio for display only — not a new stored/derived column, not used by any AI or business-logic path.

## Open decisions this depends on
None. D11 (§4) already resolved the phase-ordering and single-prompt-per-phase questions this prompt itself is subject to.

## Dependencies / packages required
None. No new npm package. Confirmed against `package.json`: `@langchain/*`, `@google/genai`, `@supabase/supabase-js`, `@clerk/nextjs`, `zod` are already installed and sufficient.

## Files likely to change
Created:
- `lib/analytics.ts` — server-only, read-only aggregate queries (conversation volume, message volume by role, lead breakdowns, callback count, conversion rate), client-injected per `lib/conversations.ts`'s convention.
- `lib/logger.ts` — server-only, `logEvent(event, businessId, metadata?)` structured JSON logger.
- `app/(dashboard)/dashboard/analytics/page.tsx` — the new dashboard page.
- `app/(dashboard)/dashboard/_components/stat-breakdown.tsx` — new small presentational component for labeled count breakdowns.

Modified:
- `app/(dashboard)/dashboard/_components/nav-items.tsx` — new `NAV_ITEMS` entry + one new inline SVG icon.
- `app/api/chat/route.ts` — replace/add `logEvent()` calls at the escalation branch and the three rate-limit-rejection branches (no behavior change, logging only).
- `lib/tools/check-product-details.ts`, `lib/tools/check-faq-topic.ts`, `lib/tools/request-callback.ts` — replace each ad hoc `console.log`/`console.error` call with `logEvent()`, same outcomes, no free-text arguments logged.
- `lib/rag.ts` — replace the one unrecognized-tool-call `console.error` with `logEvent()`.
- `docs/architecture.md` — document the new structured-logging convention (event name, businessId, closed metadata shape, no PII/free-text) as the standing rule for any future logging call site, mirroring how prior phases recorded new standing rules there.

Not changed: no migration files, no RLS policy, no grant, `lib/supabase/types.ts` (no new/changed table shape), `lib/errors.ts` (see Decision 3).

## Database changes
None. No migration. No new table, column, index, or RLS policy. No new grant.

## Server / client boundaries
- `lib/analytics.ts` and `lib/logger.ts` are both `server-only` (matching every other `lib/` module in this codebase).
- `app/(dashboard)/dashboard/analytics/page.tsx` is a Server Component (async, no client-side data fetching, no new client component needed beyond the existing `StatCard`/new `StatBreakdown`, both presentational and prop-driven — no state, no `"use client"` needed for either since they render static server-computed numbers, same as `StatCard` today).
- No secret is read, logged, or exposed. `logEvent()`'s metadata type structurally cannot carry a secret or free-text PII field (Decision 4) — this is a type-level guarantee, not a runtime filter, so code review at implementation time must still confirm no call site is coerced/cast around it.
- No new env var.

## Implementation requirements
1. `lib/logger.ts` exports `type LogMetadata = Record<string, string | number | boolean | null>` and `logEvent(event: string, businessId: string, metadata?: LogMetadata, level?: "info" | "error"): void`. Emits one JSON line via `console.log` (level `"info"`, the default) or `console.error` (level `"error"`) with shape `{ event, businessId, timestamp: new Date().toISOString(), ...metadata }`. No return value, never throws (a logging call must never break the caller's own control flow — wrap `JSON.stringify` in a `try`/`catch` that falls back to a plain `console.log(event, businessId)` if serialization somehow fails).
2. `lib/analytics.ts` exports (all take `(supabase, businessId)`, all read-only, all filtered by `business_id` in addition to RLS):
   - `getConversationVolumeStats(supabase, businessId): Promise<{ total: number; last7Days: number; last30Days: number }>`
   - `getMessageVolumeStats(supabase, businessId): Promise<{ user: number; assistant: number; humanAgent: number }>`
   - `getLeadStats(supabase, businessId): Promise<{ total: number; byQualification: { hot: number; warm: number; cold: number }; byStatus: { new: number; contacted: number; converted: number; lost: number }; requestedCallback: number }>`
   Each uses `count`-only (`{ count: "exact", head: true }`) queries, never fetches full row data. Errors from any query throw `AppError` (same convention as `lib/conversations.ts`/`lib/leads.ts`) with a safe user-facing message and an internal detail string naming the failed function.
3. `app/(dashboard)/dashboard/analytics/page.tsx`: `requireBusinessContext()` first; builds one `createServerSupabaseClient()`; fetches conversation volume, message volume, lead stats, and `countConversationsNeedingAttention` (reused from `lib/conversations.ts`, not reimplemented) in parallel via `Promise.all`; computes conversion rate in the page (`leadStats.total / conversationStats.total`, guarded for zero); renders: a stat-tile row (Total conversations, Last 7 days, Last 30 days, Needs attention now, Conversion rate) using `StatCard` where a single number+link fits, plus `StatBreakdown` cards for "Leads by qualification," "Leads by status," and "Messages by role."
4. `StatBreakdown` props: `{ label: string; items: { label: string; count: number }[] }` — renders a card matching `StatCard`'s border/rounding/palette, with the section label and a simple list of `label: count` rows. No link (unlike `StatCard`, which is always a `Link`) since a breakdown has no single natural destination.
5. `NAV_ITEMS` gains `{ label: "Analytics", href: "/dashboard/analytics", icon: AnalyticsIcon }`, inserted after the `Leads` entry and before `Widget Settings`. `AnalyticsIcon` follows the file's existing hand-drawn inline-SVG convention (20x20 viewBox, `currentColor` stroke, `aria-hidden="true"`) — a simple bar-chart glyph, visually distinct from `LeadsIcon`/`ConversationsIcon`.
6. `app/api/chat/route.ts`: call `logEvent("chat_escalation_triggered", business.businessId, { conversationId: conversation.id })` immediately after the existing `flagConversationNeedsAttention()` call (same `if (response.escalate)` branch, no new branch). Call `logEvent("rate_limit_exceeded", <businessId-if-known-else-"unknown">, { scope: "ip" | "key" | "conversation" }, "error")` at each of the three existing `429` return points — for the `ip`-scope rejection (before `business` is resolved), pass the literal string `"unknown"` as `businessId` rather than the raw IP (the IP itself must never appear in a log line under Decision 4's PII rule).
7. `lib/tools/check-product-details.ts`, `lib/tools/check-faq-topic.ts`, `lib/tools/request-callback.ts`: replace each existing `console.log`/`console.error` call with `logEvent("tool_invoked", businessId, { tool: "<tool_name>", result: "<outcome>" })` (or `"error"` level for the two existing lookup-failure branches) — outcome values are the existing short enum strings already used (`"found"`, `"not_found"`, `"invalid_input"`, `"lookup_failed"`, etc.), never the free-text input argument.
8. `lib/rag.ts`: replace the unrecognized-tool-call `console.error` with `logEvent("tool_invoked", businessId, { tool: toolCall.name, result: "unrecognized" }, "error")`.
9. `docs/architecture.md`: add a short "Structured event logging" note under an appropriate existing section (or a new small section near "Route handler conventions"/"Database"), stating: use `logEvent()` for discrete business events going forward, metadata values must be identifiers/counts/enums only, never free text or secrets; general error logging continues to go through `lib/errors.ts`'s `logAndGetUserMessage()` unchanged.

## Responsive behavior
Same breakpoint convention as the Overview page's existing stat grid (`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`) — no new breakpoint is introduced. The stat-tile row (Total conversations, Last 7 days, Last 30 days, Needs attention now, Conversion rate) uses that same grid class, so it stacks to one column below `sm`, two at `sm`, three at `lg` — five tiles wrap to a second row at every width, same as Overview already does with six tiles today. The three `StatBreakdown` cards (leads by qualification, leads by status, messages by role) sit in their own grid below the stat-tile row, `grid grid-cols-1 gap-4 md:grid-cols-3` — full-width stacked on mobile (each breakdown's label/count list is short enough not to need its own internal scroll), three-across from `md` up. Within a single `StatBreakdown` card, the label/count rows are a simple vertical flex list at every width — no internal responsive behavior needed since it's never wider than its parent card.

## Loading state
No new loading UI. This page follows the exact convention already used by every dashboard page in this codebase (Overview, Leads, Products, etc.) — no `loading.tsx` exists anywhere under `app/(dashboard)/dashboard/`, confirmed by inspection. The Server Component awaits its `Promise.all` of four queries before rendering anything; Next.js shows nothing new until the full page is ready (no skeleton, no spinner), identical to the Overview page's existing behavior. Not introducing a loading skeleton here is a deliberate consistency choice, not an oversight — adding one only to this page would make it behave differently from its eight sibling pages for no product reason.

## Empty state
A business with zero conversations, leads, and messages sees the stat tiles render with literal `0` values (Total conversations: 0, Last 7 days: 0, Last 30 days: 0, Needs attention now: 0, Conversion rate: 0%) — `StatCard` already renders whatever `count` it's given with no special-cased empty variant, so this requires no new logic, only confirming the divide-by-zero guard (Decision 8) actually returns `0%` rather than `NaN%` or throwing. Each `StatBreakdown` card still renders with all-zero rows (e.g. "Hot: 0 / Warm: 0 / Cold: 0") rather than collapsing or showing a placeholder message — a breakdown of zero counts is still meaningful, unlike the Leads list page's "No leads yet." empty-list message (a list has nothing to enumerate when empty; a breakdown of counts is well-defined at zero and stays structurally identical, so no separate empty-state message is added for `StatBreakdown`).

## Accessibility
Nav item: "Analytics" is a standard `<Link>` list item identical in markup to the other eight `NAV_ITEMS` entries — inherits the existing focus ring, active-state `aria-current`/highlighting (if `Sidebar`/`MobileNav` already set one — confirm and reuse whatever the existing pattern is, do not invent a new one), and keyboard reachability, same as acceptance criterion 4 already states.
`StatBreakdown`: each label/count pair is not just visually adjacent text — render each row as a `<dt>`/`<dd>` pair inside a `<dl>` (a description list is the correct semantic structure for "label → value" data, and is read by screen readers as explicitly paired, unlike two sibling `<span>`s or a bare flex row of unrelated text nodes). The card's overall heading (e.g. "Leads by qualification") is a real heading element (`<h2>` or `<h3>`, matching whatever heading level `StatCard`'s sibling content already uses on this page) associated with its `<dl>` so a screen-reader user navigating by headings lands on a labeled section, not an anonymous list. `StatCard` itself is unchanged and already accessible (a labeled link with visible text, no icon-only or color-only meaning) — no new requirement there beyond what's already true today.

## Security requirements
- Tenant scoping: every analytics query filters by `business_id` (from `requireBusinessContext()`, never client input) in addition to RLS, per `AGENTS.md` §3 rule 1 — identical pattern to every existing dashboard data-access function.
- Trusted identity: `businessId` passed into every `logEvent()` call comes from an already-validated source (`requireBusinessContext()` in the dashboard/tool paths, `resolveBusinessFromWidgetKey()`'s result in `app/api/chat/route.ts`) — never client-supplied, per `AGENTS.md` §3 rule 2.
- No secret handling changes; no new env var, no new client, no new logging destination beyond stdout (captured by the existing Vercel deployment target) — per `AGENTS.md` §3 rule 3.
- No fabricated business facts / no AI trust issue: this phase touches no retrieval or generation logic, only logging around existing AI-pipeline outcomes and read-only aggregate display — `AGENTS.md` §3 rules 4–5 are unaffected.
- PII discipline: `logEvent()`'s metadata type structurally excludes free-text fields; Requirement 7 explicitly forbids logging tool-call input arguments; Requirement 6 explicitly forbids logging raw IP addresses.

## Error handling
- Any `lib/analytics.ts` query failure throws `AppError`; the analytics page does not currently have a dedicated error boundary — confirm during implementation whether the existing dashboard layout's error handling (if any `error.tsx` exists) covers it, or add a minimal one consistent with any existing pattern for other dashboard pages (inspect at implementation time; do not invent a new error-UI pattern if one already exists for sibling pages).
- `logEvent()` itself never throws (Requirement 1) — a logging failure must never surface to the prospect or the dashboard user, or interrupt the request it's attached to.
- No behavior change to any existing success/failure response shape in `app/api/chat/route.ts` or any tool — this phase only adds logging calls alongside existing control flow, never replaces a return value or a thrown error.

## Acceptance criteria
- [ ] `/dashboard/analytics` renders for an authenticated business member and shows: total/7-day/30-day conversation counts, message counts by role, lead counts by qualification and by status, requested-callback count, conversations currently needing attention, and a conversion-rate percentage.
- [ ] All analytics numbers are correct for a real test business with known data (verified by cross-checking against direct counts from `/dashboard/conversations`, `/dashboard/leads`, and a direct DB query).
- [ ] A second test business's analytics page shows only its own numbers — no cross-tenant leakage, verified by comparing two businesses with different data side by side.
- [ ] "Analytics" appears in the sidebar/mobile nav between "Leads" and "Widget Settings," highlights correctly when active, keyboard-navigable like existing nav items.
- [ ] A real widget escalation produces a `chat_escalation_triggered` structured log line containing `businessId` and `conversationId`, no free text.
- [ ] A real rate-limit rejection (any of the three scopes) produces a `rate_limit_exceeded` structured log line with the correct `scope`, and never contains a raw IP address.
- [ ] Each of the three tools, when invoked live through `/api/chat`, produces a `tool_invoked` structured log line with the correct `tool` name and outcome, and never contains the free-text argument (topic/product name) that triggered it.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass.

## Automated checks
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- No new pgTAP test — no schema change. If the acceptance-criteria cross-tenant check surfaces any RLS gap (it should not, since this phase adds no new query patterns beyond existing conventions), stop and treat that as a defect in an *existing* table's policy, not something to patch inside this prompt's scope without flagging it first.

## Manual testing steps
1. As a signed-in member of Business A (with existing conversations/leads/messages from prior phases' testing), visit `/dashboard/analytics`. Confirm every stat tile and breakdown renders with plausible, non-zero numbers.
2. Cross-check at least two numbers directly: total conversations should match `/dashboard/conversations`' list length; total leads and their qualification/status split should match `/dashboard/leads`.
3. Switch to Business B (a second, distinct test business). Confirm its analytics page shows different numbers than Business A's, and that neither business's numbers changed as a side effect of viewing the other's page.
4. Directly navigate to `/dashboard/analytics` while signed out, or with no business yet onboarded — confirm the existing `requireBusinessContext()` redirect behavior applies exactly as it does for every other dashboard page (no special-cased bypass).
5. From the widget (`public/test-widget.html` or equivalent), send a message that triggers a real escalation (e.g. explicitly asking for a human). In the dev server's terminal output, confirm a `chat_escalation_triggered` JSON log line appears with the correct `businessId`/`conversationId` and no prospect message content.
6. Send enough widget requests to trip the `ip` or `conversation` rate limit (reuse the existing Phase 11/15b rate-limit test approach). Confirm a `rate_limit_exceeded` log line appears with the correct `scope` and confirm by inspection that no IP address string appears anywhere in the log output.
7. Send a message that triggers each of the three tools (`check_product_details`, `check_faq_topic`, `request_callback` — reuse the existing per-tool manual test flows from Phases 14a/14b/14c) and confirm each produces a `tool_invoked` log line with the correct tool name and outcome, and that the free-text input (product name, FAQ topic) never appears in the log line.
8. Tab through the sidebar nav with keyboard only; confirm "Analytics" is reachable in the correct position and behaves like every other nav item (focus ring, active-state highlighting on `/dashboard/analytics`).

## Out of scope
- Any third-party error-tracking or product-analytics service (Sentry, PostHog, Vercel Analytics, or similar) — explicitly excluded by the user's scope answer; would need its own future-scoped prompt with its own env var/secret review.
- Historical event log / time-series charts for escalations or tool usage — no new table is added this phase (Decision 1/3); if trend charts are wanted later, that is a new, separately-scoped decision (likely requiring a new append-only events table).
- Editing `docs/phases.md` to add Phase 18's missing exit criterion — flagged in "Decisions and assumptions" but not done here.
- Rewriting `lib/errors.ts` or sweeping every `console.*` call site in the codebase — only the specific business-event call sites listed in "Files likely to change" are touched.
- Phase 19 (production hardening: security review, deployment configuration, production smoke tests) — not started here.
