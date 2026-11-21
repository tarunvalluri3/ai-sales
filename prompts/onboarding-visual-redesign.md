# Onboarding visual redesign

## Goal

Make Waves AI Pilot's sign-in, sign-up, organization setup, and onboarding feel like a continuous experience from the marketing site to the customer dashboard. Owners should be able to see what remains, preview the agent they are configuring, and reach the next action at every supported width.

## Current phase

Post–Phase 33 production-readiness follow-up. The latest entries in `STATE.md` record onboarding 4a (#160), its follow-ups (#162), and 4b (#163). This is a presentation pass on those shipped flows.

## User request

Reuse the dashboard's palette, typography and rounded components across onboarding, bring all current features into the new presentation, brand the three Clerk screens, and repair the Waves logo in the dark dashboard sidebar. Keep the step rail, form, preview and sticky footer. Support 375, 768, 1280 and 1440 px in both themes. After explicit approval, implement in small commits, update `STATE.md`, and open a PR to `main` for review. Leave the PR open.

## Skills and docs read

- `AGENTS.md` §10 and §5, `STATE.md` (4a, follow-ups, 4b, November 15 dashboard and November 19 marketing entries), `PRODUCT.md`, `docs/product-and-dashboard-brief.md`, `docs/prompt-template.md`, and `docs/security.md` §2.
- `.agents/skills/impeccable/SKILL.md` and `reference/onboard.md` in that skill. The context command ran. There is no root `DESIGN.md`. Use the existing dashboard and marketing implementation as visual authority. Read `reference/craft-floor.md` before implementation.
- `.agents/skills/ui-ux-pro-max/SKILL.md`. Its priority checklist informs touch, responsive layout and accessibility. No Python launcher was available for the optional search.
- `.agents/skills/clerk/SKILL.md` and `.agents/skills/clerk-custom-ui/SKILL.md`. See [Clerk appearance](https://clerk.com/docs/nextjs/guides/customizing-clerk/appearance-prop/overview), [variables](https://clerk.com/docs/nextjs/guides/customizing-clerk/appearance-prop/variables) and [organization session task](https://clerk.com/docs/nextjs/reference/components/authentication/task-choose-organization).

## Existing code inspected

- `app/(dashboard)/globals.css`, `site.css`, app and dashboard layouts, `dashboard/_components/ui.tsx`, and the shared theme toggle and initialization script. The current dashboard uses Hanken Grotesk, the shared rounded scale, and dark by default. The marketing theme uses its own storage key.
- `onboarding/layout.tsx` only supplies a toast provider. `onboarding/page.tsx` provides stage state, draft preview data and the active step. `wizard-shell.tsx` currently renders the mobile progress bar, an informal modal, and a desktop preview at a narrower breakpoint than requested. The step components own their individual form and footer actions.
- `preview-panel.tsx` already uses draft context for branding, a sample conversation and readiness. Review renders server-confirmed publish success and already routes to the dashboard welcome.
- `dashboard/_components/sidebar.tsx` hard-codes the light-background logo tone in expanded and collapsed states. The mobile drawer reuses that brand component.
- The sign-in, sign-up and choose-organization page components pass the Web Studio appearance from `lib/clerk-appearance.ts`. The root provider sets organization-task routing and copy. Sign-in and sign-up invoke the existing signed-in redirect helper.

## Relevant existing architecture

Use the existing root `.dash-shell` token scope so dashboard primitives, toast, and overlays see the same tokens. Keep onboarding and auth layouts independent of dashboard navigation and authenticated data loading. Use marketing's existing logo lockups and visual restraint. Reference `public/marketing/screens/` and the existing dashboard and widget source when evaluating visual parity.

## Decisions and assumptions

- 768–1279 px shows rail and form with Preview in a sheet. At 1280 px the sidebar preview joins the layout. Use one preview surface at a time and keep the active control reachable when space changes.
- Position in the wizard and setup readiness measure different things. Use recorded stage status and the current stage label for navigation. Use the existing required/recommended counts for readiness and make those counts visible even with the preview closed.
- Use supported Clerk element slots with dashboard CSS variables where supported. If the installed SDK needs concrete colors to derive internal shades, source both appearance variants from existing dashboard values and use the same persisted dashboard theme.
- Signed-out verification can capture the sign-in and sign-up screens. The actual organization task needs an authenticated pending session, so the owner verifies it alongside authenticated onboarding. Any preview protection or Clerk domain configuration blocking public captures will be recorded.

## Open decisions this depends on

None. `STATE.md` §4 lists none.

## Dependencies / packages required

None. Use the installed Clerk, Lucide and motion packages and platform dialog APIs or existing accessible UI patterns.

## Files likely to change

- `app/(dashboard)/onboarding/layout.tsx`, new `onboarding.css` for route-specific layout, plus `loading.tsx` and `error.tsx` for the route's shared skeleton and recovery UI.
- `onboarding/_components/{wizard-shell,preview-panel,readiness-counts,hours-summary}.tsx` and `onboarding/_components/steps/*.tsx`. Add a small shared footer or preview presentation component if that consolidates repeated markup. Touch `onboarding/page.tsx` only if needed for heading copy or existing view props.
- Reuse `dashboard/_components/ui.tsx` and the shared business-hours, catalog, FAQ, knowledge, billing, widget setup and sandbox UI. Inspect the widget embed presentation and dashboard widget preview closely. Where needed, add onboarding-scoped presentation options for wrapping, labels and feedback while retaining existing dashboard defaults.
- `app/(dashboard)/sign-in/[[...sign-in]]/page.tsx`, `sign-up/[[...sign-up]]/page.tsx`, `session-tasks/choose-organization/page.tsx`, shared auth frame in `app/(dashboard)/_components/` and `lib/clerk-appearance.ts`.
- `dashboard/_components/sidebar.tsx`, shared `_components/waves-logo.tsx` and `globals.css` as needed for theme-aware brand and shared styles. Update `STATE.md` last.

## Database changes

None. No migrations or commands.

## Server / client boundaries

Keep existing server auth, queries, actions, form names, action arguments, and route transitions. UI-only client state controls panel visibility, focus, theme and feedback. The visual preview uses existing draft props and local updates. It makes zero chat requests. Existing sandbox behavior remains available on Review. Use non-live process-scoped verification settings. No environment variables need to be added to deployment.

## Implementation requirements

1. Provide the same scope, typography, spacing, action colors and roundness as the dashboard. Reuse its theme toggle and first-paint initialization. Show the appropriate Waves mark and wordmark in both themes on onboarding, auth, and desktop and mobile dashboard navigation.
2. Group related inputs into cards. Keep one visually dominant progression action per step, with Back secondary and in-step Add/Save controls clearly subordinate. Preserve each existing submit path, including keyboard submit and Back/Edit destinations. Give every step a title and a one-line reason.
3. Preserve hours confirmation on Business and Review, website-first import and suggestion approval/discard, product/service images and Advanced pricing, FAQ drafting, agent name/avatar and the full language list, channel setup and entitlements, and the existing plan, sandbox and publish flows.
4. Use the current draft brand color, name, avatar and greeting in a widget-like mock, with recognizable widget header, bubbles and composer treatment. Use the existing widget contrast helper for arbitrary business colors. Label sample content and use already available FAQ or offering data.
5. Show a brief success treatment only from the existing published flag. Keep the current handoff timing and route and the dashboard welcome card. Provide a static success treatment under reduced motion.

## Security requirements

Follow `docs/security.md` §§1–2, 5–7 and 10. Keep membership, tenancy and redirect controls as wired. Never read out, print or commit secrets. Leave `.env*` and `style-backup-*.zip` outside staging. Never start `next dev`, run `npm test`, Supabase CLI operations, seed scripts or `npm run eval`, or use live Gemini or database services during verification.

## Error handling

Use the current action error and pending state. Keep user inputs and retry behavior as supplied by the existing flow. Associate field-level errors and help to inputs and show safe form-level feedback where the action only returns a general error. If more precise messaging needs a server result, schema or readiness change, document the gap. Use server-confirmed state or existing action outcomes for success messages.

## Acceptance criteria

- Dashboard typography, palette, radius and core components are recognizable on all steps and Clerk pages. Light and dark persist through onboarding and dashboard. The Waves mark and wordmark are visible at supported sizes, with the established mark-only treatment for collapsed navigation and compact headers.
- Zero document or list horizontal overflow at 375, 768, 1280 and 1440 px. Long titles, filenames, catalog descriptions, URLs, prices and code wrap or reflow. Keyboard and safe-area clearance keep the footer reachable. Preview sheet supports focus containment, Escape, dismissal and focus return.
- Existing readiness and plan rules still govern actions. Count labels, disabled reasons and success/error/pending announcements reflect existing state. WCAG AA contrast and reduced motion verified for the edited surfaces.
- Lint, typecheck, production build, each mocked `test:*` suite and the Impeccable detector pass for the edited UI. Public screenshots and authenticated preview checklist are attached to the PR, with any unavailable checks called out.

## Automated checks

- Run `npm run lint`, `npm run typecheck`, and `npm run build` using an isolated process with mock Clerk credentials, an unreachable loopback Supabase URL and dummy provider settings, following prior builds in `STATE.md`. Run typecheck/build sequentially because they share Next.js type output.
- Enumerate `test:*` scripts from `package.json`, confirm their guard and mock boundaries, and run each under the isolated settings. Run `git diff --check`. Review any source-pinning test that fails and preserve its behavioral assertion.
- Run `.agents/skills/impeccable/scripts/impeccable.cmd detect` on edited UI paths and address findings in scope. Retain existing detector settings.

## Manual testing steps

1. Open the PR branch's Vercel preview in a signed-out browser. Open `/sign-in` and `/sign-up` at 375, 768, 1280 and 1440 px with light and dark selected. Capture 16 screenshots. Check card width, visible logo, social buttons, input focus, light-mode “Already have an account? Sign in” footer and keyboard order. Measure scroll width of the page and relevant containers. Leave forms unsubmitted.
2. Give the owner the preview URL and a width/theme matrix for choose organization, Business, Knowledge, Products & services, FAQs, Personality, Channels, Plan & billing, and Test & go live. On phone and tablet, open and dismiss the preview with touch and keyboard, and on phone check footer reachability with the soft keyboard. Use long data to check list wrapping at each width.
3. In the owner checklist, check missing required input, approved and pending knowledge, empty and populated catalog/FAQs, 4b suggestions/upload/FAQ drafting/language controls, hours confirmation, unapplied channel and plan restrictions, publish blocked with a visible reason, and the successful publish handoff with the dashboard logo in both themes. The agent's own session remains signed out.

## Out of scope

Changes to actions, schemas, validation, auth/session behavior, readiness, publish gates, eligibility/plan gating, persistence, database, live agent or widget runtime. No redesign of dashboard screens beyond the sidebar brand fix. No package or design-system additions. No merge.

## Visual interpretation

Carry the dashboard's olive and lime action hierarchy, quiet surfaces and rounded forms into the wizard. Use the existing Waves identity to connect the marketing and auth entry points with the application.

## Layout and hierarchy

Header with Waves brand, shared theme toggle and account control. Show the current step and readiness near the top, cards in the center, a secondary live preview, and a sticky row for Back/Continue or the existing terminal action.

## Typography and spacing

Use the current dashboard's Hanken Grotesk stack and shared page and card sizes. Use the existing spacing and radius scale for readable groups, generous inner padding and comfortable touch targets.

## Components

Prefer `PageHeader`, `Card`, `CardHeader`, `Pill`, `InfoBanner`, button/input classes, existing empty and error patterns and existing action controls. Add route-specific layout, a sheet and widget presentation where the shared components do not provide them.

## Responsive behavior

- At **375 px**, a single column, compact top progress, Preview sheet, and sticky action area with dynamic viewport and safe-area handling. Test above the open keyboard.
- At **768 px**, rail plus form with the same Preview affordance.
- At **1280 and 1440 px**, rail, min-width-zero form, and inline live preview. Use wrap-safe grid tracks and stacked row layouts when knowledge or catalog rows would force overflow.

## States

Use a route-level skeleton shaped like the wizard, actionable empty states, inline field and form errors, visible reasons for disabled controls, pending spinner and label for each add/save using existing state, and success messages grounded in existing outcomes. Keep loading announcements and progress comprehensible and avoid announcing every keystroke.

## Interaction behavior

Preserve step access and active-step transitions. Keep form semantics when integrating the footer. Use the existing hours, sandbox and publish controls. Preserve the safe static mock on all widths.

## Accessibility

Provide visible labels, logical tab order, visible focus, semantic progress with readable counts, accessible names for icon controls, and connected error descriptions. Check AA contrast in both themes, mobile touch targets and focus handling on step transitions and sheet close. Respect reduced motion for the sheet, progress and celebration.

## Delivery

Approved with conditions on 2026-11-21. After pulling `main` with `git pull --ff-only`, fast-forwarded `feat/onboarding-visual-redesign` to `4999aac` (#164). Keep the optional upload behavior: omit the file field without a selection and verify image-free create/edit for products, services and the agent avatar. Fix the Business Hours link in Widget Settings → Appearance and set the Clerk organization name placeholder to “Your business name.” Keep the exact dashboard theme key and default. Include the 375 px test chat and knowledge list and dark Clerk sign-in footer in the PR checklist. Preserve the test-booking simulation notice. Commit in reviewable groups, update the top of `STATE.md`, open a PR to `main`, verify its preview and CI, and leave the merge to the owner.
