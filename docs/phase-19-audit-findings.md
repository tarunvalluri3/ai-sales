# Phase 19 audit findings

Produced by `prompts/phase-19a-production-hardening-audit.md`, 2026-08-14. Read-only audit — no application code, configuration, or database state was changed while producing this report. Each finding is tagged `blocker` / `should-fix` / `nice-to-have` and cites an exact file/line or migration. Sections 1–9 (security-adjacent) cross-reference the relevant `docs/security.md` section.

This codebase is in materially good shape — 18 phases of disciplined tenant-scoped data access, defense-in-depth RLS, and per-phase manual verification have left very few real gaps. Most findings here are `should-fix`/`nice-to-have` polish, not structural problems. There is exactly one finding rated `blocker`.

---

## 1. Security / tenant isolation review (`docs/security.md` §1)

Every business-owned table (`products`, `services`, `faqs`, `knowledge_documents`, `knowledge_chunks`, `conversations`, `messages`, `leads`) carries `business_id` with a foreign key to `businesses`, and every read/write function in `lib/products.ts`, `lib/services.ts`, `lib/faqs.ts`, `lib/knowledge.ts`, `lib/knowledge-sync.ts`, `lib/conversations.ts`, `lib/messages.ts`, `lib/leads.ts`, and `lib/analytics.ts` filters by `business_id` at the query level (verified by direct inspection, not sampling — every `.from(...)` call site in `lib/` was read). No function relies on post-fetch application filtering.

- **[blocker] `lib/tools/request-callback.ts:109-119` — the existing-lead update path is missing its `business_id` filter.** `executeRequestCallback()`'s "update an existing lead" branch runs `supabase.from("leads").update({...}).eq("id", existing.id)` with no accompanying `.eq("business_id", businessId)`. Every other mutation in this codebase (`updateLeadStatus`, `setConversationControl`, `dismissConversationAttention`, `flagConversationNeedsAttention`, and this same file's own insert branch) pairs an `id` filter with an explicit `business_id` filter, per `docs/security.md` §1 ("every mutation... tenant-scoped in the query itself") and `AGENTS.md` §3 Rule 1 ("no exceptions"). This function runs on the widget's **service-role client**, which bypasses RLS entirely (`lib/supabase/service.ts`) — so the `business_id`/`id` pair in the query is the *only* tenant boundary on this statement, not defense-in-depth on top of RLS. Not currently exploitable in practice: `existing.id` is only ever the id returned from a `business_id`-scoped `select` performed two statements earlier in the same synchronous function body (line 94-99), so a cross-tenant `id` cannot actually reach this `update()` today. Rated `blocker` rather than `should-fix` because it is a literal violation of the stated non-negotiable rule and the one write path in this codebase's tool system that doesn't follow the project's own established defense-in-depth convention — a future refactor that reorders these two statements, or reuses `existing.id` from a different source, would turn this into a real cross-tenant write with no test currently guarding against it. Fix: add `.eq("business_id", businessId)` to the `update()` call (and ideally `.select("id")` + check the affected-row count, matching every sibling function's contract).

- **[nice-to-have] `lib/tools/check-faq-topic.ts:61` — unescaped user-influenced text inside an `ILIKE` pattern.** `ilike("question", \`%${topic}%\`)` interpolates the AI tool-call argument `topic` (ultimately derived from prospect wording) directly into a wildcard pattern with no escaping of literal `%`/`_` characters. This is not a SQL-injection risk (PostgREST parameterizes the value), and it stays `business_id`-scoped, so it is not a tenant-isolation gap — but a prospect message containing `%` or `_` can produce unintended broader/narrower matches than the topic they actually typed, which is a correctness rather than security issue. `lib/tools/check-product-details.ts:63/80`'s `ilike("name", query)` has the same property (no wildcard escaping), though there `query` is meant to be an exact product/service name so the practical blast radius is smaller.

No other cross-tenant read/write gap was found. `docs/security.md` §11's checklist item "a test proves cross-tenant reads and writes fail" is satisfied historically by each phase's own manual/live verification (recorded in `STATE.md` §2) rather than by an automated test suite — see Finding 9.1 below.

## 2. Auth review (`docs/security.md` §2)

`lib/auth.ts`'s `requireAuthContext()` wraps `auth.protect()`, and `lib/business-context.ts`'s `requireBusinessContext()` layers business resolution on top. Every dashboard page (`app/(dashboard)/dashboard/**/page.tsx`, including the four `[id]/edit` pages), every Server Action file (`app/(dashboard)/dashboard/**/actions.ts`, 10/10), and `app/(dashboard)/onboarding/page.tsx`/`actions.ts` call one of these two helpers — confirmed by an exhaustive grep across `app/`, not a sample. `app/api/chat/route.ts` and `app/api/chat/poll/route.ts` deliberately never call either (the one intentionally public path, per `docs/security.md` §4) and instead route through `resolveBusinessFromWidgetKey()`.

- No gap found. Every protected surface independently validates identity server-side, matching §2's explicit warning about not trusting `proxy.ts` alone.

## 3. Secrets review (`docs/security.md` §5, §6)

Grepped for `SUPABASE_SECRET_KEY`, `CLERK_SECRET_KEY`, and `GEMINI_API_KEY` across the whole repository (excluding `node_modules`). Real usage is confined to `lib/supabase/service.ts:16`, `lib/rag.ts:137`, and `lib/embeddings.ts:95` — all `server-only`-guarded modules. The only other hits are documentation/prompt files (`STATE.md`, `docs/*.md`, `prompts/*.md`) referencing the variable names, not values, plus unrelated third-party skill docs under `.agents/skills/`. `public/widget-loader.js` (the one file that ships to the browser as-is) carries no secret — only the intentionally-public `widget-key` value, matching its own header comment. No `NEXT_PUBLIC_*` variable holds a secret; `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are the only `NEXT_PUBLIC_*` vars in use, both correctly client-safe per `docs/security.md` §5's table. `.env.example` and `STATE.md` §5 agree on the required set with no drift.

- No gap found.

## 4. Validation review (`docs/security.md` §7, §8)

Both public route handlers (`app/api/chat/route.ts:43-47`, `app/api/chat/poll/route.ts:31-35`) Zod-validate their full request body before touching anything else. All three tool executors (`lib/tools/check-product-details.ts`, `lib/tools/check-faq-topic.ts`, `lib/tools/request-callback.ts`) re-validate `rawArgs` against a narrow schema even though `bindTools()` already constrains what the model can send — explicit defense in depth, matching `docs/security.md` §8. Every Server Action that accepts `FormData` (products/services/faqs/knowledge/profile/widget-settings) parses through a Zod schema in `lib/schemas/`.

- **[nice-to-have]** See Finding 1's second bullet — the two `ILIKE` tool inputs are schema-validated (length/type) but not further sanitized for SQL wildcard metacharacters before use in a pattern.

## 5. Error handling review (`docs/security.md` §10)

`lib/errors.ts`'s `AppError`/`logAndGetUserMessage()` convention is used consistently in every `lib/` data-access function and both route handlers — every user-facing catch branch in `app/api/chat/route.ts` and `app/api/chat/poll/route.ts` routes through `logAndGetUserMessage()`, never surfacing a raw error/stack trace. No raw database error string or stack trace was found reaching a client response in any grepped route handler or Server Action.

- No gap found.

## 6. Rate limiting and abuse review (`docs/security.md` §4)

`app/api/chat/route.ts` enforces `ip` (30/5min), `key` (120/5min), and `conversation` (20/5min) scopes; `app/api/chat/poll/route.ts` enforces `poll_ip` (300/5min) and `poll_conversation` (100/5min), sized separately per resolved decision D8/`prompts/phase-15b-staff-reply-and-live-polling.md`. `increment_rate_limit_counter()`'s `EXECUTE` grant is restricted to `service_role` only (`supabase/migrations/20260813130015_create_increment_rate_limit_counter_function.sql`), confirmed unchanged since creation. `checkAndIncrementRateLimit()` fails closed on an infra error (`lib/rate-limit.ts:27-32`, returns `false` rather than silently allowing the request through).

- **[nice-to-have] `lib/http/widget-cors.ts:40-44` — `extractIp()` trusts `x-forwarded-for` unconditionally, with no trusted-proxy allowlist.** On Vercel (the named deployment target, `AGENTS.md` §2) this header is set by Vercel's own edge and is not attacker-controllable end-to-end, so this is low-risk *in the intended deployment environment specifically*. It becomes a real rate-limit-bypass vector (spoof the header, get a fresh IP-scope bucket every request) if this app is ever run behind a different/no reverse proxy, or self-hosted directly. Worth a one-line comment now, and worth re-checking once Phase 19's deployment-configuration work actually locks in Vercel.
- **[nice-to-have]** `checkAndIncrementRateLimit()`'s failure branch logs via `console.error` (`lib/rate-limit.ts:30`) rather than `logEvent()` — see Finding 12.

## 7. Database indexes review

Every business-owned table has an explicit `business_id` index: `products_business_id_idx`, `services_business_id_idx`, `faqs_business_id_idx`, `knowledge_documents_business_id_idx`, `knowledge_chunks_business_id_idx`, `conversations_business_id_idx`, `leads_business_id_idx` (plus `leads_conversation_id_idx`). `messages` uses a composite `messages_business_conversation_created_idx (business_id, conversation_id, created_at)` matching its actual hot-query shape (`listRecentMessages`/`listMessagesForConversation`/`listMessagesForConversationAfter` all filter+order on exactly this triple). `conversations` additionally has the Phase 15a partial index `conversations_business_needs_attention_idx` (`supabase/migrations/20260814074411_add_conversation_control_and_attention.sql`), matching `countConversationsNeedingAttention()`'s exact query shape.

- No gap found.

**`docs/security.md` cross-reference:** no dedicated indexes section exists there; closest is §3's general database guidance ("indexes... predictable queries"), which this section satisfies.

## 8. Vector query performance review

`match_knowledge_chunks()` (`supabase/migrations/20260812161850_create_match_knowledge_chunks_function.sql`) is `security invoker`, filters by `p_business_id` before the `order by ... <=> ...` similarity sort (never a global scan), and operates over `vector(1536)` — consistent with resolved decision D3. The commented-out HNSW index at `supabase/migrations/20260812161847_add_embedding_to_knowledge_chunks.sql:24` remains commented out, per Phase 7's explicit "create the index when data volume justifies it, not reflexively" deferral.

- **[should-fix, needs a live check] Actual current `knowledge_chunks` row count per business, and an `EXPLAIN` of `match_knowledge_chunks()` against it, were not obtained during this audit** — this session did not have a live Supabase connection open (only the static migration/function SQL was read). Given ~19 phases of real usage and live-testing data already accumulated (e.g. Phase 18's verified evidence cites 159 real conversations for one test business), it is plausible the original "not yet justified" threshold has been crossed for at least one business. Recommend running `select business_id, count(*) from knowledge_chunks group by business_id order by 2 desc;` and `explain analyze select ... from match_knowledge_chunks(...)` for the largest business as the first step of any Phase 19 remediation prompt that touches this area, rather than deciding blind.

**`docs/security.md` cross-reference:** closest is §9's "never a global similarity search" (satisfied — see above) and §3's general database guidance; there is no dedicated vector-performance section.

## 9. Build checks review

Actual output, run during this audit session:

```
$ npm run lint
> ai-sales@0.1.0 lint
> eslint
(no output — zero errors, zero warnings)

$ npx tsc --noEmit
(no output — zero errors)

$ npm run build
> ai-sales@0.1.0 build
> next build
▲ Next.js 16.3.0 (Turbopack)
✓ Compiled successfully in 2.2s
✓ Generating static pages using 15 workers (20/20) in 731ms
Route (app): 24 routes listed, all present including /dashboard/analytics, /widget/embed, /api/chat, /api/chat/poll, /api/health
```

- **[should-fix] `package.json`'s `scripts` has no `test` entry.** `AGENTS.md` §7 lists `npm test` as a required check "once tests exist," and pgTAP files exist under `supabase/tests/database/` (8 files, one per business-owned table introduced since Phase 3) but have never been executed by any automated command — `STATE.md`'s per-phase entries repeatedly record this as a standing, acknowledged gap, "superseded in practice by manual/live cross-tenant verification each phase." That manual-verification safety net is real and well-documented, but it does not survive a future change the way an automated `supabase test db` run in CI would. Whether to wire up an automated pgTAP runner (and whether that belongs to Phase 19 or is out of scope) is a decision for the remediation prompt, not this audit — flagging it here per the audit prompt's own acceptance criteria.

## 10. Deployment configuration review

No `vercel.json` exists in the repository. `next.config.ts` (`c:\Users\Tarun Valluri\Desktop\MY PROJECTS\ai-sales\next.config.ts`) contains only `devIndicators: false` — no `headers()` block, no image domain allowlist (not needed yet — no remote images are rendered), no redirects/rewrites.

- **[should-fix] No security-header configuration (`next.config.ts`'s `headers()`) exists anywhere in the app.** Common production hardening headers — `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security` (Vercel sets this automatically at the edge, so lower priority), `Permissions-Policy` — are entirely absent. Note explicitly: **`X-Frame-Options`/`frame-ancestors` must not be blanket-denied** — `/widget/embed` is deliberately loaded cross-origin inside an `<iframe>` by design (`public/widget-loader.js`'s whole architecture depends on it), so any header hardening pass must scope frame-ancestors restrictions to the dashboard/marketing routes only and explicitly exclude `/widget/embed`.
- **[nice-to-have]** No `vercel.json` — not itself a gap (Next.js's own conventions cover most of what `vercel.json` would otherwise configure, and `AGENTS.md` only names Vercel as the target "when deployment is introduced," which has not formally happened yet), but worth a deliberate decision once Phase 19 addresses deployment configuration directly rather than leaving it implicit.

## 11. Environment variable validation review (`docs/security.md` §5)

Every env var read in `lib/` uses a non-null assertion (`process.env.X!`) at the point of use — `lib/supabase/server.ts:12-13`, `lib/supabase/service.ts:15-16`, `lib/rag.ts:137-138`, `lib/embeddings.ts:95-96`. One exception: `lib/embeddings.ts:84-91`'s `EMBEDDING_DIMENSION` module-level constant does validate `GEMINI_EMBEDDING_DIMENSION` at import time and throws a clear error if it's missing/non-numeric — but this is the only one.

- **[should-fix] No startup-time env var validation exists.** `docs/security.md` §5 explicitly requires "validate required env vars at startup and fail loudly rather than at first use." Today, a missing `CLERK_SECRET_KEY`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `GEMINI_CHAT_MODEL`, `NEXT_PUBLIC_SUPABASE_URL`, or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` would surface only as a runtime `TypeError`/API-call failure inside whichever request path first touches it (e.g. the first chat message, or the first dashboard page load) — not at boot, and not with a clear "which variable is missing" message. `lib/embeddings.ts`'s `EMBEDDING_DIMENSION` pattern (module-level, throws immediately with a specific message) is a reasonable model to extend to the rest of the required set.

## 12. Logging review (`docs/architecture.md`'s "Structured event logging" section, Phase 18)

`logEvent()`'s closed-metadata-type convention is used consistently for every business-event call site introduced at or after Phase 18: `lib/tools/check-product-details.ts`, `lib/tools/check-faq-topic.ts`, `lib/tools/request-callback.ts`, `lib/rag.ts`'s unrecognized-tool-call branch, and `app/api/chat/route.ts`'s escalation/rate-limit call sites. No business-event call site has regressed to a raw `console.log`/`console.error` since Phase 18 closed.

- **[nice-to-have] `lib/rate-limit.ts:30`'s infra-failure log (`console.error("checkAndIncrementRateLimit failed", error)`) predates and was not migrated to `logEvent()`.** Arguably out of scope for Phase 18 (it's an infra/DB-call failure, not a discrete business event like an escalation or tool call — the same category `lib/errors.ts`'s `logAndGetUserMessage()` was deliberately left alone for, per `STATE.md`'s Phase 18 entry), but it is inconsistent with every other rate-limit-adjacent log line in this codebase now going through `logEvent()`. Low priority, cosmetic-consistency item.

## 13. Responsive UI and accessibility review (static inspection only — no live browser pass, see Decision 5 in the approved audit prompt)

Spot-checked `app/(widget)/widget/embed/_components/message-list.tsx` (uses `aria-live="polite"` for incoming messages, a real accessibility feature, not a gap) and `app/(dashboard)/dashboard/products/product-form.tsx` (every input has a paired `<label htmlFor>`, error text uses `role="alert"`) — both good examples of the pattern already in place. `STATE.md`'s Phase 15c entry already records a real-browser-verified keyboard-navigation/focus-outline pass for the dashboard nav (§1, Test 8 in that entry).

- **[nice-to-have] This review was static/spot-check only, per the approved audit prompt's Decision 5** — it did not exhaustively read every one of the ~30 dashboard/widget component files, and did not run a live axe-core/Lighthouse/Playwright accessibility pass across every screen. What was sampled is genuinely good (semantic labels, `aria-live`, `role="alert"`), but a systematic pass (contrast ratios, focus order across every form, screen-reader behavior of the live-polling panels) was not performed and would need its own scoped follow-up if wanted — flagging per the audit prompt's own stated boundary rather than claiming full coverage.

## 14. Production smoke-test readiness review

A minimal smoke-test pass (sign-in → business resolution → widget chat → tool call → escalation → dashboard load) has effectively already been run, repeatedly, as part of nearly every phase's manual verification recorded in `STATE.md` §2 — most recently Phase 18's full 8-step real-evidence pass. Nothing in the current implementation hardcodes `localhost` or a dev-only URL (`appOrigin` in `public/widget-loader.js` is derived from the script tag's own `src` at runtime, not hardcoded).

- **[should-fix]** The env-var findings above (11) and the missing `npm test` script (9) are the two concrete things that would make a *first production* smoke test harder to run confidently than it should be: a misconfigured env var fails at first use rather than at boot, and there is no automated regression suite to run before/after a production deploy — only the accumulated manual-verification history. Both are already captured above; listed again here only because they are exactly the kind of gap this sub-area is meant to surface.

---

## Summary by severity

**Blocker (1):**
1. `lib/tools/request-callback.ts:109-119` — existing-lead update missing `.eq("business_id", businessId)` (§1).

**Should-fix (6):**
1. No startup-time env var validation (§11).
2. No `npm test` script / pgTAP tests never executed by automation (§9).
3. No security-header configuration in `next.config.ts`, with the widget's iframe embedding as an explicit constraint on any fix (§10).
4. Live `knowledge_chunks` row-count/`EXPLAIN` check not yet performed to confirm whether the HNSW index deferral threshold has been crossed (§8).
5. `lib/lead-extraction.ts`/`lib/lead-capture.ts` (`captureLeadFromConversation`/`extractLead`) are dead code — grepped, confirmed zero call sites anywhere in `app/` or `lib/`, superseded by Phase 14c's `request_callback` tool without ever being removed (`AGENTS.md` §9: "dead code" is explicitly listed among things to avoid). *(Found during the §1 tenant-isolation sweep; recorded here as its own should-fix item since it isn't a security finding.)*
6. (Restated from §14) — the combination of 1 and 2 above is what would make a genuine first production deploy riskier than the manual-verification track record alone suggests.

**Nice-to-have (5):**
1. Unescaped `%`/`_` wildcard characters in the two `ILIKE`-based tool lookups (§1, §4).
2. `extractIp()` trusts `x-forwarded-for` with no trusted-proxy allowlist — low-risk on Vercel specifically, real risk off it (§6).
3. `lib/rate-limit.ts`'s infra-failure log uses `console.error` instead of `logEvent()` (§6, §12).
4. No `vercel.json` (§10).
5. Accessibility/responsive review was static/spot-check only, not a full live pass (§13).

## Scope confirmation: `git status` after this audit

```
$ git status --short
 M STATE.md
?? docs/phase-19-audit-findings.md
?? prompts/phase-19a-production-hardening-audit.md
```

`STATE.md` and `docs/phase-19-audit-findings.md` are this audit's own output, per its acceptance criteria. `prompts/phase-19a-production-hardening-audit.md` predates the audit itself — it is the approved implementation prompt, written and saved in the prior, separately-approved step before any audit work began — not a file this audit's own execution created or modified. No file outside these three was touched, and no source file (`app/`, `lib/`, `public/`, `supabase/migrations/`, config) appears in this output.

## What this audit did not do

- Did not modify any application code, configuration, or database state.
- Did not run a live Supabase query against the production/dev database (no live connection was opened this session) — the §8 row-count/EXPLAIN check is flagged as needing one.
- Did not run a live-browser (Playwright or otherwise) accessibility/responsive pass.
- Did not run a load/synthetic-traffic test against rate limiting or vector search.
- Did not propose fixes or a remediation sequence — that is the next, separately-approved prompt(s), scoped to the findings above.
