# Dashboard sidebar: collapse / expand, as in production

## Goal
The local customer-dashboard sidebar (branch `codex-ui`, "Wave" re-skin) gets the same collapse/expand behaviour the deployed sidebar on `main` has: a toggle that narrows the sidebar from 256px to a 64px icon rail and back, remembered per browser, with icon-only links that keep their tooltips, active state and attention badge. The Wave look (lime active item, rounded items, logo, workspace block, Knowledge Base / Settings disclosure groups) stays.

## Current phase
No numbered phase. Post-phase UI work on the uncommitted `codex-ui` branch (STATE.md header + the 2026-11-15 "Customer dashboard ..." sections). UI only.

## User request
"Give functionality to the sidebar exactly like the production one."

## Skills and docs read
- `STATE.md` (header and the 2026-11-15 codex-ui sections)
- `AGENTS.md`, `CLAUDE.md`
- `docs/prompt-template.md`
- UI skills (`.claude/skills/ui-ux-pro-max/`, `.claude/skills/impeccable/`) not read: the behaviour is copied from existing production code, no new visual direction.

## Existing code inspected
- `main` → `app/(dashboard)/dashboard/_components/sidebar.tsx`: client component. `collapsed` is read with `useSyncExternalStore` from `localStorage["dashboard-sidebar-collapsed"]` (`"1"`/`"0"`), server snapshot `false` (no hydration mismatch); writes dispatch a same-tab `dashboard-sidebar-collapse-change` event (native `storage` only fires in other tabs); try/catch around storage. `<nav>` width `w-16` collapsed / `w-64` expanded with `transition-[width] duration-200`, `overflow-x-hidden`. Toggle button (`PanelLeftClose` / `PanelLeftOpen`, `size-8`, `aria-pressed`, `aria-label` + `title` "Collapse sidebar"/"Expand sidebar", `self-end` / `self-center`). Collapsed: business name hidden (only the initial square), group labels hidden, link `title={item.label}`, label `sr-only`, items centred. Attention badge still rendered.
- local `codex-ui` → same file: exports `NavList` (shared with `mobile-nav.tsx`), `SidebarBrand` (WavesLogo + "Workspace" block) and `Sidebar` (`w-64`, no collapse). `NavList` has disclosure groups (Knowledge Base, Settings) via `useState` `toggled`.
- `_components/nav-items.tsx` (`NAV_GROUPS`, `collapsible`, `defaultCollapsed`), `_components/mobile-nav.tsx` (renders `SidebarBrand` + `NavList`), `../../_components/waves-logo.tsx` (exports `WavesMark` with scale `"nav"` etc. and `WavesLogo`).

## Relevant existing architecture
Client-only nav state, no server data. Storage key and event name must be identical to `main`'s so a user's saved preference carries over when this branch ships.

## Decisions and assumptions
1. Reuse `main`'s storage key, event name, `useSyncExternalStore` pattern and widths (64px / 256px) verbatim.
2. Collapsed brand: show only the `WavesMark` (scale `"nav"`, tone `"light"`) linked to `/dashboard`; the "Workspace" block becomes a `Building2` icon with `title={businessName}` (production showed the business initial; the Wave sidebar has a logo, so the mark is the closest equivalent).
3. Collapsed groups: group headings and the Knowledge Base / Settings disclosure buttons are hidden and **every** item of every group is shown as an icon (a closed disclosure would otherwise hide pages with no way to open it). Expanded mode keeps today's disclosure behaviour and remembered toggles.
4. Collapsed attention badge: a small amber dot on the Conversations icon (`aria-label` unchanged); the number would not fit 32px. Production kept the number; this is a deliberate visual deviation, flag in STATE.md.
5. Toggle sits in the brand row: right-aligned next to the logo when expanded, centred under the mark when collapsed. Same icons, labels and `aria-pressed` as production.
6. Mobile drawer is unaffected: `NavList` gets `collapsed` defaulting to `false`.

## Open decisions this depends on
None.

## Dependencies / packages required
None (`lucide-react` already provides `PanelLeftClose` / `PanelLeftOpen`).

## Files likely to change
- Modified: `app/(dashboard)/dashboard/_components/sidebar.tsx`
- Modified: `STATE.md` (also records the 2026-11-15 "match deployed sizes, spacing and fonts" pass done earlier today, which is not yet in STATE.md)

## Database changes
None.

## Server / client boundaries
`sidebar.tsx` is already `"use client"`. Only `localStorage` is touched. No secrets.

## Implementation requirements
1. Add `COLLAPSE_STORAGE_KEY`, `COLLAPSE_CHANGE_EVENT`, `setStoredCollapsed`, `subscribeToCollapsed`, `getCollapsedSnapshot`, `getServerCollapsedSnapshot` exactly as on `main`.
2. `Sidebar` reads `collapsed` via `useSyncExternalStore`; `<nav>` gets `overflow-x-hidden transition-[width] duration-200` and `w-16 px-3` (collapsed) / `w-64 px-4` (expanded).
3. Toggle button per decision 5; `onClick={() => setStoredCollapsed(!collapsed)}`.
4. `SidebarBrand` takes `collapsed?: boolean`; collapsed renders decision 2.
5. `NavList` takes `collapsed?: boolean` (default `false`). When collapsed: per decision 3; links get `title={item.label}`, `justify-center`, label `sr-only`; badge per decision 4. When not collapsed: output identical to today.
6. Keep every existing class, focus ring and the lime active state.

## Security requirements
None beyond the usual: no data, no identity, no tenant scope involved.

## Error handling
Storage unavailable (private mode, blocked): toggle still works for the current page via the event, preference simply not persisted; reads fall back to expanded.

## Acceptance criteria
- [ ] Toggle collapses the desktop sidebar to 64px and expands to 256px, animated.
- [ ] Preference survives reload and is shared across tabs; same key as production.
- [ ] Collapsed: icons only, every page reachable, hover shows the page name, active page highlighted, attention dot on Conversations.
- [ ] Expanded: visually identical to before this change, disclosure groups behave as before.
- [ ] Mobile drawer unchanged.
- [ ] No hydration warning in the console on first load with the sidebar saved as collapsed.

## Automated checks
`npm run lint` · `npm run typecheck` · `npm run build`

## Manual testing steps
1. `/dashboard` at 1440px: click the collapse button → 64px rail; hover each icon → name tooltip; click Leads → navigates, Leads highlighted.
2. Reload → still collapsed. Open a second tab → collapsed. Expand in one tab → other tab expands.
3. Expanded: Settings group closed by default, opens on click; open `/dashboard/billing` → Settings auto-open.
4. Phone width (≤767px): sidebar hidden, hamburger drawer unchanged.
5. Negative: DevTools → block site storage, reload → sidebar expanded, toggle still works until reload, no errors.
6. Keyboard: Tab to the toggle, Enter toggles, focus ring visible; screen reader reads link names when collapsed.

## Out of scope
Header/top-bar changes, nav item list changes, mobile drawer redesign, committing or pushing the branch.

## Visual interpretation
Production behaviour on the Wave skin: same widths and motion, Wave colours and rounded items.

## Layout and hierarchy
Brand row (mark + toggle) → workspace → groups. Collapsed column centred at 64px.

## Typography and spacing
Unchanged from the current sidebar (14px items, 11px Space Grotesk group labels, 36px rows).

## Components
No new components; `Sidebar`, `SidebarBrand`, `NavList` gain a `collapsed` prop.

## Responsive behavior
Desktop (`md:` and up) only; below `md` the sidebar is hidden as today.

## States
Default expanded · collapsed · active item · attention badge/dot · storage unavailable.

## Interaction behavior
Width animates 200ms; respects the existing `prefers-reduced-motion` rule in globals.css.

## Accessibility
Toggle has `aria-pressed`, `aria-label`, `title`; collapsed links keep accessible names via `sr-only` labels and `title`; `aria-current="page"` unchanged; focus rings unchanged.
