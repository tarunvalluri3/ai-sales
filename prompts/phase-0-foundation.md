# Phase 0 — Project foundation

## Goal
After this is implemented, the repo is a Next.js 16 / React 19 / TypeScript / Tailwind v4 app with no leftover `create-next-app` boilerplate, a documented `.env.example`, a documented and minimally-scaffolded folder convention for server-only code, validation, and error handling, and passing `lint` and `build`. No product features are added. This satisfies the Phase 0 exit criteria in `docs/phases.md`.

## Current phase
Phase 0 — Project foundation. Confirmed from `STATE.md` §1.

## User request
Write the Phase 0 implementation prompt covering the actual gaps found during inspection: `.env.example`, folder/module conventions (server-only, validation, error handling per `AGENTS.md` §9), replacing the `create-next-app` boilerplate in `app/page.tsx` / `app/layout.tsx` / metadata, and verifying lint/build pass. Two calls to make explicitly rather than silently: (1) keep no-`src/`, top-level `app/`; (2) decide now whether to install Zod in Phase 0 or defer it, and justify the choice.

## Skills and docs read
- `STATE.md` — current phase, open decisions, planned env var list
- `AGENTS.md` — full file, especially §2 (stack), §5 (workflow), §9 (architecture boundaries)
- `docs/phases.md` — Phase 0 and Phase 1 exit criteria
- `docs/security.md` — §5 (environment variables), §10 (error handling)
- `docs/prompt-template.md` — this template
- No skills were needed for this inspection (no auth, DB, or UI-design-system work yet)

## Existing code inspected
- `package.json` — `next@16.3.0`, `react@19.2.8`, `react-dom@19.2.8`, Tailwind v4 (`@tailwindcss/postcss`), TypeScript `^5`, ESLint `^9`. No Clerk, Supabase, LangChain, Gemini, or Zod. `lint` script exists; no `typecheck`/`test` script.
- `app/layout.tsx`, `app/page.tsx` — unmodified `create-next-app` output (default metadata title "Create Next App", template Vercel/Next.js marketing content, Geist fonts).
- `tsconfig.json` — `strict: true`, `@/*` → `./*` path alias assuming top-level (no `src/`) layout.
- `next.config.ts` — empty default.
- `eslint.config.mjs` — flat config using `eslint-config-next/core-web-vitals` + `/typescript`.
- `.gitignore` — `.env*` already ignored; no `.env.example` present anywhere in the repo.
- No `middleware.ts` or `proxy.ts` exists.
- No `lib/`, `components/`, or any application module directory exists — only `app/`.
- `node_modules` is installed; `package-lock.json` is committed.

## Relevant existing architecture
- Top-level `app/` (no `src/`) is already what's on disk and what `tsconfig.json`'s `@/*` alias assumes.
- `AGENTS.md` §9 requires: UI, route handlers, auth, validation, database access, AI orchestration, retrieval, ingestion, lead logic, and tool execution kept as separate concerns; thin route handlers; no DB access in client components; `server-only` where appropriate; Zod at every runtime boundary (§2, non-negotiable).
- `AGENTS.md` §9 also says: "Install a dependency only when the current phase needs it... Never add a package that duplicates something already in the approved stack."
- `docs/security.md` §5: "Add a variable only when a feature actually requires it," and "Validate required env vars at startup and fail loudly rather than at first use."

## Decisions and assumptions

1. **No `src/` — keep top-level `app/`.** This is already what's on disk and what `tsconfig.json`'s `@/*` path alias assumes. Changing it now would be a pure-churn move with no functional benefit and would touch every future import. **Explicit call, not silent, per your instruction.**

2. **Zod: defer the install to the phase that first has a real runtime boundary, not Phase 0.** **Explicit call, not silent, per your instruction.**
   Reasoning: Phase 0 has no concrete boundary to validate against yet. `.env.example` will exist for documentation purposes, but `STATE.md` §5 and `docs/security.md` §5 both say a variable is added "only when a feature actually requires it" — and no phase-0 feature requires any (Clerk/Supabase/Gemini keys belong to Phases 2/3/7). There is no request body, query param, webhook, or AI output to validate yet either; Phase 1's own exit criterion is explicitly "a request can flow through a route handler with validated input" — that is the first real boundary. Installing Zod now would mean it sits in `package.json` with zero call sites, which conflicts with the explicit rule in `AGENTS.md` §9 ("install a dependency only when the current phase needs it"). Phase 0's "shared validation conventions" goal is satisfied by documenting *where* Zod schemas will live and how they'll be named/colocated with route handlers (see `docs/architecture.md` below), not by installing the library ahead of any usage. Zod will be installed in Phase 1 as part of that phase's own prompt.

3. **Add the `server-only` package now, not deferred.** Unlike Zod, this has an immediate, concrete use in Phase 0 itself: the goal explicitly includes establishing "server/client boundaries," and this is a single-purpose, official Next.js-ecosystem package (a few KB, no transitive surface) that enforces exactly that boundary at build time by throwing if a module tagged with it is imported into a client bundle. `lib/errors.ts` (below) will use it immediately. Flagging this as a decision since it is a new dependency, even though small and directly in-scope.

4. **New file: `docs/architecture.md`.** Phase 0's exit criterion requires folder conventions to be "documented." The existing docs (`AGENTS.md`, `docs/security.md`, `docs/phases.md`, `docs/prompt-template.md`) don't have a natural home for this, and editing `AGENTS.md` itself (the contract file) is out of scope for a Phase 0 prompt. This new doc will cover: the no-`src/` layout, where server-only utilities live (`lib/`), the validation convention (colocate Zod schemas with the route handler or server action that uses them, once Zod is installed in Phase 1), and the error-handling convention (`lib/errors.ts`). `AGENTS.md`'s reference-map table (§6) is not modified — that's an approval-gated change to the contract file itself and isn't needed for this file to be discoverable (it's linked from `docs/architecture.md`'s neighbors and can be added to the map in a later, explicitly approved edit if you want it there).

5. **`app/page.tsx` becomes a minimal, undesigned placeholder**, not a styled landing page. `AGENTS.md` §10: "There is no supplied design system, and you must not invent a complete one uninstructed." The replacement will state the project name and phase status only, using plain Tailwind utility classes already present in `globals.css`, with no new visual system, no new component library, no imagery.

## Open decisions this depends on
None. Decisions D1–D6 in `STATE.md` §4 are not needed until Phases 2, 3, 7, 11, 6, and 10 respectively.

## Dependencies / packages required
- `server-only` (latest) — enforces the server/client boundary for `lib/errors.ts` and future server-only modules. Not currently in `package.json`. Confirmed via inspection above.
- No other packages. Zod is explicitly deferred (see Decisions §2).

## Files likely to change
**Created:**
- `.env.example`
- `docs/architecture.md`
- `lib/errors.ts`

**Modified:**
- `app/layout.tsx` — replace default metadata (title/description) and remove template-specific content if any remains after inspection; keep the existing font setup and HTML shell structure.
- `app/page.tsx` — replace `create-next-app` boilerplate with a minimal placeholder (project name + phase status, no template links, no Vercel/Next.js marketing content or template imagery).
- `package.json` / `package-lock.json` — add `server-only`.
- `STATE.md` — update per the standard end-of-task requirement (§9 of this template's parent workflow): move Phase 0 into §2 once approved, update §1/§3, log the `server-only` dependency decision if you want it recorded, no new env vars actually populated in §5 (still none required), update §7 with this prompt's status.

**Deleted:** None.

## Database changes
None.

## Server / client boundaries
- `app/layout.tsx` and `app/page.tsx` remain server components (Next.js App Router default) — no `"use client"` needed for a static placeholder.
- `lib/errors.ts` is server-only: starts with `import "server-only";` so any accidental client-component import fails the build loudly instead of silently shipping server logic to the browser.
- No secrets are introduced in this phase — `.env.example` documents the *planned* variable names from `STATE.md` §5 as comments/placeholders only, with no values, and clearly marked as "not yet required" until their owning phase.

## Implementation requirements

1. **`.env.example`**: list the full planned core set from `STATE.md` §5 (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`, `GEMINI_CHAT_MODEL`, `GEMINI_EMBEDDING_MODEL`), each as a commented-out or empty placeholder line, grouped by the phase that introduces it, with a header comment explaining that a variable is only wired into the app when its owning phase lands. No real values, ever.
2. **`lib/errors.ts`**: a small, framework-agnostic error-handling convention — e.g. a typed `AppError` (or equivalent) that carries a safe, user-facing message separate from any internal detail, plus a helper to log the internal detail server-side. This is a convention/scaffold only; it is not wired into any route yet since none exist. Must start with `import "server-only";`.
3. **`docs/architecture.md`**: document (a) the no-`src/`, top-level `app/` decision and why, (b) that `lib/` holds server-only modules and each such module starts with `import "server-only";`, (c) the validation convention — Zod schemas will be colocated with the route handler/server action that owns the boundary, installed starting Phase 1, not centralized in a generic `lib/validation.ts` grab-bag, (d) the error-handling convention pointing at `lib/errors.ts`.
4. **`app/layout.tsx`**: replace `metadata.title`/`metadata.description` with project-accurate values (e.g. "AI Sales" / a one-line accurate description — not marketing copy). Remove any remaining `create-next-app`-specific content. Keep the Geist font setup and the existing HTML/body structure since that's unrelated to the boilerplate-content problem.
5. **`app/page.tsx`**: replace the entire body with a minimal placeholder — project name, and a short "Phase 0 — project foundation" status line. Plain text and existing Tailwind utility classes only. Remove the Next.js/Vercel template links, template imagery (`next.svg`, `vercel.svg` usage), and the `Image` import if it becomes unused. Do not introduce new components, icons, or a designed layout.
6. Add `server-only` to `package.json` via the package manager already in use (npm, per the committed `package-lock.json`).
7. Do not touch `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, or `postcss.config.mjs` — none of the identified gaps require changing them, and AGENTS.md §9 forbids unrequested extras.

## Security requirements
- No secrets are added or exposed in this phase. Reference `docs/security.md` §5 and §6 — `.env.example` must contain no real values, and nothing added here reads `process.env` yet (there's nothing to read).
- `lib/errors.ts` must not leak internal detail (stack traces, provider errors) into whatever it returns for user-facing display — reference `docs/security.md` §10. Since nothing calls it yet, this is a contract on the module's shape, verified by reading it, not by a runtime test.

## Error handling
No new failure modes are introduced — there is no user-facing runtime path yet (no route handlers, no forms, no external calls). `lib/errors.ts` establishes the *convention* future phases must follow; it has no behavior to fail at this phase.

## Acceptance criteria
- [ ] `.env.example` exists at repo root, lists the full planned core set from `STATE.md` §5 with no real values, grouped/commented by owning phase
- [ ] `docs/architecture.md` exists and documents the four items in Implementation Requirement 3
- [ ] `lib/errors.ts` exists, starts with `import "server-only";`, exports a typed error convention
- [ ] `app/layout.tsx` has project-accurate metadata, no leftover `create-next-app` boilerplate
- [ ] `app/page.tsx` has no Vercel/Next.js template content, links, or imagery; renders a minimal placeholder
- [ ] `server-only` is present in `package.json` dependencies and `package-lock.json`
- [ ] `npm run lint` passes with zero errors
- [ ] `npm run build` completes successfully
- [ ] No `src/` directory was introduced
- [ ] No Zod dependency was added
- [ ] `STATE.md` is updated per its own "How to update this file" section before the task is reported done

## Automated checks
Run and report actual output for:
```
npm run lint
npm run build
npx tsc --noEmit
```
(No `typecheck` script exists yet and no tests exist yet — `npm test` is not applicable this phase, per `STATE.md` §7/§8.)

No tenant-isolation tests apply — no business-owned data access exists yet.

## Manual testing steps
1. `npm run dev`, visit `http://localhost:3000`.
2. Confirm the page shows the placeholder content (project name + phase status) and **not** the "To get started, edit the page.tsx file" template text, the Vercel "Deploy Now" button, the "Documentation" link, or the Next.js/Vercel logos.
3. View page source / browser tab title — confirm it reads the new metadata title, not "Create Next App".
4. Open `.env.example` — confirm every variable listed has no real value and is clearly annotated with the phase that introduces it.
5. Negative case: confirm `lib/errors.ts` is **not** importable from a client component — temporarily add `"use client"` plus an import of it to a scratch file and confirm the build fails with the `server-only` error, then discard the scratch file (do not commit it).

## Out of scope
- Installing or configuring Clerk, Supabase, LangChain, or Gemini (Phases 2/3/7)
- Installing Zod (deferred to Phase 1, per Decision §2 above)
- Any route handler, server action, or API surface (Phase 1)
- Any actual env var values or deployment configuration (Vercel, per `AGENTS.md` §2, introduced when deployment is introduced)
- Any visual design system, component library, or styled landing page (§10 — user owns visual direction, not to be invented uninstructed)
- `middleware.ts`/`proxy.ts` (Phase 2)
