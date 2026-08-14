# Phase 19a — Production hardening: audit

## Goal
A single written findings report exists (`docs/phase-19-audit-findings.md`) that inventories every gap between the current implementation and `docs/phases.md`'s Phase 19 exit bar, across security, tenancy, auth, secrets, validation, error handling, rate limiting/abuse, database indexes, vector query performance, build/deploy configuration, environment validation, logging, responsive UI, accessibility, and production smoke-testability. No application code, configuration, or database state changes as part of this prompt — this is a read-only review whose output is the report itself, which then drives one or more separately-approved Phase 19 remediation prompts.

## Current phase
Phase 19 — Production hardening. Confirmed from `STATE.md` §1/§3 ("Next phase is Phase 19 — Production hardening").

## User request
"Give me the implementation prompt for the last phase," followed by an explicit choice (via clarifying question) for **audit-first, then fix**: a read-only audit producing a findings report, with remediation done in separate follow-up prompt(s) scoped to what the audit actually finds — rather than one large prompt guessing at problems, or several themed prompts written before anyone has looked.

## Skills and docs read
- `STATE.md` (full) — current phase, all 18 prior phase closure entries, resolved decisions table (D1–D11), env vars in use (§5), database state (§6).
- `docs/phases.md` — Phase 19's scope list (no separate exit-criterion sentence is written for Phase 19 the way earlier phases have one; the phase's own bullet list *is* its scope).
- `AGENTS.md` — full (engineering contract, the five non-negotiable rules in §3, prompt-first workflow in §5, checks in §7).
- `docs/security.md` — full (multi-tenancy, auth, RLS/database, public widget, env vars, secrets, untrusted input, AI safety, retrieval isolation, error handling, and the §11 review checklist — this audit effectively re-runs that checklist project-wide instead of per-phase).
- `docs/prompt-template.md` — this prompt's own contract.
- `.claude/skills/supabase-postgres-best-practices/` — referenced for the database-indexes and vector-query-performance portions of the audit; not fully read in advance since the audit itself is where it gets applied against real schema.
- `PRODUCT.md` — not read in full for this prompt; Phase 19 is non-functional hardening of already-approved product scope, not new product behavior. The remediation prompt(s) that follow this audit should read it if a finding touches product-facing behavior (e.g. fallback copy, error messaging).

## Existing code inspected
- `package.json` — confirms the installed dependency set (Clerk, `@google/genai`, `@langchain/core`, `@langchain/google-genai`, `@supabase/supabase-js`, Next 16.3.0, React 19.2.8, Zod 4, Tailwind 4, `supabase` CLI) and that `npm test` has no script yet (only `dev`/`build`/`start`/`lint`) — relevant to the audit's build-checks and testing sub-areas.
- `docs/security.md` §5 and `STATE.md` §5 — the authoritative current env var list, used as the baseline the audit checks `.env.example` and actual usage against.
- `STATE.md` §6 — the full list of 25 applied migrations, used as the baseline the audit's database/RLS/grants sub-area checks against, rather than re-deriving schema history from scratch.

Full file-by-file source inspection (route handlers, `lib/` modules, RLS policies, `proxy.ts`, `public/widget-loader.js`, etc.) is deliberately **not** listed here because it is the audit task itself, not prep for writing this prompt — see "Implementation requirements" below for exactly what must be opened and checked.

## Relevant existing architecture
- Tenant boundary = Clerk Organizations mapped to `businesses.clerk_org_id`; defense-in-depth tenancy (RLS + application-layer `business_id` filtering, decision D2).
- `requireBusinessContext()` (`lib/business-context.ts`) is the standard `{ userId, businessId }` resolution helper; `docs/security.md` §2 expects all business-owned data access to route through an equivalent helper.
- Public widget path (`resolveBusinessFromWidgetKey()`, `lib/widget-auth.ts`) is the one deliberately unauthenticated path, using a service-role Supabase client (`lib/supabase/service.ts`) and a Postgres-backed rate limiter (`rate_limit_counters` + `increment_rate_limit_counter()`), per D4.
- Structured logging (`lib/logger.ts`, Phase 18) and error handling (`lib/errors.ts`, Phase 0) already exist as conventions this audit checks for *consistent use of*, not conventions it invents.
- No test runner exists yet (`npm test` has no script) — pgTAP tests exist as `.sql` files under `supabase/tests/database/` but `STATE.md` repeatedly records them as written-but-never-executed by any automated command, superseded in practice by manual/live cross-tenant verification each phase. This is itself a Phase 19 audit target (§7's "Never claim a check passed unless it was run" applies to whatever the remediation prompt eventually proposes here).

## Decisions and assumptions
1. **Read-only scope.** This prompt produces findings only. Even a "one-line, obviously safe" fix discovered mid-audit (e.g. a stray `console.log`) must be recorded as a finding, not applied inline — keeps the audit's own diff empty and auditable, and keeps remediation under its own approval per `AGENTS.md` §5. Flag for the user: confirm this is the intended boundary before the follow-up remediation prompt is written.
2. **Report location and shape.** `docs/phase-19-audit-findings.md`, one new file, organized by the same sub-areas Phase 19 lists in `docs/phases.md`, each finding tagged with a severity (`blocker` / `should-fix` / `nice-to-have`) and the exact file/line or migration it concerns. Chosen over e.g. GitHub issues since this project has no issue tracker referenced anywhere in `STATE.md`/`AGENTS.md`.
3. **Severity, not a fix plan.** The report states *what* is wrong and *why it matters against `docs/security.md`/`AGENTS.md`*, not *how* to fix it — sequencing and remediation design belong to the follow-up prompt(s), written after the user has seen what was actually found (this is the entire reason audit-first was chosen over a single combined prompt).
4. **No new tooling installed to perform the audit.** Static analysis (grep/read, `npm run lint`/`npx tsc --noEmit`/`npm run build`, direct Supabase inspection via the existing `supabase` CLI already in `devDependencies`) is sufficient; no new dependency (e.g. a security-scanner package) is added just to produce this report — consistent with `AGENTS.md` §9's "install a dependency only when the current phase needs it."
5. **Accessibility/responsive/smoke-test sub-areas are audited by inspection plus the checks already run (`npm run build`), not a live browser pass.** A full Playwright-driven UI audit is the kind of thing prior phases (15b/15c/18) did only for *verifying an implemented change*, not for open-ended discovery across every dashboard/widget screen at once. Flag for the user: if a live-browser accessibility/responsive pass across all screens is wanted as part of Phase 19, say so and it can be scoped into the remediation prompt(s) or a dedicated follow-up, rather than blocking this audit on standing up that harness first.
6. **Vector/index performance is assessed against current data volume, not load-tested.** `docs/phases.md`'s Phase 7 already deferred creating a vector index "when data volume justifies it, not reflexively" — this audit checks whether that threshold has now plausibly been crossed and whether `EXPLAIN`-level review of `match_knowledge_chunks()` and other hot queries is warranted, not run a synthetic load test.

## Open decisions this depends on
None currently open in `STATE.md` §4 that block an audit. (Remediation prompts written after this audit may surface new decisions — e.g. whether to add a test runner — which would then need to go through the normal decision-recording process.)

## Dependencies / packages required
None. No package is added, removed, or upgraded by this prompt.

## Files likely to change
- **Created:** `docs/phase-19-audit-findings.md` only.
- **Modified:** `STATE.md` (§1 current-phase entry recording the audit's completion and pointing at the findings doc, per `AGENTS.md` §0.6 — this is bookkeeping, not a scope violation of "read-only").
- **Deleted:** none.

No source file under `app/`, `lib/`, `public/`, `supabase/migrations/`, or config files (`proxy.ts`, `eslint.config.mjs`, `tsconfig.json`, `next.config.ts`, etc.) is modified.

## Database changes
None. The audit may run read-only inspection queries (e.g. `select` against `information_schema`, `pg_policies`, `has_table_privilege`/`has_column_privilege`, `EXPLAIN` on hot queries) directly against the project's existing Supabase instance to verify grants/RLS/indexes match what `STATE.md` §6 claims, but issues no `supabase migration new` and applies no migration.

## Server / client boundaries
Not applicable in the usual sense — no new code is written. The audit itself specifically checks that this boundary is respected throughout the existing codebase (no secret in a client component, no `NEXT_PUBLIC_*` secret, `server-only` used where expected) as part of its security/secrets sub-area.

## Implementation requirements

Produce `docs/phase-19-audit-findings.md` with one section per sub-area below. For each, actually open and check the named files/state — do not report from memory or from this prompt's own summaries above.

1. **Security / tenant isolation review.** Re-run `docs/security.md` §11's checklist project-wide (not per-phase): every business-owned table has `business_id` + FK; every data-access function in `lib/` filters by `business_id` at the query level; no query relies on post-fetch application filtering. Cross-check against the table list in `docs/security.md` §1's hierarchy diagram.
2. **Auth review.** Confirm every protected page/route/Server Action independently validates identity server-side (not just via `proxy.ts`), per `docs/security.md` §2's explicit warning about `auth.protect()` on the Next.js 16 proxy runtime. Check `requireAuthContext()`/`requireBusinessContext()` call-site coverage — flag any data-access path that doesn't route through them.
3. **Secrets review.** Grep for the five named secrets (`docs/security.md` §6) across `app/`, `lib/`, `public/` (especially `public/widget-loader.js`, the one file that ships to the browser as-is) and any log call site; confirm no `NEXT_PUBLIC_*` var holds one; confirm `.env.example` and `STATE.md` §5 agree on the required set with no drift.
4. **Validation review.** Confirm every external input boundary (request bodies, query params, Server Action inputs, AI structured/tool outputs) is Zod-validated, per `docs/security.md` §7. Spot-check tool schemas (`lib/tools/*.ts`) specifically, since they are the AI-safety boundary in `docs/security.md` §8.
5. **Error handling review.** Confirm `lib/errors.ts`'s `logAndGetUserMessage()` (or an equivalent controlled path) is used everywhere user-facing errors originate; grep for any raw error/stack-trace/database-error string that could reach a client response.
6. **Rate limiting and abuse review.** Confirm every unauthenticated or high-volume path (`/api/chat`, `/api/chat/poll`, any future public route) has a `rate_limit_counters` scope; check the existing scopes' window/limit values are still sane; confirm the increment function's grants (`service_role`-only execute) haven't drifted.
7. **Database indexes review.** For each business-owned table, confirm a `business_id` index exists (or a composite index covering the actual hot query shape, e.g. the Phase 15a `(business_id, needs_attention)` partial index) and flag any table lacking one that's queried by `business_id` in the application layer.
8. **Vector query performance review.** Inspect `match_knowledge_chunks()`'s current query plan against current `knowledge_chunks` row counts; state whether an HNSW/IVFFlat index is now justified per Phase 7's original deferral criterion, and whether the 1536-dimension/`security invoker` setup (D3) still checks out against the live function definition.
9. **Build checks review.** Run and record the real output of `npm run lint`, `npx tsc --noEmit`, and `npm run build`. Note that `npm test` has no script yet — state this as a finding (not a failure) if Phase 19 is expected to require an automated test runner.
10. **Deployment configuration review.** Since `AGENTS.md` §2 names Vercel as the deployment target "when deployment is introduced," check whether any Vercel-specific configuration (`vercel.json`, project settings referenced in docs, build/output settings) exists or is still needed, and whether `next.config.ts` has anything hardening-relevant (headers, image domains, etc.) either present or conspicuously absent.
11. **Environment validation review.** Confirm `docs/security.md` §5's "validate required env vars at startup and fail loudly rather than at first use" is actually implemented somewhere (or flag that it is not) — check for a startup-time validation module vs. reliance on first-use failures.
12. **Logging review.** Confirm Phase 18's `logEvent()` convention (closed metadata type, no free-text) is used consistently and no call site regressed to a raw `console.log`/`console.error` for a business event since Phase 18 closed.
13. **Responsive UI and accessibility review.** Static inspection (not a live browser pass, per Decision 5 above) of dashboard and widget components for obvious responsive/accessibility gaps: missing `alt`/labels, keyboard-reachability of interactive elements, color-contrast-relevant class usage, viewport/breakpoint handling already present vs. missing.
14. **Production smoke-test readiness review.** State what a minimal production smoke-test pass would need to cover (sign-in, business resolution, widget chat, tool call, escalation, dashboard load) and whether anything in the current implementation would block running that today (e.g. missing env var docs, a hardcoded `localhost` reference).

Each finding must cite the exact file (and line, where practical) or migration it concerns — no unattributed claims.

## Security requirements
This prompt performs no write path itself, so `docs/security.md`'s rules apply as the audit's *subject matter*, not as constraints on new code: every one of §1 (tenancy), §2 (auth), §3 (RLS), §4 (widget), §5 (env vars), §6 (secrets), §7 (untrusted input), §8 (AI safety), §9 (retrieval isolation), and §10 (error handling) is a section the audit must explicitly report against, even if the finding is "no gap found."

## Error handling
Not applicable — no new runtime error paths are introduced. If a read-only inspection query against Supabase fails (e.g. insufficient privilege on `information_schema` from the key in use), record that as a finding about what could not be directly verified, rather than silently skipping the sub-area.

## Acceptance criteria
- [ ] `docs/phase-19-audit-findings.md` exists and has one clearly-labeled section per the 14 sub-areas in "Implementation requirements."
- [ ] Every finding names an exact file/line or migration; no vague or unattributed claims.
- [ ] Every finding has a severity (`blocker` / `should-fix` / `nice-to-have`).
- [ ] Sections 1–8 (security-adjacent) explicitly cross-reference the relevant `docs/security.md` section number for each finding.
- [ ] `npm run lint`, `npx tsc --noEmit`, and `npm run build` were actually run and their real output is quoted in the "Build checks review" section (not paraphrased as "passed").
- [ ] No file outside `docs/phase-19-audit-findings.md` and `STATE.md` was modified.
- [ ] `git status` after the audit shows only those two files changed.
- [ ] `STATE.md` §1 is updated recording the audit's completion and pointing at the findings doc.

## Automated checks
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

No tenant-isolation test is added by this prompt (no code changes to test); existing tenant-isolation coverage is reviewed, not extended, here.

## Manual testing steps
Not applicable in the usual sense — there is no new user-facing behavior to click through. Verification of this prompt's own output is: open `docs/phase-19-audit-findings.md` and confirm every acceptance-criteria checkbox above against the actual file content, and confirm `git status` / `git diff` show no source-code changes.

## Out of scope
- Any actual remediation (code, config, migration, or dependency change) for findings this audit surfaces — that is one or more separately-approved Phase 19 remediation prompts, written after the user has reviewed this report.
- Adding a test runner (`npm test`) or any new testing/scanning dependency — even if the audit recommends one, adding it is a remediation-prompt decision, not this one.
- A live-browser accessibility/responsive/smoke-test pass — flagged as Decision 5 above; can be added to remediation scope if the user wants it.
- Editing `docs/phases.md`'s still-outdated Phase 15 exit-criterion wording (flagged repeatedly in `STATE.md`, e.g. line 71/441) — unrelated to Phase 19, a separate small approved edit if the user wants it done.
- Phase 16 (WhatsApp) and Phase 17 (Razorpay) — remain explicitly deferred (D11).
