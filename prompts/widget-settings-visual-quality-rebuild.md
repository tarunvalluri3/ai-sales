# Widget Settings visual-quality rebuild

## Objective

Rebuild the presentation of `/dashboard/widget-settings` into a calm, high-confidence configuration workspace that is credible for production SaaS. This is a focused visual-quality revision after the first hierarchy reset: it must solve the remaining concerns around boxiness, congestion, weak light-mode composition, and generic-looking form controls without changing any user-visible product behavior.

The reference direction is an **editorial configuration console**: a single, spacious working surface divided by strong typographic landmarks and restrained hairlines, with only one supporting deployment/status rail. It must retain the existing Waves visual language (ink/paper, Signal Red, thin rules, Hanken Grotesk and Space Grotesk) and use no gradients.

## User request

- Make Widget Settings professional and production ready.
- Improve visual hierarchy and make the page substantially less boxy and congested.
- Improve the light theme deliberately, not merely through dark-theme token inversion.
- Keep a simple, formal button font.
- Do not change functionality, tenant isolation, permissions, API contracts, Draft → Publish → Live behavior, or any existing workflow.
- Do not deploy.

## Current implementation and constraints

- The work is on branch `codex-ui`.
- The settings page is server-rendered at `app/(dashboard)/dashboard/widget-settings/page.tsx`. It derives the business context only server-side via `requireBusinessContext()`, gates key management through `hasMinRole()`, and passes existing tenant-scoped data to the client components.
- Page subsections currently use `WidgetInstallGuide`, `CreateWidgetKeyForm`, `WidgetKeyList`, `WidgetBrandingSection`, `SuggestedQuestionsSection`, and `AiCapabilitiesSection`. Preserve their props, action bindings, IDs, field names, mutation/revalidation behavior, errors, loading behavior, and role gates.
- Existing shared dashboard tokens and theme mechanism live in `app/(dashboard)/globals.css`; retain the existing brand palette, token names where possible, formal Hanken Grotesk button labels, Space Grotesk technical labels, motion reduction behavior, and focus treatment.
- Existing dashboard UI may have unrelated uncommitted work. Do not reset, reformat, or modify it outside this scope.
- There is no new package, schema, API, database, route, environment, auth, or deployment work.

## Visual direction

### Page composition

1. Treat the page as a composed workspace—not a vertical pile of boxed modules.
2. Create a generous page header with a clear title, short outcome-focused description, and measured whitespace before the first task. Do not add an eyebrow/kicker, decorative illustration, or non-functional page controls.
3. Make the primary editor a continuous content rail. Separate install, access keys, and customization with full-width rules, section titles, useful descriptions, and an intentional vertical rhythm rather than repeated surface cards.
4. Keep the status/deployment information as the only deliberate secondary surface. It should have a clear job: explain publish state and active key availability at a glance. It must be visually quiet, sticky only at desktop widths, and fall into the normal document flow below the editor on smaller screens.
5. Establish a stronger reading measure: long helper copy must not span the full editor width, while forms should use a narrower, comfortable form measure. Use grids only when inputs genuinely benefit from comparison.
6. Use Signal Red only for meaningful primary action, live/attention state, validation, or selected state; it must not become broad decoration.

### Typography, controls, and density

- Retain the project fonts. Use Hanken Grotesk for clear, sentence-case action labels and body copy; use Space Grotesk sparingly for compact metadata and technical identifiers.
- Give title, section title, helper text, labels, and key metadata visibly distinct size, weight, line-height, and color roles. Do not make every label uppercase or use low-contrast grey-on-grey text.
- Make button labels formal and calm: sentence case, no tracking gimmicks, no bounce/scale adornments, and no decorative pseudo-elements.
- Inputs, code areas, and key records need a material but restrained distinction from the page canvas: subtle surface shift, precise border, comfortable internal padding, and a clear keyboard-focus state. They must not resemble nested cards.
- Preserve a spacious baseline: the page should feel intentional at desktop and compact but breathable on mobile. Do not use uniform card padding as the page’s only spacing system.

### Light and dark themes

- Refine via existing semantic CSS variables only. Do not scatter literal colors through page components.
- In light mode, prioritize readable dark text, differentiated canvas/surface layers, visible hairlines, and a calm warm-neutral base. Ensure helper copy and labels meet accessible contrast; do not use washed-out grays as the main hierarchy mechanism.
- Dark mode remains the existing ink-first experience with clear surface separation and no overly bright fills.

### Responsive and accessibility requirements

- At narrow widths, use one clear reading column; the status surface must not create horizontal overflow or a cramped side-by-side composition.
- Preserve every existing semantic heading, label association, field validation message, button disabled/pending state, dialog/menu behavior, and screen-reader naming.
- All keyboard focus must remain obvious; all interactive targets remain comfortably touchable; hover must never be the only feedback.
- Respect `prefers-reduced-motion`; limit visual transitions to color/border/shadow changes of 150–200ms, with no layout-shifting animation.
- Maintain loading, empty, key-generation pending/error, validation-error, viewer-role, published/unpublished, and no-active-key states. The redesign may improve their placement and visual clarity but cannot alter their logic or copy semantics.

## Implementation scope

Likely files, subject to source reinspection immediately before implementation:

- `app/(dashboard)/globals.css`
- `app/(dashboard)/dashboard/widget-settings/page.tsx`
- `components/dashboard/widget-settings/widget-install-guide.tsx`
- `components/dashboard/widget-settings/create-widget-key-form.tsx`
- `components/dashboard/widget-settings/widget-key-list.tsx`
- `components/dashboard/widget-settings/widget-branding-section.tsx`
- `components/dashboard/widget-settings/suggested-questions-section.tsx`
- `components/dashboard/widget-settings/ai-capabilities-section.tsx`

Do not change server actions, `lib/`, route handlers, migrations, Supabase policies, Clerk configuration, or widget runtime code.

## Explicit non-goals

- No behavior, copy-flow, role, mutation, publication, embed, key, or permission changes.
- No redesign of other dashboard routes in this pass.
- No new UI library, fonts, image assets, icons, dependencies, routes, analytics, or feature flags.
- No gradients, dense bento-card layout, ornamental dashboard chrome, or decorative visual effects.
- No deployment and no production-data access for visual testing.

## Validation plan

1. Re-read this prompt and inspect every target component before editing.
2. Read the current Next.js 16 guidance in the installed package before writing code that touches framework behavior (none is expected).
3. Use the project’s existing UI primitives and CSS token system; run the Impeccable detector after UI edits.
4. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
5. Do not run database tests or commands against the production-linked Supabase configuration.
6. Perform a browser visual review only in a safe local or non-production authenticated environment. Review desktop and narrow mobile widths in both themes with representative states: unpublished/published, key list/empty list, form validation/pending/error, and viewer-role restriction. If such an environment is unavailable, explicitly report the limitation and give the owner exact manual review steps rather than accessing live tenant data.

## Acceptance criteria

- The page reads as one intentionally composed configuration workflow with an unambiguous primary editor and secondary deployment context.
- It no longer looks like a stack of generic settings cards, including in light mode.
- Typography makes the hierarchy immediately scannable, and buttons feel simple and formal.
- Existing functionality, roles, server data flow, API contracts, and publication lifecycle are unchanged.
- It is responsive, keyboard-accessible, token-driven, gradient-free, and uses the existing brand system.
- All safe checks above pass and their actual results are reported.
- `STATE.md` is updated as the final implementation step only after the implementation and checks succeed.
