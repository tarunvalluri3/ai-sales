# Dashboard UI polish: readable labels, calmer colour, dark mode back

## Goal
Fix the seven issues found while reviewing the local Wave dashboard (`codex-ui`): customers stop seeing raw tool names and placeholder names, empty columns disappear, lime is reserved for "you are here" and the single primary highlight, the KPI highlight points at what needs action, the pipeline reads as a funnel, and the dashboard supports the production dark theme again (dark default, same toggle and storage key as production).

## Current phase
No numbered phase. Post-phase UI work on uncommitted branch `codex-ui` (STATE.md, 2026-11-15 sections). UI + one small display-only `lib` helper.

## User request
After a review listing 7 suggestions (tool names, placeholder names, empty Interest column, lime overuse, arbitrary KPI highlight, pipeline colours, dark mode): "fix everything."

## Skills and docs read
`STATE.md`, `AGENTS.md`, `CLAUDE.md`, `docs/prompt-template.md`. UI skills not read; visual decisions below come from the existing Wave tokens and production's theme mechanism.

## Existing code inspected
- `lib/tools/book-appointment.ts` (`SOURCE = "book_appointment_tool"`), `lib/tools/request-callback.ts` (`"request_callback_tool"`), `lib/conversations.ts` (`"dashboard_test"`): values written to `leads.source`.
- `lib/conversation-channel.ts`: `channelLabel()` maps `chat_widget`/`whatsapp`/`instagram`, otherwise returns the raw string. Used for **lead** sources in `_components/recent-activity.tsx:107` and `leads/leads-list.tsx:486`, so tool names leak.
- Avatars get a channel label as the name (`chat-list-pane.tsx:237/250`, `recent-activity.tsx:76`, `conversations/[id]/page.tsx:74`), producing "WE"/"IN" initials; `contact_name` values like "not provided" are shown verbatim (`leads-list.tsx:368/457`, recent activity, customers).
- `leads/leads-list.tsx:144/403`: Interest column always rendered, "—" when empty.
- Lime usage: `ui.tsx` `Avatar`/`IconBubble`/`StepBubble` (`bg-ds-lime-soft`), `PILL_TONE.lime`, `badge.tsx` `success`/`accent`, `recent-activity.tsx` `STATUS_TONE.new = "lime"`, `leads/status-select.tsx` `STATUS_TINT.new = border-ds-lime`, chat list "Human"/"Lead" pills.
- `page.tsx:100` Conversations KPI `highlight`; `:118` Needs attention only gets a dot. `kpi-tile.tsx` supports `highlight` / `attention`.
- `_components/pipeline-panel.tsx:15-18`: new=lime, contacted=primary (dark olive), converted=lime-mid, lost=mark-neutral.
- Theme: `main`'s `dashboard-header.tsx` renders `ThemeToggle` (`app/(dashboard)/_components/theme-toggle.tsx`, `localStorage "theme"`, dark default via `THEME_INIT_SCRIPT`). Local header dropped it, and `globals.css` `:root:has(.dash-shell)` forces light "whatever html[data-theme] says". `lib/clerk-appearance.ts` `clerkDashboardAppearance` is light-only hex.

## Relevant existing architecture
All dashboard colours are tokens on `:root:has(.dash-shell)` (globals.css), consumed via Tailwind `ds-*` utilities and `chart-colors.ts` CSS vars, so a dark palette is a token swap. `/apache`, onboarding and marketing use the Web Studio tokens and must not change.

## Decisions and assumptions
1. **Dark is the default**, as in production (unchanged `THEME_INIT_SCRIPT`, key `theme`). A user who chose light on production stays light.
2. **Dark Wave palette** (new tokens, light values unchanged): bg `#0e100c`, surface `#161913`, surface-raised/elevated `#1b1f17`, surface-soft `#21261c`, border `#2a2f24`, border-strong `#3b4234`, text-primary `#eef1ea`, text-secondary `#aab1a2`, muted/faint/label-faint `#949b8c`, primary (actions) `#b2ff38` with on-primary `#11160a`, primary-hover `#c3ff63`, accent `#b2ff38`, accent-strong `#c3ff63`, lime `#b2ff38`, lime-mid `#3e5a12`, lime-soft `#232f15`, success `#4fcf8c` / bg `#13301f`, warning `#f2b84b` / bg `#3a2b0d`, danger `#f2806d` / bg `#3b1a14`, attention `#fbb424`, mark-neutral `#5c6356`, scrim `rgba(0,0,0,.6)`, float shadow `0 18px 48px rgba(0,0,0,.5)`. Every text/background pair must be re-checked for ≥4.5:1 (≥3:1 for large text and UI marks); adjust a token if it fails, and record the final values in STATE.md.
3. **Lime gets two jobs:** "you are here" (active nav, selected list row, active filter/tab) and at most one primary highlight per page. Everything else goes neutral: avatars, icon bubbles, step bubbles → `bg-ds-surface-soft text-ds-text-primary`; `PILL_TONE.lime` → olive tint `bg-ds-primary/10 text-ds-primary` (stays readable in dark because primary becomes lime); `badge.tsx` `success` → `bg-ds-success-bg text-ds-success`, `accent` → olive tint; status select "new" border → `border-ds-border-strong`.
4. **Lead source labels** (new `lib/lead-source.ts`, pure, no server-only): `chat_widget`→"Website", `whatsapp`→"WhatsApp", `instagram`→"Instagram", `book_appointment_tool`→"Booked an appointment", `request_callback_tool`→"Asked for a callback", `dashboard_test`→"Test chat"; unknown → strip a trailing `_tool`, underscores to spaces, sentence case. Display only; DB values unchanged.
5. **Placeholder names**: `displayContactName(name)` in the same module returns `null` for empty or, case-insensitively, "not provided", "unknown", "n/a", "na", "none", "null", "-", "anonymous". Callers then use their existing fallback ("Unnamed prospect" / "Website visitor" etc.). Display only.
6. **Avatar fallback**: `Avatar` gets an optional `source` prop; when the (cleaned) name is null it renders the channel icon instead of initials. Call sites stop passing channel labels as names; conversation rows with no contact show "Website visitor" / "WhatsApp contact" / "Instagram contact".
7. **Interest column** on Leads is omitted when no lead in the current list has `interest_id` or `interest_type`.
8. **KPIs**: no tile is lime by default. "Needs attention" uses the amber treatment (`bg-ds-warning-bg`, amber dot, `text-ds-warning` hint) when its count is above 0, neutral at 0.
9. **Pipeline**: new `bg-ds-lime-mid`, contacted `bg-ds-lime`, converted `bg-ds-success-bright`, lost `bg-ds-mark-neutral`. Legend/labels unchanged.
10. **Clerk popovers**: if the installed `@clerk/nextjs` accepts CSS-variable strings in `appearance.variables` (verify in `node_modules`, do not assume), point `clerkDashboardAppearance` at the `--ds-*` vars so it follows the theme; otherwise keep it light and record the limitation.

## Open decisions this depends on
None.

## Dependencies / packages required
None.

## Files likely to change
- Created: `lib/lead-source.ts`
- Modified: `app/(dashboard)/globals.css`; `dashboard/_components/{ui,badge,kpi-tile,pipeline-panel,recent-activity,dashboard-header}.tsx`; `dashboard/page.tsx`; `dashboard/leads/{leads-list,status-select}.tsx`; `dashboard/conversations/_components/chat-list-pane.tsx`; `dashboard/conversations/[id]/page.tsx`; `dashboard/customers/{customer-list.tsx,[id]/page.tsx}`; `dashboard/copilot/priority-card.tsx`; `dashboard/appointments/{page,appointments-table}.tsx`; possibly `lib/clerk-appearance.ts` (decision 10)
- Modified: `STATE.md`

## Database changes
None.

## Server / client boundaries
`lib/lead-source.ts` is pure and importable from server and client components. Theme toggle is client-only (`localStorage`). No secrets.

## Implementation requirements
1. Create `lib/lead-source.ts` with `leadSourceLabel(source)` and `displayContactName(name)` (decisions 4–5) and use them wherever a lead source or contact name is displayed in `app/(dashboard)/dashboard/**`.
2. `Avatar` `source` prop and call-site changes (decision 6).
3. Leads Interest column rule (decision 7).
4. Lime reductions (decision 3), KPI change (decision 8), pipeline colours (decision 9).
5. Re-add `<ThemeToggle />` to the dashboard header next to the notification bell, restyled to the Wave controls (rounded, `size-9`, existing focus ring); same component and storage key, no new theme mechanism.
6. In globals.css: the current `:root:has(.dash-shell)` light values move under `:root[data-theme="light"]:has(.dash-shell)`; `:root:has(.dash-shell)` gets the dark palette (decision 2) and `color-scheme: dark`; update the comment that says the dashboard ignores `data-theme`. Hard-coded light colours in dashboard CSS (`::selection`, scrollbar colour) become tokens.
7. Clerk appearance per decision 10.
8. Do not change `/apache`, onboarding, marketing, or the widget preview's own palette.

## Security requirements
None beyond the usual: display-only changes, no data access, identity or tenant scope touched.

## Error handling
Unknown lead source → humanised label, never blank. Storage blocked → theme still applies for the page view (existing behaviour).

## Acceptance criteria
- [ ] No `_tool` string visible anywhere in the customer dashboard UI.
- [ ] No lead or contact shown as "not provided" (or the other placeholders); channel-only conversations show a channel icon avatar and "Website visitor"-style label.
- [ ] Leads list has no Interest column when every lead's interest is empty, and shows it when at least one has one.
- [ ] Lime appears only on active nav, selected rows, active filters/tabs and at most one primary highlight per page.
- [ ] Overview: no lime KPI tile; Needs attention turns amber when > 0.
- [ ] Pipeline: Converted is the strongest (green) bar.
- [ ] Theme toggle in the dashboard header switches light ↔ dark, persists, and matches production's choice on first load; no flash of the wrong theme.
- [ ] All text and controls meet WCAG AA contrast in both themes (measured, not eyeballed).
- [ ] `/apache` and onboarding look unchanged.

## Automated checks
`npm run lint` · `npm run typecheck` · `npm run build` (build on the owner's PC; this session can run lint and typecheck only). A contrast script over every dashboard token pair in both themes.

## Manual testing steps
1. Overview (dark, then light): KPI tiles neutral; Needs attention amber when > 0; Recent leads show "Booked an appointment"/"Asked for a callback"; no "not provided"; pipeline green for Converted.
2. Leads: no Interest column (current data); no lime avatars; "New" status pill olive tint; selected row still lime.
3. Conversations: website chats show a monitor-icon avatar and "Website visitor"; active row lime.
4. Toggle theme in the header; reload; open `/apache` → unaffected.
5. Negative: give a lead a real interest (or use a business that has one) → Interest column appears. Clear storage → dashboard opens dark (production default).
6. Clerk org switcher / user menu legible in both themes (or documented limitation).

## Out of scope
Changing stored lead data, renaming DB sources, new pages, `/apache` / onboarding theming, the chat widget's own theme.

## Visual interpretation
Same Wave layout and type; colour moves from "lime everywhere" to "lime means here / do this", plus a dark variant of the same palette where lime becomes the action colour.

## Layout and hierarchy
Unchanged, except the Leads table loses an empty column.

## Typography and spacing
Unchanged.

## Components
No new components. `Avatar` gains `source`; `KpiTile` uses its existing `attention` prop with an amber variant.

## Responsive behavior
Unchanged; theme toggle also visible on mobile header.

## States
Light · dark · attention > 0 / = 0 · empty interest · unknown source · placeholder name.

## Interaction behavior
Theme switch is instant (CSS tokens), no reload.

## Accessibility
Toggle keeps its `aria-label`; channel-icon avatars stay `aria-hidden` with the visible label carrying the name; AA contrast in both themes.
