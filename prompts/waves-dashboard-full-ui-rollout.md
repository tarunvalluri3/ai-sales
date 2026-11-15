# Waves AI Pilot customer-dashboard UI rollout

## Goal

Extend the approved Waves customer-dashboard reference system from the shared shell and Conversations inbox across the remaining tenant-facing `/dashboard/*` routes. Every route will gain a consistent, production-ready operational layout and state treatment without changing any data, route, API, permission, tenant, Draft → Publish → Live, or interaction behavior.

## Current phase

Post-Phase 33 / production-readiness. This is an explicitly approved, UI-only continuation of the `codex-ui` reference pass recorded in `STATE.md`.

## User request

After reviewing the shared dashboard foundation and Conversations reference UI redesign, the user said “go ahead,” approving extension of that design across the remaining dashboard pages. The original constraints continue: preserve brand colours and existing design system, no gradients, no functional or behavior change, reuse components and iconography, preserve tenant isolation/permissions/API contracts/Draft → Publish → Live, and do not deploy.

## Skills and docs read

- `AGENTS.md`
- `STATE.md`
- `PRODUCT.md`
- `docs/security.md`
- `docs/phases.md`
- `docs/prompt-template.md`
- `.claude/skills/impeccable/SKILL.md`
- `.claude/skills/ui-ux-pro-max/SKILL.md`
- `.claude/skills/ui-styling/SKILL.md`
- `prompts/waves-dashboard-conversations-ui-redesign.md`

## Existing code inspected

- Shared chrome/state primitives: `app/(dashboard)/dashboard/{layout.tsx,_components/sidebar.tsx,_components/dashboard-header.tsx,_components/mobile-nav.tsx,_components/state-views.tsx,_components/data-table.tsx,_components/badge.tsx}` and `app/(dashboard)/globals.css`.
- Reference implementation: `app/(dashboard)/dashboard/conversations/**`.
- Overview/insight routes: `dashboard/page.tsx`, `analytics/page.tsx`, `leads/page.tsx`, `customers/page.tsx`, `copilot/page.tsx` and their existing components.
- Knowledge/catalog routes: `products`, `services`, `faqs`, `knowledge`, `answer-bank` and existing forms/lists.
- Operations routes: `appointments`, `workflows`, `business-hours`, `notifications`, `webhooks`, `audit-log` and their existing components.
- Configuration/channel/billing routes: `profile`, `widget-settings`, `whatsapp`, `instagram`, `billing` and their existing components.

## Relevant existing architecture

- Next.js 16 App Router, React 19, TypeScript, Tailwind 4, existing Lucide and Motion dependencies.
- Data is loaded in tenant-scoped Server Components; mutations stay in existing Server Actions with server-side Clerk role checks.
- The shared dashboard layout owns the only Draft → Publish → Live control. Page components supply route content and must not duplicate/replace that behavior.
- Existing state primitives and `DataTable` are presentation components intended for reuse.
- Existing design tokens are Waves Web Studio: dark default/light alternative, ink/paper surfaces, Signal Red only as a signal, thin hairlines, Hanken Grotesk + Space Grotesk, no gradients.

## Decisions and assumptions

- `/dashboard/*` means customer-facing authenticated dashboard routes only. Exclude `/apache`, onboarding, marketing/auth/legal pages, the public widget, API routes, and all server/data modules.
- The approved Conversations implementation is the visual reference: clear page header, operational hierarchy, compact technical labels, purposeful whitespace, consistent bordered work surfaces, responsive layouts, and meaningful status treatments.
- Do not rewrite page copy, alter data order/filtering/pagination, move server/client boundaries, change any interactive state machine, or introduce visual changes that depend on new data.
- Small page-local presentational wrappers are permitted only where they consolidate repeated markup without changing semantics or behavior. No packages or new design library.
- Existing accessibility attributes/roles/actions stay intact; missing visual focus, responsive spacing, and status affordances may be refined.

## Open decisions this depends on

None. The user explicitly approved the wider dashboard rollout. The reference visual language and exclusion boundary are already set.

## Dependencies / packages required

None.

## Files likely to change

Presentation-only edits under `app/(dashboard)/dashboard/`, principally:

- Overview and shared visual primitives.
- Analytics, Leads, Customers, Sales Copilot.
- Products, Services, FAQs, Knowledge, Answer Bank.
- Appointments, Workflows, Business Hours, Notifications, Webhooks, Audit Log.
- Profile, Widget Settings, WhatsApp, Instagram, Billing.
- Existing dashboard-local component files used exclusively by these pages.
- `app/(dashboard)/globals.css` only for reusable semantic visual utilities, if needed.
- `STATE.md` as the final implementation step.

No server modules, routes, migrations, environment files, lockfiles, or packages will change.

## Database changes

None. No migrations or database commands.

## Server / client boundaries

- Preserve all current Server Components, data access, business-context resolution, and Server Actions.
- Client components remain client components; modifications are limited to markup, classes, existing icons, and accessibility-preserving presentation affordances.
- No secrets or server-derived tenant identifiers reach the client beyond existing props.

## Implementation requirements

1. Keep the active local branch as `codex-ui`; do not push, deploy, or call external product APIs.
2. Apply the reference’s header and content rhythm to every customer dashboard page, respecting each route’s task: overview/insights, records/lists, settings/forms, channels/connection states, billing, and audit/operations.
3. Reuse `Badge`, `EmptyState`, `ErrorState`, `PermissionNotice`, `DataTable`, button conventions, and existing Lucide icons. Improve their presentation only where their shared changes are appropriate to every caller.
4. Preserve every input name, form action, route, href, component prop, event handler, polling behavior, table behavior, status logic, permission gate, disabled/pending/error/success state, and existing content.
5. Make cards and page regions operational rather than decorative: use compact section labels, useful grouping, measured density, legible data hierarchy, and semantic signal states. No gradients, illustrations, fabricated metrics, or decorative icon tiles.
6. Support existing dark and light themes solely through semantic tokens; do not introduce raw component-level colours.
7. Ensure mobile layouts stack or scroll appropriately without horizontal overflow; retain usable touch targets, keyboard navigation, focus-visible styles, semantic headings, labels, and existing live/status announcements.
8. Do not redesign the already-approved Conversations behavior beyond incidental shared primitive consistency.
9. Run lint, typecheck, build, `git diff --check`, and the UI detector. Do not run database-connected tests while the CLI is production-linked.

## Security requirements

- Preserve `docs/security.md` §§1–2 tenant-scoped server data access, Clerk identity validation, and server-side authorization unchanged.
- UI gates remain explanatory only; they must not replace Server Action authorization.
- No changes to database/RLS, environment variables, client exposure, logging, or API behavior.

## Error handling

- Preserve existing route error boundaries, empty/error/loading states, pending/error/success action feedback, and safe user-facing messages.
- Styling must not conceal stale, warning, payment/channel, or role-restriction states.

## Acceptance criteria

- [ ] Every customer dashboard route has a coherent visual hierarchy consistent with the approved Conversations reference.
- [ ] Existing data, action, route, API, auth, tenant, publish, polling, table, and form behavior is unchanged.
- [ ] Existing dark/light themes render through the current token system without gradients or raw palette values.
- [ ] Responsive desktop/mobile layouts are clear, usable, and do not introduce horizontal overflow.
- [ ] Existing loading, empty, error, disabled, permission, warning, pending, and success states remain present and usable.
- [ ] `/apache`, onboarding, marketing/auth/legal, widget, API, server/data, schema, and deployment work are untouched.
- [ ] No packages, migrations, environment variables, or deploys are introduced.

## Automated checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `git diff --check`
- `node C:\Users\Tarun Valluri\.agents\skills\impeccable\scripts\detect.mjs --json <changed dashboard targets>`

Do not run `npm test`/pgTAP against the current production-linked Supabase CLI.

## Manual testing steps

1. Visit each dashboard navigation destination as a tenant member and verify its route, content, action surfaces, forms, tables, links, and data states are unchanged.
2. As a viewer/sales agent/admin, verify each role-gated control remains appropriately visible/disabled/explained and remains enforced server-side.
3. Test overview, analytics, records, catalog, settings, channel-connection, billing, workflow, audit, and notifications pages in dark/light themes at desktop and mobile widths.
4. Exercise existing create/edit/delete/publish/connect/payment/notification actions only against a safe non-production setup; confirm pending/error/success states remain accurate.
5. Use keyboard-only navigation and reduced motion; confirm focus order, visible focus, form labels, dialogs, and table controls remain usable.
6. Confirm a cross-tenant deep link still produces the existing safe response without exposing data.

## Out of scope

- Functional changes; data/schema/API/auth/tenant/publishing/polling modifications; new product features; `/apache`; onboarding; marketing/auth/legal; public widget; deployment; external service calls; package installation.

## Visual interpretation

An operational SaaS workspace rather than a generic card dashboard. Preserve the Waves Web Studio identity while making every page easier to scan, act on, and return to: meaningful hierarchy before ornament, hairlines before shadows, and a compact technical voice for metadata/actions.

## Layout and hierarchy

- Overview/insights: action-first header, grouped metrics/analysis, consistent sections.
- Lists/records: purposeful page header, controls close to the data they affect, readable row density, stable table/list state treatments.
- Settings/forms: narrow readable content rails with clear section boundaries and save/action areas.
- Channels/billing/operations: status-first page structures where warnings, readiness, and next steps are visually obvious without changing their conditions.

## Typography and spacing

- Keep Hanken Grotesk for reading and Space Grotesk for labels/metadata.
- Maintain an 8 px rhythm, generous separation between sections, and compact grouping within cards/forms/tables.
- Keep sharp corners except existing true floating overlays.

## Components

- Reuse every existing component and library first.
- Only add a dashboard-local presentational component when three or more pages would otherwise duplicate the same stable, behaviorless markup.

## Responsive behavior

- Mobile: one task/column at a time with stacked sections, retained form/button usability, and horizontal table scrolling only where the existing table pattern requires it.
- Tablet/desktop: use grid layout only when column content remains readable; do not compress forms or tables into unusable widths.

## States

- Preserve and visually align loading, empty, error, warning, success, pending, disabled, permission, and no-data states.
- Never create false confidence through optimistic visual state or hide failures in low-contrast presentation.

## Interaction behavior

- Maintain all existing behavior and state transitions.
- Use only existing/restrained functional hover, focus, active, and reduced-motion-aware transitions.

## Accessibility

- Retain semantic landmarks/headings and form labels.
- Preserve/add visible `focus-visible` styling and accessible labels for icon-only controls.
- Keep colour-independent status communication, keyboard operation, dialog focus management, and adequate contrast in both themes.
