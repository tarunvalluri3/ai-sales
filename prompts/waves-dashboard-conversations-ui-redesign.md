# Waves AI Pilot dashboard and Conversations UI redesign

## Goal

Deliver a production-ready presentation redesign for the authenticated Waves AI Pilot dashboard foundation and `/dashboard/conversations` reference workflow. The result will make conversation monitoring and occasional human takeover faster to scan and safer to operate, while preserving all data, routes, permissions, tenant isolation, Draft → Publish → Live behavior, polling, Server Action contracts, and existing product functionality. Stop after this reference surface is complete and reviewed; do not extend the design to the other dashboard pages until the user explicitly approves it.

## Current phase

Post-Phase 33 / production-readiness. `STATE.md` records Phase 33 as fully built and the latest production-readiness work as merged; this UI-only work is explicitly user-requested and adds no future product capability.

## User request

Redesign the Waves AI Pilot dashboard as a professional frontend/UI-UX developer. Inspect the instructions, design system, shared components, dashboard routes, and backend integrations first; preserve brand colours and the existing design system; substantially improve workflows rather than applying cosmetic changes; implement only the shared dashboard foundation and Conversations page as the reference design; include responsive, accessible loading/empty/error/interaction states; create branch `codex-ui`; do not deploy or change functionality; pause for review before redesigning other pages. No gradients; use suitable existing icons.

## Skills and docs read

- `AGENTS.md`
- `STATE.md`
- `PRODUCT.md`
- `docs/security.md`
- `docs/phases.md`
- `docs/prompt-template.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/01-installation.mdx`
- `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.mdx`
- `.claude/skills/impeccable/SKILL.md` and its Operate/shape guidance
- `.claude/skills/ui-ux-pro-max/SKILL.md`
- `.claude/skills/ui-styling/SKILL.md`

The requested design-intelligence search was attempted with both `python` and `py -3`, but Python could not be started in this environment. The existing design system and its accessibility guidance remain authoritative.

## Existing code inspected

- `app/(dashboard)/globals.css`: the Waves Web Studio tokens (ink/paper, Signal Red, hairlines, dark default with light theme, Hanken Grotesk + Space Grotesk, no gradients).
- `app/(dashboard)/dashboard/layout.tsx`, `_components/sidebar.tsx`, `dashboard-header.tsx`, `mobile-nav.tsx`, `nav-items.tsx`, `publish-bar.tsx`, `notification-bell.tsx`: authenticated shell, navigation, mobile dialog, organization/user controls, attention count, and the global Draft → Publish → Live control.
- `app/(dashboard)/dashboard/_components/{state-views,badge,data-table,kpi-tile}.tsx`: existing shared state, status, data, and metric primitives.
- `app/(dashboard)/dashboard/conversations/{layout,page,actions}.tsx` and `[id]/page.tsx`: server-side tenant-scoped inbox query, persistent route layout, detail data composition, and existing Server Action boundaries.
- `app/(dashboard)/dashboard/conversations/_components/{chat-list-pane,conversation-panes,live-conversation-panel,info-panel,control-toggle,reply-composer,message-bubble,ai-summary-card,tags-card}.tsx`: live inbox list/filtering, transcript polling, controlled handoff, reply composer, message sources, summary, tags, lead, appointment, guardrail, and responsive information pane.
- `lib/conversations.ts`, `lib/conversation-channel.ts`, `docs/security.md`: business-scoped conversation reads/mutations and channel labels.

## Relevant existing architecture

- Next.js 16 App Router and React 19; Tailwind 4 utility styling; Lucide is already installed and used.
- The dashboard’s `requireBusinessContext()`/`requireLiveBusinessContext()` resolves the trusted tenant server-side; conversation queries constrain `business_id` in SQL; detail lookups deliberately return an indistinguishable miss for another tenant.
- Conversations use a server-rendered shell plus client islands. The list polls at 1 s on the inbox index and 4 s in detail; the selected transcript polls at 1 s. Both tolerate transient errors and visibly report sustained staleness.
- Staff actions are existing Server Actions with server-side role enforcement. UI gates mirror `org:sales_agent` access but do not replace it.
- The root dashboard header is the only publishing surface. It carries existing Live/unpublished status and a publish dialog; its behavior and copy remain unchanged.

## Decisions and assumptions

- Retain Waves Web Studio as the visual world: dark default, compatible light theme, ink/paper surfaces, Signal Red as a signal rather than a general fill, thin borders, restrained floating radius, and no gradients.
- Retain Hanken Grotesk for readable product content and Space Grotesk for compact labels, status metadata, controls, and tabular values. Refine hierarchy and spacing through existing tokens/classes rather than introduce a font or token system.
- Treat Conversations as an operational control room: the attention queue, active conversation status, timestamp/channel context, takeover state, and reply affordance take precedence over secondary prospect metadata.
- Reuse Lucide and existing `Badge`, state views, attention provider, toast, focus trap, and buttons/classes. New shared UI components are permitted only when they are presentational, small, demonstrably reusable across the dashboard foundation/reference surface, and introduce no new dependency.
- No new API, database schema, migration, runtime environment variable, package, route, business logic, behavior, polling cadence, state transition, or copy-policy change.
- The scope is customer dashboard only; `/apache`, onboarding, marketing, auth, and the public widget remain untouched.

## Open decisions this depends on

None. The user explicitly selected the branch and visual constraints. Wider rollout is intentionally deferred for review after the reference implementation.

## Dependencies / packages required

None. Reuse Tailwind, Motion, Lucide, Clerk UI, and existing in-repository components.

## Files likely to change

Modified, presentation-only:

- `app/(dashboard)/globals.css` only if a small number of dashboard-consistent utility/component classes are needed.
- `app/(dashboard)/dashboard/layout.tsx`
- `app/(dashboard)/dashboard/_components/{sidebar,dashboard-header,mobile-nav,nav-items,state-views,badge}.tsx` only where needed for the shared shell and shared state presentation.
- `app/(dashboard)/dashboard/conversations/{layout,page}.tsx`
- `app/(dashboard)/dashboard/conversations/[id]/page.tsx`
- `app/(dashboard)/dashboard/conversations/_components/{chat-list-pane,conversation-panes,live-conversation-panel,info-panel,control-toggle,reply-composer,message-bubble,ai-summary-card,tags-card}.tsx`

Possible new files, only if clear duplication warrants them:

- A small dashboard-local presentational primitive under `app/(dashboard)/dashboard/_components/`.

No files will be deleted. `STATE.md` will be updated only as the final step after approved implementation and verification.

## Database changes

None. No migration commands.

## Server / client boundaries

- Keep the existing data-loaded route layouts and detail page as Server Components.
- Keep only existing interactive regions as Client Components: navigation state, filters, live polling, mobile pane toggle, conversation actions, composer, expandable citations, summaries, and tags.
- Do not move business context, Supabase calls, permission validation, or server actions to the client.
- No secrets are read, exposed, added, or logged.

## Implementation requirements

1. Create and work only on local branch `codex-ui`; do not deploy, push, or alter external services.
2. Preserve every route and interface contract. Keep Draft → Publish → Live controls and status behavior exactly as implemented.
3. Refine the shared dashboard foundation into a more purposeful operating shell: clearer page/chrome hierarchy, compact but legible grouped navigation, unmistakable active and attention states, coherent desktop/mobile navigation, and stable visual placement for organization/profile/theme/publish controls.
4. Preserve all existing navigation labels, hrefs, roles, active logic, attention counts, organization switching, user controls, and accessibility semantics.
5. Redesign Conversations as a responsive operations inbox with a deliberate three-layer hierarchy:
   - List rail: scan-oriented queue with readable lead/channel identity, recency, channel, latest message preview, attention, human-control, and lead signals; filters remain the same state/actions but receive clearer grouping and selected/filter affordances.
   - Transcript workspace: strong identity/header context; a compact, visually decisive handoff/status bar; a calm transcript reading field that distinguishes prospect, AI, and human messages without inventing colours outside existing semantic tokens; persistent human-reply affordance only under existing human-control condition.
   - Context rail: summary, recommended action, lead, appointment, guardrails, tags, and technical conversation facts in descending action relevance. Do not remove data or controls.
6. Maintain the existing fixed/sticky pane behavior, route persistence, polling frequencies, staleness behavior, filter logic, sort order, action callbacks, and mobile information-pane toggle.
7. On small screens, preserve single-purpose route modes: inbox list at the index and transcript/info switcher at detail. Provide touch targets of at least 44 px for primary/mobile controls where layout permits, without changing action behavior.
8. Improve state presentation without changing logic: dashboard loading skeleton should echo the reference layout; empty/filter-empty/error/stale/disabled/pending/success states should retain their current copy and semantics while becoming visually consistent with the new reference design.
9. Use semantic elements, visible `focus-visible` affordances, keyboard-operable controls, labels/tooltips for icon-only buttons, `aria-current`, `aria-live`/`role=status` where currently required, and avoid communicating critical state by colour alone.
10. Support both existing dark default and light theme. Use only semantic CSS variables/Tailwind tokens; do not use raw palette hex values in components. Do not introduce gradients, a new visual library, decorative imagery, or an unrelated redesign.
11. Use restrained 150–200 ms functional transitions only; respect the project’s reduced-motion rule and retain existing Motion behavior.
12. Pause for the user’s review once the foundation and Conversations reference surface are implemented, verified, and documented. Do not roll changes across other dashboard pages in this implementation.

## Security requirements

- Per `docs/security.md` §§1–2, preserve server-derived `businessId`, tenant-scoped data reads/writes, Clerk identity validation, and server-side authorization unchanged.
- Per `AGENTS.md` rule 2, never accept a tenant identifier from the client or move trusted boundaries into visual components.
- Per `docs/security.md` §5, add no environment variables and expose no secret.
- UI permission states must remain a reflection of—not a substitute for—existing Server Action authorization.

## Error handling

- Preserve segment error boundary and retry behavior.
- Preserve sustained-poll-failure status rather than showing a false real-time state.
- Preserve action-level pending, success, and error messages and non-destructive action behavior.
- Preserve not-found/cross-tenant indistinguishability on detail access.

## Acceptance criteria

- [ ] `codex-ui` is the active local branch.
- [ ] No API, route, database, auth, tenant, publish, polling, or Server Action behavior changes.
- [ ] Dashboard foundation retains all existing navigation destinations, attention count behavior, mobile dialog/focus management, theme behavior, organization switching, notification bell, and publishing workflow.
- [ ] Conversations retains all list filters, ordering, channel labels, attention and control status, live updates, takeover/handback, human reply, tags, sources, summaries, lead, appointment, guardrail, and customer-link features.
- [ ] Desktop renders a legible operational inbox with queue, transcript, and context panes; small screens render the existing list/detail split without horizontal overflow.
- [ ] Dark and light themes use the preserved brand tokens with visible state, focus, and sufficient text contrast.
- [ ] Empty, loading, error, stale, permission-restricted, disabled, pending, and success states are present and usable.
- [ ] No gradients, new packages, migration, deployment, or changes outside approved scope.

## Automated checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test` only if safe in the current environment; `STATE.md` warns the local Supabase CLI points at production, so do not run database-connected tests against it.
- Existing static/unit suites relevant to conversation contracts when they do not contact external services.

## Manual testing steps

1. Sign in as an organization member and open `/dashboard`; verify sidebar collapse, grouped navigation, theme toggle, organization switcher, user button, notification bell, and the unchanged Draft → Publish → Live control.
2. Open `/dashboard/conversations` at desktop width; verify list filters, attention-only filtering, selected row, list empty state, filter-empty state, and sustained-update-paused status.
3. Open a conversation needing attention; verify tenant-scoped transcript, context rail, source expansion, tags, summary, guardrail content, lead/appointment/customer links, and unchanged next-action content.
4. As an authorized sales agent, take over, reply, and hand back; verify pending/disabled/error/success presentation and the existing server action outcome. As a viewer, verify the controls remain unavailable and the server still denies a forged action.
5. Use a narrow mobile viewport: verify index shows only the inbox, detail shows transcript with the existing info-panel toggle, menu focus is trapped/restored, controls are keyboard accessible, and no horizontal overflow occurs.
6. Repeat checks in light and dark themes, with reduced motion enabled, keyboard-only navigation, and browser network throttling to validate skeleton/error/stale states.
7. Attempt to visit a conversation ID belonging to another business; confirm it remains a not-found experience with no detail leak.

## Out of scope

- Redesigning other dashboard pages after this reference pass; awaiting user review.
- `/apache`, onboarding, marketing, authentication, widget, database, RLS, APIs, Server Actions, data-model changes, real-time architecture changes, new channels, attachments, or product functionality.
- Deployment, production data changes, package installation, and visual/design changes unrelated to the dashboard and Conversations reference surface.

## Visual interpretation

This is an Operate surface, not a marketing page: density, scanning, and human accountability outrank decoration. The existing Web Studio system remains intact. The new reference design will use quiet paper/ink fields, semantic red only for a meaningful signal, thin architectural lines, compact technical labels, and stronger information grouping. It will feel like a controlled conversation desk rather than a collection of adjacent cards.

## Layout and hierarchy

- Desktop: stable app chrome above a dashboard workspace; Conversations retains a queue rail, primary conversation workspace, and context rail. The active human/AI control state and attention signal sit within the transcript’s immediate reading path.
- Tablet: retain the queue and transcript; constrain the context rail without crowding messages, preserving existing responsive behavior.
- Mobile: preserve existing index/list vs detail/inspector mode rather than squeezing three panes together.
- The shared foundation uses a compact, grouped sidebar with an unmistakable selected state and an operational top bar where publishing is always discoverable but never visually mistaken for a page action.

## Typography and spacing

- Preserve Hanken Grotesk and Space Grotesk.
- Use technical uppercase labels only for metadata/grouping, not body content.
- Establish consistent 8 px-based gaps through existing Tailwind spacing; increase breathing room around primary reading/action areas while keeping the inbox compact.
- Maintain sharp default corners and reserve the existing float radius/shadow only for genuine overlay/floating contexts.

## Components

- Reuse: sidebar, mobile nav, dashboard header, publish bar, badges, state views, attention provider, toast, focus trap, all conversation feature components, Lucide icons, and existing button conventions.
- New: only narrowly scoped presentational primitives if repeated styling remains demonstrably duplicated after the reference pass. No new component package or alternative UI kit.

## Responsive behavior

- Base/mobile: one primary task at a time; 44 px touch targets for menu, pane switch, takeover, and send actions where appropriate.
- `md`: existing list/detail split returns; the detail workspace maintains a usable reading column and an accessible info panel.
- Larger desktop: queue, transcript, and information pane retain predictable proportions and independent scrolling without clipping or double scroll traps.

## States

- Default: clear current route, selected conversation, channel, responsibility, and latest update context.
- Loading: dashboard-shaped skeleton without misleading content.
- Empty/filter-empty: retained honest messaging with an action-neutral presentation.
- Error/stale: retained error/retry and paused-updates semantics, announced without alarm fatigue.
- Disabled/permission: existing role gates remain clear, non-interactive, and server-enforced.
- Pending/success: existing action copy remains visible beside the initiated control; no optimistic state that contradicts the server outcome.

## Interaction behavior

- Keep current navigation, filter, polling, action, citation, tag, summary, and mobile-pane interactions.
- Improve hover, selected, focus, and pressed feedback using existing tokens and brief functional transitions only.
- Preserve reduced-motion behavior, no decorative animation, and no state changes that depend solely on hover.

## Accessibility

- Preserve and audit semantic landmarks, headings, form labels, `aria-current`, status announcements, focus-visible treatment, focus trap/return for mobile navigation, and icon labels.
- Maintain keyboard access and a logical reading/focus order across desktop and mobile panes.
- Use text/icon/badge labels alongside semantic colour to communicate attention, handoff, and state.
- Check both themes for readable foreground/background contrast and avoid raw low-contrast muted text for essential information.
