# Phase 14b — `check_faq_topic` tool

## Goal
After this is implemented, `askSalesEmployee()` can, in the same tool-calling
loop already proven by Phase 14a, also call a new read-only `check_faq_topic`
tool that does a topic-based lookup against `faqs` and returns the literal
stored answer — instead of retrieval's embedding-assembled paraphrase. Both
tools (`check_product_details`, `check_faq_topic`) are available to the model
in the same `bindTools([...])` array and the same bounded loop; there is no
second loop and no second `MAX_TOOL_ITERATIONS`.

## Current phase
Phase 14 — AI tools / actions, second of three planned tools. Confirmed from
`STATE.md` §1/§2 (Phase 14a complete and fully verified 2026-08-14; `STATE.md`
§3 names `check_faq_topic` as the next candidate, at the user's choice).

## User request
Build `check_faq_topic`, reusing 14a's proven two-stage pattern
(`bindTools()` → bounded loop → tools-unbound `withStructuredOutput` final
call) exactly, not establishing a new one. Same file shape as
`lib/tools/check-product-details.ts`. Both tools added to the same
`bindTools([...])` array in `lib/rag.ts`, same loop, same cap. Exact-match
semantics for FAQ topic lookup must be decided explicitly, not left implicit,
since a "topic" is fuzzier by nature than a product name. Manual testing
follows 14a's proven method: real `/api/chat` requests for the black-box
group, a throwaway direct-executor script (deleted after use, actual output
reported) for the fail-closed/forged-tenant proof. This prompt should be
substantially shorter than 14a's, since no new architectural discovery is
expected — flagged explicitly if something unexpected turns up during
implementation.

## Skills and docs read
- `STATE.md` §1/§2 (Phase 14a's full entry) — the proven pattern this prompt reuses, and the exact fail-closed/live-path verification method to repeat.
- `docs/architecture.md`'s "AI tool-calling (Phase 14a)" subsection — the documented two-stage flow and its provider-level rationale (tools and `responseSchema` are mutually exclusive on one Gemini call), which this prompt does not re-derive.
- `docs/security.md` §8 (AI safety and tool execution) — same requirements 14a already satisfied for its tool; applied here to a second one.
- `docs/phases.md` — Phase 14's exit criterion, already met once for `check_product_details`; this prompt extends the same proof to `check_faq_topic`.
- `docs/prompt-template.md` — this file's own contract.

## Existing code inspected
- `lib/tools/check-product-details.ts` — the exact shape to replicate: `CheckProductDetailsInputSchema` (Zod, single `query` field, no tenant field), `checkProductDetailsTool` (`{ name, description, schema }` object for `bindTools()`), `CheckProductDetailsResult` (discriminated union, `found: true | false` with a `reason` on failure), `executeCheckProductDetails(supabase, businessId, rawArgs)` (re-validates `rawArgs` with `.safeParse`, queries tenant-scoped, never throws, one `console.log`/`console.error` line per outcome with businessId + query + outcome only).
- `lib/rag.ts` — current tool loop (`askSalesEmployee`, inside the `try` block): builds `messages` from the prompt, binds `getChatModel().bindTools([checkProductDetailsTool])`, loops up to `MAX_TOOL_ITERATIONS` (currently `2`), and for every `tool_calls` entry calls `executeCheckProductDetails(supabase, businessId, toolCall.args)` directly (no dispatch by name, since only one tool exists today) before pushing a `ToolMessage` back. Adding a second tool requires: (a) `bindTools([checkProductDetailsTool, checkFaqTopicTool])`, and (b) dispatching each `toolCall` to the right executor by `toolCall.name`, since the direct single-executor call no longer applies.
- `lib/faqs.ts` — `getFaq(businessId, id)` (by id), `listFaqsForBusiness`, `createFaq`/`updateFaq`/`deleteFaq`, all `business_id`-scoped in the query. No existing lookup-by-topic function — this prompt adds one as a tool-specific query, not by generalizing `getFaq`, matching 14a's own precedent with `getProduct`/`getService`.
- `lib/supabase/types.ts` — `Faq` shape confirmed: `{ id, business_id, question, answer, created_at, updated_at }`.
- No further LangChain/Gemini API inspection performed — 14a already established and documented the tool-calling mechanics (`bindTools`, `tool_calls`, `ToolMessage`, the two-stage constraint); nothing here changes that.

## Relevant existing architecture
Identical to 14a's: `businessId` is always a function parameter from the caller's trusted context, never part of a tool's model-facing Zod schema; every tool executor re-validates its own input, is tenant-scoped in the query itself, and returns a structured result rather than throwing; `lib/tools/` holds one file per tool, matching in shape.

## Decisions and assumptions
1. **FAQ topic matching: substring `ilike`, not exact match — a deliberate departure from 14a's exact-match decision, reasoned explicitly per the user's request.** `check_product_details` used exact (non-wildcarded) `ilike` because product/service names are short, proper-noun-like labels a prospect is likely to name precisely. FAQ `question` values are full sentences ("Do you offer a money-back guarantee?"), and a prospect's own phrasing of the same topic ("what's your refund policy?") will essentially never match one verbatim. An exact match here would make the tool almost never fire, defeating its purpose. The query is instead matched with `ilike('question', '%' + topic + '%')` — substring, case-insensitive, against the stored `question` field only (not `answer` — the topic is what the FAQ is *about*, and matching against the full answer text risks incidental keyword hits that don't reflect the actual topic). This keeps the tool a real (if generous) exact-column lookup, not embedding/fuzzy similarity — still fundamentally different from retrieval, and still returns the literal stored `answer` verbatim once a row is found, never a paraphrase.
2. **Multiple substring matches: return the first, ordered by `created_at ascending` — not an error.** Unlike `check_product_details`'s `.maybeSingle()` (which assumes at most one exact name match), a substring match against `question` can legitimately return more than one row for a common keyword (e.g., topic `"refund"` matching both "What is your refund policy?" and "How long do refunds take?"). Rather than erroring on multiple rows (`.maybeSingle()` would) or arbitrarily picking a database-order row, the query is `.order("created_at", { ascending: true }).limit(1)`, taking the first (oldest-created) match deterministically — same ordering `listFaqsForBusiness()` already uses. This is a real behavior tradeoff (the tool may not always surface the *most relevant* of several matches, only the earliest-created), documented here rather than left as an accidental effect of query order.
3. **No new database migration, no full-text search, no `pg_trgm`.** A substring `ilike` needs no new index/extension to function correctly (only for performance at a scale this project isn't at yet); introducing full-text search or trigram similarity would be a real scope increase beyond "one narrow, low-risk, read-only tool," not requested.
4. **Tool dispatch by name in `lib/rag.ts`'s existing loop.** Since the loop now executes two different tools, each `tool_calls` entry is dispatched to its executor via `toolCall.name` (`"check_product_details"` → `executeCheckProductDetails`, `"check_faq_topic"` → `executeCheckFaqTopic`). An unrecognized name (should not occur, since only these two are bound) falls back to a structured `{ found: false, reason: "invalid_input" }`-shaped `ToolMessage`, logged, rather than throwing — fails closed the same way a malformed args payload does.
5. **Same `bindTools([...])` array, same loop, same `MAX_TOOL_ITERATIONS` cap — no separate cap per tool.** Per the user's explicit instruction; a single cap across both tools is sufficient since the cap exists to bound total cost/latency per answer, not per tool.
6. **Authorization, error handling, and logging conventions are identical to 14a's**, applied to `check_faq_topic`: `businessId` structurally absent from the tool's Zod schema; the executor re-validates `rawArgs`; a DB failure returns `{ found: false, reason: "lookup_failed" }` rather than throwing; one log line per invocation (businessId, topic query, outcome — no secrets, no full prospect message).

## Open decisions this depends on
None.

## Dependencies / packages required
None. Same installed packages as 14a.

## Files likely to change
- **New:** `lib/tools/check-faq-topic.ts` — same shape as `lib/tools/check-product-details.ts`.
- **Modified:** `lib/rag.ts` — `bindTools([...])` gains the second tool; the loop's per-`toolCall` execution dispatches by `toolCall.name`; `SYSTEM_TEMPLATE` gains one instruction line about the new tool, matching the existing `check_product_details` line's style.
- **Modified:** `docs/architecture.md` — a short addition to the existing "AI tool-calling (Phase 14a)" subsection (not a new subsection — see Documentation requirements) noting the second tool and its matching-strategy decision.
- **Not modified:** `app/api/chat/route.ts`, `lib/faqs.ts`, `lib/products.ts`, `lib/services.ts` — no caller-facing or unrelated data-access change.

## Database changes
None.

## Server / client boundaries
Identical to 14a: `lib/tools/check-faq-topic.ts` is `server-only`; no new value reaches the client; no new secret.

## Documentation requirements
Extend `docs/architecture.md`'s existing "AI tool-calling (Phase 14a)" subsection (do not create a new "(Phase 14b)" subsection — the pattern is unchanged, only the tool roster grows) with a short paragraph: `check_faq_topic` added to the same `bindTools([...])` array/loop; its matching strategy (substring `ilike` on `question`, first-match-by-`created_at`) and why it differs from `check_product_details`'s exact match (Decision 1/2 above); the by-name dispatch in the loop now that two tools exist.

## Implementation requirements
1. **`lib/tools/check-faq-topic.ts`:**
   - `CheckFaqTopicInputSchema = z.object({ topic: z.string().trim().min(1).max(200).describe("The topic or question the prospect is asking about, in their own words.") })`.
   - `checkFaqTopicTool = { name: "check_faq_topic", description: "<tells the model this does a lookup against this business's real FAQ entries for a specific topic, returning the exact stored answer, for when a prospect's question matches a known FAQ topic and the literal approved wording matters more than a paraphrase>", schema: CheckFaqTopicInputSchema }`.
   - `CheckFaqTopicResult = { found: true; question: string; answer: string } | { found: false; reason: "not_found" | "invalid_input" | "lookup_failed" }`.
   - `executeCheckFaqTopic(supabase, businessId, rawArgs)`: re-validate with `.safeParse`; on failure, log + return `invalid_input`. Query: `.from("faqs").select("question, answer").eq("business_id", businessId).ilike("question", \`%${topic}%\`).order("created_at", { ascending: true }).limit(1)`. On Postgres error, log + return `lookup_failed`. Empty array → `not_found`. Non-empty → `found: true` with the first row's `question`/`answer` verbatim. One log line per outcome (businessId, topic, outcome), same shape as `check_product_details`'s.
2. **`lib/rag.ts` changes:**
   - Import `checkFaqTopicTool`, `executeCheckFaqTopic` from `@/lib/tools/check-faq-topic`.
   - `bindTools([checkProductDetailsTool, checkFaqTopicTool])`.
   - Replace the loop's direct `executeCheckProductDetails(...)` call with a dispatch on `toolCall.name`: `"check_product_details"` → `executeCheckProductDetails(supabase, businessId, toolCall.args)`; `"check_faq_topic"` → `executeCheckFaqTopic(supabase, businessId, toolCall.args)`; any other name → log and treat as `{ found: false, reason: "invalid_input" }` for the `ToolMessage` content, without throwing.
   - Add one `SYSTEM_TEMPLATE` line, matching the existing `check_product_details` line's style, e.g.: *"When a prospect's question matches a specific FAQ topic and you need the business's exact approved wording, use the check_faq_topic tool rather than relying only on the reference context above."*
   - `MAX_TOOL_ITERATIONS` and the rest of the loop/final-call structure are unchanged.

## Security requirements
Same as `docs/security.md` §8/§9/§1 as applied in 14a, restated for this tool: narrow explicit Zod schema (`topic` only); `executeCheckFaqTopic` re-validates; `businessId` injected from `askSalesEmployee`'s trusted parameter, structurally unreachable from the model; every Supabase query `.eq("business_id", businessId)`-scoped; structured result always, never a thrown exception reaching the loop.

## Error handling
Same shape as 14a: malformed args → `invalid_input`, logged, loop continues; no matching FAQ → `not_found` (expected, not an error); DB failure → `lookup_failed`, internal detail logged, no throw; unrecognized tool name in dispatch → same fail-closed treatment, logged; loop-cap/Stage 2 failure handling unchanged from 14a.

## Acceptance criteria
- [ ] `lib/tools/check-faq-topic.ts` exists, `server-only`, exports `checkFaqTopicTool` and `executeCheckFaqTopic`, matching `check-product-details.ts`'s shape.
- [ ] The tool's Zod schema has no `businessId` field; the executor never reads a tenant identifier from `rawArgs`.
- [ ] Asking about a topic that substring-matches a real FAQ's `question` returns that FAQ's exact stored `answer`, verifiable against the dashboard's FAQ record (not a paraphrase).
- [ ] Asking about a topic with no matching FAQ returns a "don't have that" style answer, not a fabricated one.
- [ ] A malformed tool call (`{ topic: 123 }` passed directly to `executeCheckFaqTopic`) returns `{ found: false, reason: "invalid_input" }`, not a thrown error — proven via a throwaway script, real output reported.
- [ ] A forged/mismatched tenant call (`executeCheckFaqTopic(supabase, businessB.id, { topic: "<a topic that only matches Business A's FAQ>" })`) returns `{ found: false, reason: "not_found" }` — proven via the same throwaway script, real output reported.
- [ ] A live cross-tenant re-test (per 14a's proven method: the querying business must have its own real knowledge so retrieval is non-empty and Stage 1 actually runs) confirms the real `/api/chat` path stays tenant-safe when the model genuinely attempts a `check_faq_topic` call for a topic that only matches a different business's FAQ, with the tool's log line showing the querying business's own `businessId`.
- [ ] Both tools remain independently invokable in the same conversation/loop — a question that should use `check_product_details` still works correctly after this change (no regression).
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass.
- [ ] `docs/architecture.md`'s existing tool-calling subsection is updated, not duplicated.

## Automated checks
`npm run lint`, `npx tsc --noEmit`, `npm run build`. No `npm test` — same standing project-wide gap as 14a; acceptance via the manual steps below.

## Manual testing steps
Follow 14a's proven method exactly, against real test businesses with at least one real FAQ.

**Group A — black-box, via `/api/chat`** (real widget key, `Origin` header matching `widget_allowed_origin`):
1. Happy path: ask a question that substring-matches a real FAQ's topic; confirm the returned answer matches the stored `answer` field exactly.
2. Not-found path: ask about a topic with no matching FAQ; confirm a graceful "don't have that" answer, no fabrication.
3. Regression check: re-ask a `check_product_details`-style question (from 14a's own test data) in the same session; confirm it still works, proving the two tools coexist correctly in one `bindTools([...])` call.
4. **Live cross-tenant re-test (the Phase 14 exit criterion, live path):** using a business with its own real knowledge (so retrieval is non-empty and Stage 1 genuinely runs), ask about a topic that only matches a different business's FAQ (temporarily seeded the same way 14a's re-test seeded a temporary product — insert, test, delete). Confirm no leaked answer, and confirm the tool's log line shows the querying business's own `businessId`, not the FAQ-owning business's.
5. Check server logs throughout for the tool's log line (businessId + topic + outcome only, no secrets, no full prospect message).

**Group B — direct, throwaway script (implementer-run, deleted after use, actual output reported):**
6. Malformed input: `executeCheckFaqTopic(supabase, businessId, { topic: 123 })` → confirm `{ found: false, reason: "invalid_input" }`.
7. Forged/mismatched tenant: `executeCheckFaqTopic(supabase, businessB.id, { topic: "<a topic that only matches Business A's FAQ>" })` → confirm `{ found: false, reason: "not_found" }`.
8. Confirm via `git status` that no scratch script or temporary fixture data is left behind.

## Out of scope
- `request_callback` (14c) — deferred, not drafted, separate future prompt.
- Full-text search, `pg_trgm`, or any fuzzy/embedding-based FAQ matching — substring `ilike` only, per Decision 1.
- Any UI/dashboard change.
- Any change to `app/api/chat/route.ts`, rate limiting, CORS, or the widget.
- Any new database migration.
- Installing a test framework.
