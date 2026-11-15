# Widget Settings professional UI reset

## Goal

Replace the current congested, box-heavy Widget Settings presentation with a polished production-grade settings experience that establishes the visual quality bar for the rest of the customer dashboard. Preserve every setting, field, condition, route, action, permission, server boundary, data contract, and Draft → Publish → Live behavior. This is UI/UX work only.

## Current phase

Post-Phase 33 / production-readiness. This is an owner-requested refinement of the unmerged `codex-ui` dashboard design work.

## User request

The user is not satisfied with the current dashboard UI, specifically Widget Settings: it lacks visual hierarchy, feels boxy/congested, and is not launch-ready. Make it professional and production-ready. Reduce visual boxes, improve hierarchy and light mode, and change button typography to a simple, formal font.

## Skills and docs read

- `AGENTS.md`, `STATE.md`, `PRODUCT.md`, `docs/security.md`, `docs/prompt-template.md`
- `.claude/skills/impeccable/SKILL.md`
- `.claude/skills/ui-ux-pro-max/SKILL.md`
- `.claude/skills/ui-styling/SKILL.md`
- `prompts/waves-dashboard-conversations-ui-redesign.md`
- `prompts/waves-dashboard-full-ui-rollout.md`

## Existing code inspected

- `app/(dashboard)/dashboard/widget-settings/page.tsx`
- Widget settings feature components: branding, install guide, readiness checklist, widget key list/create/copy, AI capabilities, suggested questions, publish button, and input classes.
- Adjacent settings patterns: Profile, Notifications, Business Hours, and Webhooks forms/lists.
- Shared button styles: `app/(dashboard)/_components/button-classes.ts` and global `.ds-btn-label` rules in `app/(dashboard)/globals.css`.

## Relevant existing architecture

- Widget Settings is a tenant-scoped Server Component page composed from feature-specific Client Components and existing Server Actions. It is the page that manages widget keys, origins, branding, capabilities, suggested questions, install instructions, and readiness/publish status.
- Permissions and all mutation enforcement remain server-side; page-level button disabling is explanatory only.
- Hanken Grotesk is the readable product font and Space Grotesk currently supplies the technical label/button voice. The existing Waves ink/paper/Signal Red tokens, dark/light mode, no-gradient rule, and thin hairlines remain the brand foundation.

## Decisions and assumptions

- Change primary and secondary action button typography from the technical uppercase Space Grotesk label treatment to the simpler Hanken Grotesk body font, medium weight, normal case, restrained letter spacing. Retain Space Grotesk only for genuinely compact metadata/technical labels.
- Widget Settings becomes a calm settings workspace: one clear page introduction; a two-column desktop composition with a narrow readiness/status rail and a primary settings column; on mobile, a purposeful single-column flow.
- Use sections and dividers to group related work. Reserve full bordered panels for independently actionable or stateful content; do not wrap every heading, field group, or explanatory sentence in a card.
- Light theme receives explicit surface/foreground/border hierarchy via existing semantic tokens, not raw hex values or a separate visual system.
- This iteration modifies Widget Settings plus truly global/shared button and form primitives required to make the design consistent. Do not propagate unrelated page redesigns in this pass.

## Open decisions this depends on

None.

## Dependencies / packages required

None.

## Files likely to change

- `app/(dashboard)/globals.css`
- `app/(dashboard)/_components/button-classes.ts` if needed for shared variants
- `app/(dashboard)/dashboard/widget-settings/page.tsx`
- Widget Settings presentation components named above
- Possibly shared state/form primitives only where the new button/font treatment must be consistently applied
- `STATE.md` as the final implementation step

No server/data modules, migrations, routes, environment files, package manifests, lockfiles, or deployment configuration.

## Database changes

None.

## Server / client boundaries

- Preserve existing Server Components, tenant-scoped loads, Server Actions, form field names, and client interaction boundaries.
- No new client data, no secrets, and no tenant identifiers move client-side.

## Implementation requirements

1. Keep work on `codex-ui`; do not deploy, push, or call external services.
2. Preserve every Widget Settings control, condition, form action, route, permission restriction, error/pending/success state, and copy meaning.
3. Build a clear visual sequence: page purpose and service state → readiness/publish status → widget installation → configuration areas (keys/origins, branding, AI capabilities, suggested questions).
4. Desktop uses a readable main configuration column plus contextual readiness/status rail only where the existing content permits; mobile stacks this in the same priority order.
5. Eliminate unnecessary nested cards, heavy boxed field groups, and competing borders. Use whitespace, section headings, concise helper copy, dividers, and one deliberate surface per actionable unit.
6. Convert action buttons to the formal Hanken Grotesk treatment globally where the existing shared action class is used. Maintain existing focus, disabled, pending, hover, and reduced-motion behavior.
7. Improve forms: consistent label/helper/input spacing, readable max measures, clear visual primary action, and preserved validation/status messaging.
8. Review light theme specifically: surfaces must distinguish canvas, sections, inputs, selected states, and warnings without harsh borders or low-contrast grey text.
9. Do not add gradients, new icon packages, imagery, made-up metrics, new functionality, or content claims.

## Security requirements

- Preserve trusted server-derived `businessId`, Clerk role checks, existing tenant-scoped data access, and server-side authorization exactly as-is (`docs/security.md` §§1–2).
- UI changes do not authorize actions or expose secrets.

## Error handling

- Preserve each current error, validation, disabled, pending, and success state.
- Improve their visual grouping/legibility without suppressing their messages or changing recovery behavior.

## Acceptance criteria

- [ ] Widget Settings has a clearly prioritized, calm settings workflow without unnecessary nested boxed surfaces.
- [ ] Existing widget keys, origins, branding, AI capabilities, suggested questions, readiness, installation, and publishing behavior is unchanged.
- [ ] Buttons use formal Hanken Grotesk styling rather than uppercase technical label styling; states remain accessible.
- [ ] Light and dark themes have clear, professional surface and text hierarchy using current semantic tokens.
- [ ] Mobile remains single-column and usable; desktop layout is readable without congestion.
- [ ] No server/data/API/auth/route/package/migration/deployment change.

## Automated checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `git diff --check`
- Impeccable detector on changed dashboard targets

## Manual testing steps

1. Open `/dashboard/widget-settings` as admin and viewer in dark/light themes at desktop and mobile widths.
2. Verify readiness, publishing, widget installation, key creation/copy/revoke, origin editing, branding, AI settings, and suggested-question forms retain their existing behavior and messages.
3. Keyboard-navigate every field and action, including dialogs/menus; verify visible focus and disabled/pending states.
4. Inspect empty, warning, validation-error, connection/readiness, and success states.
5. Confirm a different tenant cannot read or mutate Widget Settings data using existing safe response behavior.

## Out of scope

- Changing Widget Settings functionality or business logic; broader dashboard redesign; `/apache`; onboarding; public widget; auth/marketing; API/database/schema/RLS; deployment.

## Visual interpretation

Professional operational settings, not a collection of product cards. The page should feel calm, precise, and confidence-inspiring: an editor’s structured canvas with only a few elevated/actionable surfaces. Typography carries hierarchy; spacing carries grouping; borders mark true boundaries. Buttons are formal product controls, not shouty technical labels.

## Layout and hierarchy

- Page header: concise title and explanation with clear context for where the global Publish control lives.
- Desktop: `minmax(0, 1fr)` primary configuration stream plus a compact contextual rail for readiness/installation where existing components allow.
- Mobile: readiness first, then install/setup, then configuration sections in the order users need them.
- Each section uses a heading, one-sentence helper when existing copy warrants it, then controls—without redundant outer/inner boxes.

## Typography and spacing

- Hanken Grotesk: body and all action buttons; 14–15 px, medium weight, normal casing, minimal tracking.
- Space Grotesk: tiny metadata/status labels only.
- Use an 8 px rhythm, 24–40 px section separation, and narrow form measures to reduce visual fatigue.

## Components

- Reuse existing Widget Settings components and existing Lucide icons.
- Add at most small presentation-only Widget Settings layout primitives if they eliminate real duplicated wrappers.

## Responsive behavior

- Desktop prioritizes reading width and avoids a wall of full-width cards.
- Tablet collapses the secondary rail below or above content as space requires.
- Mobile is single-column with full-width primary actions where appropriate and no horizontal scrolling.

## States

- Preserve default, loading, empty, validation error, server error, warning, disabled, pending, and success states.
- Warnings/readiness states are visible through icon/text/semantic colour—not colour alone.

## Interaction behavior

- No interaction changes. Preserve existing actions and enablement logic.
- Retain short functional transitions and reduced-motion behavior.

## Accessibility

- Maintain labels, descriptions, live/alert roles, keyboard access, focus order, visible focus, and accessible icon-button names.
- Verify contrast and surface distinction in both themes.
