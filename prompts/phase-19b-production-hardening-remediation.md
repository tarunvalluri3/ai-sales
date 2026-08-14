# Phase 19b — Production hardening: remediation

## Goal
Every finding in `docs/phase-19-audit-findings.md` is closed: the one blocker, all 6 should-fix items, and all 5 nice-to-have items. Both items the audit left as open decisions are resolved with real evidence gathered during this prompt's own reconnaissance (not guessed at): the `knowledge_chunks` HNSW-index question is answered with live row counts, and the `npm test`/pgTAP question is answered by the user's explicit choice to run pgTAP against the live project via a custom runner, after this session confirmed live that Docker is unavailable here and that `supabase test db` is architecturally local-only.

## Current phase
Phase 19 — Production hardening (remediation stage, following the read-only Phase 19a audit). Confirmed from `STATE.md` §1.

## User request
"Phase 19b — remediate all findings from `docs/phase-19-audit-findings.md`. Scope: everything in that report — the blocker, all 6 should-fix items, and all 5 nice-to-have items. No gaps left open," with two explicit resolutions for the audit's open decisions (quoted in full below) and a specific fix description for every other finding. Full text preserved in this conversation; summarized per-item in "Implementation requirements" below. The user also explicitly chose, via a follow-up clarifying question this session asked before writing this prompt, **"Live project, custom runner"** for the pgTAP item: install pgTAP on the live Supabase project via a real migration, and write a custom test-runner script (since `supabase test db --linked` does not exist) that executes each numbered pgTAP file against the live database.

## Skills and docs read
- `docs/phase-19-audit-findings.md` (full) — every finding this prompt remediates.
- `AGENTS.md`, `docs/security.md`, `docs/prompt-template.md` — re-read for this prompt (same files Phase 19a read).
- `.claude/skills/supabase-postgres-best-practices/` — not re-read in full; the one new migration this prompt adds (pgTAP extension) is small enough that the existing project convention (extension goes in the `extensions` schema, migration applied and grants/behavior verified live) is sufficient without re-deriving general database guidance.
- Installed Next.js docs (per `CLAUDE.md`'s standing instruction to read `node_modules/next/dist/docs/` before writing code against this non-standard Next version), read live during this prompt's own preparation:
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md` — confirms `instrumentation.ts` at the repo root, exporting `register()`, is **stable since v15** (not experimental, no config flag needed), runs once per new server instance before it accepts requests, and works in both Node and Edge runtime (distinguishable via `process.env.NEXT_RUNTIME`).
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md` — confirms `export const maxDuration = <seconds>` in a route file is the current, idiomatic way to set a function's execution-time limit; Vercel reads it from the build output directly, no `vercel.json` needed for this.
  - `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md` — confirms `next.config.ts`'s `headers()` matches by explicit `source` path patterns with no built-in "exclude" syntax; the safe way to keep `/widget/embed` unrestricted is to scope framing-sensitive headers to an explicit allowlist of non-widget sources, not a single blanket `/:path*` rule.

## Existing code inspected
Every file this prompt touches was read in full during this session, not sampled:
- `lib/tools/request-callback.ts` (the blocker — lines 109-127's existing-lead update branch).
- `lib/lead-extraction.ts`, `lib/lead-capture.ts` (confirmed dead: `grep -r "captureLeadFromConversation\|from \"@/lib/lead-extraction\"" app/ lib/` returns zero call sites outside these two files themselves).
- `lib/conversations.ts` (its header comment at line 11 references `lib/lead-capture.ts` by path — will dangle once that file is deleted).
- `lib/tools/check-product-details.ts`, `lib/tools/check-faq-topic.ts` (the two unescaped `ILIKE` call sites).
- `lib/rate-limit.ts` (the `console.error` call site, line 30).
- `lib/http/widget-cors.ts` (`extractIp()`, lines 40-44).
- `lib/embeddings.ts` (the existing `EMBEDDING_DIMENSION` module-level-throw pattern this prompt's new `lib/env.ts` follows).
- `lib/logger.ts` (the `logEvent()` contract the rate-limit fix must use).
- `next.config.ts` (currently just `{ devIndicators: false }`).
- `app/api/chat/route.ts` (the route needing `maxDuration`; confirmed its worst case is up to two tool-calling model invocations plus one final structured-output invocation — three-to-four sequential Gemini round trips per request).
- `package.json` (no `test` script; `supabase` `^2.113.0` already a devDependency).
- `supabase/tests/database/000_setup.sql` and all 11 numbered pgTAP files (read to confirm every numbered file wraps its fixture data in `begin;`/`rollback;`; `000_setup.sql` only ever does `create extension if not exists pgtap with schema extensions;`, nothing else).
- `supabase/migrations/20260812161845_enable_pgvector_extension.sql` — the existing precedent this prompt's new pgTAP migration follows (`create extension ... with schema extensions`).
- `supabase/config.toml` — confirmed no Docker-specific config blocks this; the blocker is environmental (no Docker binary here), not project configuration.

## Relevant existing architecture
- `lib/errors.ts`'s `AppError`/`logAndGetUserMessage()` convention for user-facing errors; `lib/logger.ts`'s `logEvent()` convention for discrete business/infra events (closed `LogMetadata` type — identifiers/counts/enum strings only, never free text or raw IPs, per `STATE.md`'s explicit "the ip-scope rejection logs `businessId: "unknown"`... since the IP... must never appear in a log line" precedent).
- `lib/embeddings.ts:84-91`'s `EMBEDDING_DIMENSION` constant — the one existing module-level-throw-at-import pattern in this codebase, the direct model for this prompt's `lib/env.ts`.
- Every mutation elsewhere in `lib/` pairs an `id` filter with an explicit `business_id` filter and (where the caller needs to know whether anything was actually affected) a `.select("id")` + affected-row-count check — `lib/leads.ts`'s `updateLeadStatus()` and `lib/conversations.ts`'s `setConversationControl()`/`dismissConversationAttention()` are the exact contract the blocker fix must match.
- Migrations are the schema source of truth (`AGENTS.md` §2); every migration that creates a privileged object is applied and its actual live grants/behavior confirmed, not assumed from the migration file alone (a standing lesson from the Phase 3 "tighten grants" and Phase 6 "partial unique index" incidents recorded in `STATE.md`).
- `docs/security.md` §4: rate limiting is enforced per key/IP/conversation via a Postgres counter table and an atomic RPC, `service_role`-only.

## Decisions and assumptions

1. **pgTAP live-runner risk gate.** Because `supabase db query --file` has never been used in this project to execute a multi-statement `begin;...rollback;` pgTAP block, and because it is not confirmed whether the CLI preserves one Postgres connection/session across all statements in a `--file` invocation (required for `begin`/`rollback` to actually bound a single transaction) or executes them as separate requests (which would break that guarantee), the implementation step for this item is order-gated: install the extension migration first, then run **exactly one** test file (`001_businesses_tenant_isolation.sql`) manually and directly verify via a follow-up read-only query that its fixture rows (`clerk_org_id` values `'org_a'`/`'org_b'`, fixed UUIDs `00000000-0000-0000-0000-00000000000a`/`...b`) do **not** persist in the live `businesses` table afterward. Only once that is confirmed does the implementation proceed to build the runner script and run the remaining 10 files. If rollback does *not* hold, stop, manually delete the two fixture rows by their fixed UUIDs (`delete from businesses where id in ('00000000-0000-0000-0000-00000000000a', '...b');`), and report back rather than proceeding — this would mean the live-project mechanism needs a different design (e.g. a single persistent `pg` connection script instead of one `supabase db query --file` invocation per file) before any further test file is run against the live project.
2. **The exact JSON shape `supabase db query --linked --file` returns for a pgTAP `finish()` result is not assumed.** This session confirmed the general envelope shape (`{ boundary, rows, warning }`) only for a plain `select`; the actual TAP output rows/columns for a `finish()` call are unconfirmed. The runner script's output parser must be written against the real, observed output from running file `001` live (per Decision 1), not against a guessed schema — consistent with this project's "confirm live, don't guess" discipline (the D3/Phase 7 precedent in `STATE.md`).
3. **`000_setup.sql` is deleted, not kept as a redundant belt-and-suspenders file.** Once the new migration installs `pgtap` as part of the schema (applied to both the live project and replayed into any future local `supabase start` stack), a second, separate "run this file first" convention for the same one-line `create extension if not exists` is a duplicate source of truth for no real benefit — this project's own convention is migrations own schema, not test fixtures.
4. **`knowledge_chunks` HNSW index stays deferred, not added.** This prompt's own live reconnaissance (`select business_id, count(*) from knowledge_chunks group by business_id order by 2 desc;` via `supabase db query --linked`, run during this prompt's preparation) returned exactly one row: one `business_id` with `count: 5`, nothing else. Five rows is nowhere near a volume where a sequential scan stops being trivially fast — Phase 7's original "create the index when data volume justifies it, not reflexively" criterion is not met. No migration is added for this item; the finding is closed by recording the real numbers, per the user's own stated resolution.
5. **Security headers are scoped to an explicit allowlist of non-widget, non-API sources**, not a blanket `/:path*` rule with an attempted negative-lookahead exclusion — Next.js's `headers()` `source` matching has no built-in "everything except X" syntax (confirmed against the installed docs), so the safe, explicit approach is to only apply framing-sensitive headers (`X-Frame-Options`) to the known dashboard/marketing/auth route groups, and apply the framing-neutral headers (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) everywhere including `/widget/embed` and `/api/*`, since none of those three affect iframe embedding.
6. **No `vercel.json` is added.** The one concrete, justified setting this remediation identified — `/api/chat`'s potential multi-Gemini-call execution time exceeding a default serverless function timeout — has an idiomatic, more precise Next.js mechanism (`export const maxDuration` in the route file itself, confirmed current against the installed docs) that Vercel reads directly from the build output. Per the user's own stated criterion ("add one only if there's a concrete, justified setting it needs to express beyond Next.js defaults"), this setting is expressed by Next.js's own route segment config, not `vercel.json` — so the criterion is not met, and the file is not added. `maxDuration = 60` is used for `app/api/chat/route.ts` (safe under Vercel's Hobby-tier ceiling, well above the realistic worst case of a handful of sequential Gemini calls).
7. **`extractIp()`'s fix stays comment-only, no behavior change**, per the audit's own framing of this as a nice-to-have "worth a one-line comment now." Vercel is the named deployment target and sets `x-forwarded-for` at its edge in a way the app cannot spoof around; there is no trustworthy alternative signal to fail over to without new infrastructure, so a functional guard would either do nothing differently on Vercel or break IP resolution entirely off it. The fix is a doc comment stating the trust assumption explicitly, so a future deploy to a different host is not silently vulnerable to the gap the audit described.
8. **`lib/rate-limit.ts`'s `logEvent()` call omits the raw `identifier`** (IP/widget key/conversation id) from its metadata, even though `LogMetadata` would technically allow a string there — matching the existing, deliberate precedent in `app/api/chat/route.ts` of logging `businessId: "unknown"` rather than a raw IP for the `ip` scope. Since this one call site is shared across all five rate-limit scopes (including `ip`/`poll_ip`), and it has no way to know which scope it's being called for without checking, the simplest safe rule is to never log the identifier here at all — only `scope`.
9. **`lib/schemas/lead.ts` is not touched.** It is still a live dependency of `lib/leads.ts`'s `createLead()` (via the `LeadPersistInput` type) and `lib/tools/request-callback.ts` (via `normalizeEmail`/`normalizePhone`) — only `lib/lead-extraction.ts` and `lib/lead-capture.ts` are dead.

## Open decisions this depends on
None open in `STATE.md` §4. Both items the audit itself flagged as needing a decision (pgTAP mechanism, HNSW threshold) are resolved above, by the user's explicit direction and this prompt's own live reconnaissance respectively — not deferred further.

## Dependencies / packages required
None added or removed. `supabase` (`^2.113.0`) is already a devDependency and already authenticated/linked in this environment (`supabase link` was already run against project ref `bykeztxvejpwfcxgsubm`, confirmed via `supabase projects list`). The new test runner (`scripts/run-pgtap-tests.mjs`) uses only Node built-ins (`node:child_process`, `node:fs`, `node:path`) plus shelling out to the already-installed `supabase` CLI — no new package.

## Files likely to change

**Created:**
- `lib/env.ts` — startup env var validation.
- `instrumentation.ts` (repo root) — calls `lib/env.ts` at server-instance startup.
- `lib/sql-escape.ts` — `escapeLikePattern()` helper.
- `scripts/run-pgtap-tests.mjs` — the live pgTAP test runner.
- `supabase/migrations/<timestamp>_enable_pgtap_extension.sql`.

**Modified:**
- `lib/tools/request-callback.ts` (blocker fix).
- `lib/tools/check-product-details.ts`, `lib/tools/check-faq-topic.ts` (wildcard escaping).
- `lib/rate-limit.ts` (`console.error` → `logEvent()`).
- `lib/http/widget-cors.ts` (`extractIp()` comment).
- `lib/conversations.ts` (drop the stale `lib/lead-capture.ts` reference in its header comment).
- `next.config.ts` (security headers).
- `app/api/chat/route.ts` (`export const maxDuration = 60`).
- `package.json` (`"test"` script).
- `docs/architecture.md` (document: env-validation convention, security-header convention, pgTAP/testing convention).
- `STATE.md` (final step).

**Deleted:**
- `lib/lead-extraction.ts`, `lib/lead-capture.ts`.
- `supabase/tests/database/000_setup.sql`.

## Database changes

One migration, following the exact precedent of `supabase/migrations/20260812161845_enable_pgvector_extension.sql`:

```sql
-- supabase/migrations/<timestamp>_enable_pgtap_extension.sql
create extension if not exists pgtap with schema extensions;
```

Apply via `supabase db push` (or the project's existing applied-migration workflow) against the linked live project, then **verify live**, matching this project's standing migration-verification standard (`AGENTS.md`/`STATE.md` precedent — never assume a migration's effect from the file alone):
- `select installed_version from pg_available_extensions where name = 'pgtap';` returns non-null.
- Confirm the extension's functions are not unexpectedly reachable by `anon`/`authenticated` beyond what `pgtap`'s own default install grants (pgTAP's functions are ordinary functions in the `extensions` schema; this project's existing `default_privileges_revoke_execute_functions_anon_authenticated` migration already revokes default `EXECUTE` from those roles for new functions in `public`, but `pgtap`'s functions live in `extensions`, not `public` — confirm live whether that revoke migration's scope covers `extensions` too, and if not, whether that's an acceptable gap given `anon`/`authenticated` already have no way to reach arbitrary SQL functions through the Data API for functions outside `public`'s exposed schema list, per `supabase/config.toml`'s `api.schemas = ["public", "graphql_public"]`).

No other schema change. The `knowledge_chunks` HNSW index is explicitly **not** added (Decision 4).

## Server / client boundaries
- `lib/env.ts`, `instrumentation.ts`, `scripts/run-pgtap-tests.mjs` all read/require server-only secrets (`CLERK_SECRET_KEY`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`) or the Supabase CLI's own authenticated session — none of this reaches a client bundle. `lib/env.ts` gets the standard `import "server-only";` guard; `instrumentation.ts` and `scripts/run-pgtap-tests.mjs` are outside `lib/`'s normal `server-only` convention by their very nature (a Next.js lifecycle file and a standalone Node script respectively, neither ever bundled for the client), so they're exempt from that specific guard the same way `next.config.ts` already is.
- `lib/sql-escape.ts` is a pure string function with no secret and no side effect — no `server-only` guard needed (nothing unsafe about it reaching a client bundle, though nothing currently imports it there either).
- Security headers in `next.config.ts` are response headers, not client-visible source — no boundary concern.

## Implementation requirements

1. **Blocker — `lib/tools/request-callback.ts`'s existing-lead update.** Change the `if (existing)` branch's `update()` call to add `.eq("business_id", businessId)` alongside the existing `.eq("id", existing.id)`, add `.select("id")`, and check the returned row count — mirroring `lib/leads.ts`'s `updateLeadStatus()` contract exactly. If zero rows are affected (should not happen given `existing` was itself resolved via a `business_id`-scoped lookup moments earlier, but treat it the same as every sibling function does), log `logEvent("tool_invoked", businessId, { tool: "request_callback", conversationId, result: "update_affected_zero_rows" }, "error")` and return `{ success: false, reason: "lookup_failed" }` instead of the current unconditional success return.

2. **Remove dead code.** Delete `lib/lead-extraction.ts` and `lib/lead-capture.ts` entirely. Update `lib/conversations.ts`'s header comment (currently references "the dashboard path (lib/lead-capture.ts)") to remove the dangling reference — reword to describe the two real callers (the Clerk-authenticated dashboard path and the service-role widget path) without naming a file that no longer exists.

3. **Security headers — `next.config.ts`.** Add a `headers()` async function:
   - Apply `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()` to `source: "/:path*"` (safe everywhere, including `/widget/embed` and `/api/*` — none of these three affect framing or JSON responses).
   - Apply `X-Frame-Options: DENY` **only** to an explicit allowlist of sources that must never be framed: `/`, `/dashboard/:path*`, `/onboarding/:path*`, `/session-tasks/:path*`, `/sign-in/:path*`, `/sign-up/:path*`. Do **not** add `X-Frame-Options` to `/widget/embed` (must remain iframe-able by design) or to `/api/:path*` (JSON responses, framing is moot, and `/api/chat`'s own `withCors()` already manages its response headers).
   - Confirm live (via a dev-server request, e.g. `curl -I http://localhost:3000/dashboard` vs. `curl -I http://localhost:3000/widget/embed`) that the dashboard response carries `X-Frame-Options: DENY` and the widget response does not, before treating this item as done.

4. **`app/api/chat/route.ts` — `maxDuration`.** Add `export const maxDuration = 60;` near the top of the file (route segment config), with a one-line comment explaining why (up to ~3-4 sequential Gemini calls per request: tool-calling loop iterations plus the final structured-output call).

5. **Startup env var validation.** Create `lib/env.ts`:
   - `import "server-only";`
   - A Zod object schema validating every var in `STATE.md` §5's currently-required set as present and non-empty: `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `GEMINI_CHAT_MODEL`, `GEMINI_EMBEDDING_MODEL`, `GEMINI_EMBEDDING_DIMENSION` (this last one additionally checked as a string of digits).
   - `envSchema.safeParse(process.env)` at module load; on failure, `throw new Error(...)` listing every failing field and pointing at `.env.example`/`docs/security.md` §5 — module-level, so importing this file is itself the validation trigger, same shape as `lib/embeddings.ts`'s existing `EMBEDDING_DIMENSION` pattern.
   - Export the parsed result (e.g. `export const env = parsed.data;`) even though nothing currently consumes it — the validation side effect is the point; do not refactor `lib/embeddings.ts`, `lib/rag.ts`, or the Supabase client modules to read from this export instead of `process.env.X!` directly, since that's a larger refactor outside this prompt's approved scope (they'll simply have already been validated by the time they run, because `instrumentation.ts` runs first).
   - Create `instrumentation.ts` at the repo root: `export async function register() { if (process.env.NEXT_RUNTIME === "edge") return; await import("@/lib/env"); }` — guarded to Node runtime only, since `proxy.ts`'s edge-runtime `clerkMiddleware()` never touches these server secrets and Edge Runtime cannot read them the same way.
   - Verify live: temporarily rename/unset one required var, confirm `npm run dev` (or `next start`) fails fast at boot with the new module's clear error message rather than at first request, then restore the var and confirm normal startup.

6. **Escape `ILIKE` wildcards.** Create `lib/sql-escape.ts` exporting `escapeLikePattern(value: string): string` that escapes `\`, `%`, and `_` (backslash-escape each, backslash first so it doesn't double-escape the others). Apply it in:
   - `lib/tools/check-product-details.ts`: `.ilike("name", escapeLikePattern(query))` (both the `products` and `services` lookups) — this call has no surrounding `%`, so escaping alone fixes a literal `%`/`_` in a real product name being misread as a wildcard.
   - `lib/tools/check-faq-topic.ts`: `` .ilike("question", `%${escapeLikePattern(topic)}%`) `` — escape the interpolated value before wrapping it in the intentional substring wildcards.

7. **`lib/rate-limit.ts` logging.** Replace `console.error("checkAndIncrementRateLimit failed", error)` with `logEvent("rate_limit_check_failed", "unknown", { scope }, "error")`, per Decision 8 (never log the raw `identifier`). Import `logEvent` from `@/lib/logger`.

8. **`lib/http/widget-cors.ts` — `extractIp()`.** Add a doc comment above the function stating explicitly: this trusts `x-forwarded-for` as set by the deployment platform's own edge (Vercel, the named target per `AGENTS.md` §2); it is only a trustworthy rate-limiting signal when actually deployed behind a platform that sets/overwrites this header itself, and must not be relied on for real abuse protection if this app is ever self-hosted or run behind an untrusted/no reverse proxy without re-checking this assumption. No functional change (Decision 7).

9. **pgTAP live wiring — the higher-scrutiny item.**
   a. Add and apply the migration from "Database changes" above; verify live as specified there.
   b. Delete `supabase/tests/database/000_setup.sql`.
   c. Manually run `npx supabase db query --linked --file supabase/tests/database/001_businesses_tenant_isolation.sql` once, by hand, and inspect the real returned output (JSON shape, TAP content). Immediately follow with a read-only `select id, clerk_org_id from businesses where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');` — this must return zero rows, proving the transaction actually rolled back. **If it returns any row, stop, manually delete those two rows by id, and report back per Decision 1 rather than continuing to build the runner.**
   d. Only after (c) passes cleanly: write `scripts/run-pgtap-tests.mjs` — enumerates `supabase/tests/database/*.sql` (all 11 remaining numbered files, sorted), runs each via `npx supabase db query --linked --file <path>` (using `node:child_process`'s `execFileSync` or equivalent, capturing stdout/stderr and exit code), parses each result for pgTAP failure markers (the literal substring `"not ok"` in the output, plus a nonzero process exit code or a JSON-parse failure counted as a hard failure) — using the real, observed output shape from step (c), not a guess. Prints a per-file `PASS`/`FAIL` line and a final summary; exits process code `1` if any file failed or errored, `0` if all passed.
   e. Wire `"test": "node scripts/run-pgtap-tests.mjs"` into `package.json`'s `scripts`.
   f. Run `npm test` for real, for all 11 files, and report the actual pass/fail outcome for each — do not claim this step succeeded without the real run's output.
   g. Document in `docs/architecture.md` (new short "Testing" section) and in the report to the user: `npm test` requires the `supabase` CLI to already be authenticated (`supabase login`) and linked (`supabase link`) to the target project — it is not currently CI-portable without also documenting/setting up a `SUPABASE_ACCESS_TOKEN`-based non-interactive auth path, which is out of scope for this prompt (no CI exists yet for this project). State this limitation plainly rather than implying `npm test` is turnkey-portable.
   h. Every test file execution is a real transaction against the live, in-use Supabase project (the same one holding real accumulated data from Phase 15b/18's live testing) — not a disposable local copy. This is the tradeoff the user explicitly chose; do not silently soften it into a local-only implementation instead.

10. **`docs/architecture.md` updates.** Add short sections (or extend existing ones) documenting: the env-validation convention (`lib/env.ts` + `instrumentation.ts`, checked at server startup, modeled on the pre-existing `lib/embeddings.ts` pattern); the security-header convention in `next.config.ts` (framing-neutral headers everywhere, `X-Frame-Options` on an explicit non-widget allowlist only — and *why* `/widget/embed` is excluded, so a future header change doesn't accidentally break the widget); the testing convention (`npm test` runs pgTAP against the **live** linked project, not a local stack — with the CLI-auth prerequisite from 9g).

## Security requirements
- The blocker fix directly satisfies `docs/security.md` §1 ("every mutation... tenant-scoped in the query itself") and `AGENTS.md` §3 Rule 1.
- The pgTAP migration and its live grant/behavior verification follow `docs/security.md` §3's database conventions; confirm the new extension's functions don't become reachable through the Data API to `anon`/`authenticated` in a way that violates `docs/security.md` §3's least-privilege default (per Implementation Requirement 9a's grant check).
- Security headers must not weaken `docs/security.md` §4's public-widget model — `X-Frame-Options` must never apply to `/widget/embed`, confirmed live per Implementation Requirement 3's own verification step, since that would silently break the entire embed mechanism `docs/security.md` §4 depends on.
- `lib/env.ts` must never log or throw the *value* of a secret env var — only the *name* of a missing/invalid one, matching `docs/security.md` §6.
- The `lib/rate-limit.ts` logging change must not introduce a raw IP or widget key into a log line, per the existing precedent `docs/security.md` §10/`STATE.md` already established.

## Error handling
- `lib/env.ts`'s validation failure is a hard `throw` at startup — intentionally fatal, not caught/recovered, since a missing required secret should stop the server from ever accepting a request rather than fail unpredictably mid-request.
- `scripts/run-pgtap-tests.mjs` must not throw uncaught on a single file's failure — it should record that file as failed, continue to the remaining files, and only exit non-zero after attempting all of them, so one bad file doesn't hide the results of the other ten.
- `lib/tools/request-callback.ts`'s new zero-affected-rows branch returns the existing `{ success: false, reason: "lookup_failed" }` shape — no new error type, consistent with the function's existing never-throws contract.

## Acceptance criteria
- [ ] `lib/tools/request-callback.ts`'s existing-lead update includes `.eq("business_id", businessId)` and checks the affected-row count.
- [ ] `lib/lead-extraction.ts` and `lib/lead-capture.ts` no longer exist; no remaining import or comment reference to either anywhere in the repo.
- [ ] `next.config.ts` sets the three framing-neutral headers everywhere and `X-Frame-Options: DENY` only on the explicit non-widget allowlist; confirmed live that `/dashboard` carries it and `/widget/embed` does not.
- [ ] `app/api/chat/route.ts` exports `maxDuration = 60`.
- [ ] `lib/env.ts` + `instrumentation.ts` exist; confirmed live that removing a required env var causes a fast, clear startup failure, not a first-request failure.
- [ ] `lib/sql-escape.ts`'s `escapeLikePattern()` is used in both `check-product-details.ts` and `check-faq-topic.ts`.
- [ ] `lib/rate-limit.ts` uses `logEvent()`, not `console.error`, and never logs the raw identifier.
- [ ] `lib/http/widget-cors.ts`'s `extractIp()` has the trust-assumption comment; no functional change.
- [ ] The pgTAP extension migration is applied to the live project and its grants/behavior confirmed live (Implementation Requirement 9a).
- [ ] `supabase/tests/database/000_setup.sql` is deleted.
- [ ] The rollback-safety check (Implementation Requirement 9c) was actually run, with its real result reported — not assumed.
- [ ] `scripts/run-pgtap-tests.mjs` exists, `npm test` is wired to it, and it was actually run against all 11 live test files with real pass/fail results reported per file.
- [ ] `docs/phase-19-audit-findings.md`'s 12 findings (excluding the two the user resolved directly, which this prompt closes via Decisions 1-4 and Implementation Requirement 9) are each traceable to a specific change above.
- [ ] `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.
- [ ] `STATE.md` is updated recording this remediation's completion, the live pgTAP run's real results, and the `knowledge_chunks` numbers.

## Automated checks
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npm test` (the newly-wired pgTAP runner — this *is* the tenant-isolation test suite for this phase; no separate new tenant-isolation test is needed since this prompt's only new business logic is the request-callback blocker fix, which the existing pgTAP suite does not specifically cover — note this as a known gap if it remains true, rather than silently skipping it)

## Manual testing steps
1. **Blocker fix:** with a real conversation that already has a lead row (e.g. from a prior `request_callback` call), trigger `request_callback` again via the live widget with different contact info; confirm the lead updates (not duplicates) and confirm directly in the database that the update's `WHERE` clause now includes `business_id` (inspect the generated query or add a temporary log if needed, then remove it).
2. **Security headers:** `curl -I` (or a browser devtools Network tab) against `/`, `/dashboard`, and `/widget/embed` on the dev server; confirm `X-Frame-Options: DENY` on the first two, absent on the third; confirm the widget still actually loads and functions inside `public/test-widget.html`'s iframe (a real regression check, not just a header check).
3. **`maxDuration`:** no direct manual test possible locally (this is a platform-level limit that only matters on Vercel); confirmed by code review and the build succeeding with the export present.
4. **Env validation:** temporarily blank `GEMINI_API_KEY` in `.env.local`, run `npm run dev`, confirm the server fails to start with a clear message naming the missing variable (not a vague crash on first chat message); restore the value, confirm normal startup.
5. **ILIKE escaping:** create a test product named literally `50% Off Bundle`, ask the widget "what's the price on 50% Off Bundle", confirm `check_product_details` finds it correctly (previously, the literal `%` would have been read as a wildcard).
6. **pgTAP live run:** the actual `npm test` output, showing all 11 files' real pass/fail results — this **is** the manual/automated test for this item; report it verbatim.
7. **Dead code removal:** `npm run build` succeeding is sufficient confirmation nothing else referenced the deleted files (a stale import would fail the build).

## Out of scope
- Any further findings beyond the 12 in `docs/phase-19-audit-findings.md` — this prompt closes exactly that list, nothing more.
- Refactoring `lib/embeddings.ts`, `lib/rag.ts`, or the Supabase client modules to consume `lib/env.ts`'s exported `env` object instead of `process.env.X!` directly (Decision 5's own note) — a larger, unrequested refactor.
- Setting up CI or a `SUPABASE_ACCESS_TOKEN`-based non-interactive auth path for `npm test` — documented as a known limitation (Implementation Requirement 9g), not built.
- Adding the `knowledge_chunks` HNSW index — explicitly not needed per Decision 4's live numbers.
- Adding `vercel.json` — explicitly not needed per Decision 6.
- Any change to `lib/schemas/lead.ts`, `lib/leads.ts`, or the `request_callback` tool's consent-gating logic beyond the one blocker fix.
- A full live-browser accessibility/responsive pass (the audit's §13 finding was about audit *coverage*, not a code defect — nothing to remediate there beyond what's already noted as a limitation).
