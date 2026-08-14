# Phase 14a — `check_product_details` tool + tool-calling integration

## Goal
After this is implemented, `askSalesEmployee()` in `lib/rag.ts` can, during a
single answer, call a new read-only `check_product_details` tool that does an
exact, tenant-scoped lookup of one product or service by name directly from
the `products`/`services` tables — instead of relying only on retrieval's
fuzzy chunk-matching. This is the first tool the AI can invoke, and the first
time Gemini tool-calling (as opposed to retrieve-then-generate) is wired into
this codebase. Only this one tool is built. `check_faq_topic` and
`request_callback` are deliberately not touched here.

## Current phase
Phase 14 — AI tools / actions. Confirmed from `STATE.md` §1 (Phase 13 complete,
Phase 14 next) and `docs/phases.md`.

## User request
Start Phase 14 with exactly one narrow, low-risk, read-only tool
(`check_product_details`), proving the LangChain/Gemini tool-calling pattern
end-to-end before building `check_faq_topic` (deferred) or `request_callback`
(deferred, write action). `check_product_details`: exact lookup of a specific
product or service by name, returning its full structured record (price,
description) from `products`/`services`. Needs an explicit Zod input schema,
authorization before execution, server-injected tenant scope (never
model-supplied), a structured success/failure result, and logging.

## Skills and docs read
- `STATE.md` (full) — current phase, Phase 8/9 decisions, resolved decisions D1/D2/D5/D7, env vars.
- `PRODUCT.md` — no existing tool/action section; §7 (AI answer categories) and §8 (lead fields) read for context. No conflicting scope found.
- `docs/phases.md` — Phase 14 definition and exit criterion.
- `docs/security.md` — §1 (multi-tenancy), §7 (untrusted input), §8 (AI safety and tool execution — the operative section for this prompt), §9 (retrieval isolation), §11 (review checklist).
- `docs/prompt-template.md` — this file's own contract.
- No skill under `.claude/skills/` was loaded — this is a LangChain/Gemini integration task; `AGENTS.md` §6 directs to installed package docs + official docs, inspected directly below, not a skill path.

## Existing code inspected
- `lib/rag.ts` — `askSalesEmployee()`. Currently: builds a `KnowledgeRetriever` fixed to `businessId` at construction (never per-call), returns `FALLBACK_MESSAGE` with no model call when retrieval is empty, otherwise builds a `ChatPromptTemplate` and calls `getChatModel().withStructuredOutput(SalesEmployeeResponseSchema, { name: "SalesEmployeeResponse" })`. `getChatModel()` is shared with `lib/lead-extraction.ts`. No tool-calling exists anywhere in the codebase today.
- `lib/lead-extraction.ts` — second, independent consumer of `getChatModel()`, also via `withStructuredOutput`. Confirms `getChatModel()` must keep returning a plain `ChatGoogleGenerativeAI` (tools must be bound per-call-site, not baked into the shared factory).
- `app/api/chat/route.ts` — **the only current caller of `askSalesEmployee()`, full stop.** Resolves `businessId` server-side from the widget key (never from the client), passes the **service-role** Supabase client (`createServiceSupabaseClient()`), calls `askSalesEmployee(supabase, business.businessId, business.businessName, message, history)`, and returns `{ conversationId, answer, escalate }` (not `grounded`/`usedContext`/`escalationReason` — those never leave `askSalesEmployee`'s return value today). Confirms `askSalesEmployee()`'s existing signature/contract must not change (no new required params) — the tool must get `businessId` from `askSalesEmployee`'s own already-trusted parameter, not a new one. **Checked and confirmed gone: `app/dashboard/ai-test/` and `app/dashboard/leads-test/` do not exist on disk** — both were deleted in Phase 13a once real navigated dashboard UI replaced their purpose (per `STATE.md`'s Phase 13 entries). There is currently no dashboard debug/test page for `askSalesEmployee()` at all. `app/api/chat/route.ts` is therefore both the only caller to preserve compatibility with *and* the only realistic manual-testing surface — used for both below.
- `lib/messages.ts` — `listRecentMessages()` builds the `ConversationMessage[]` history `askSalesEmployee` already accepts. Unaffected by this prompt.
- `lib/products.ts`, `lib/services.ts` — `getProduct(businessId, id)` exists (lookup by id, not name) plus list/create/update/delete, all `business_id`-scoped in the query itself. No existing lookup-by-name function on either — this prompt adds one, but as a tool-specific query (see Decisions), not by generalizing `getProduct`.
- `lib/supabase/types.ts` — `Product`/`Service` shape confirmed: `{ id, business_id, name, description, price, created_at, updated_at }` (both tables identical in shape).
- `lib/errors.ts` — `AppError`/`logAndGetUserMessage` convention: safe user message separated from internal detail, internal detail logged server-side only.
- `lib/business-context.ts` — confirms the general project pattern of resolving `businessId` server-side and never accepting it from client/model input; the tool follows the same shape.
- `package.json` — installed: `@langchain/core@^1.2.5`, `@langchain/google-genai@^2.2.0`, `@google/genai@^2.16.0`, `zod@^4.4.3`. No test runner installed (`npm test` is not yet a real script — consistent with every prior phase's "known gap" around pgTAP not being executed).
- **Inspected the installed `@langchain/google-genai` and `@langchain/core` type declarations directly** (not assumed from training data), per `AGENTS.md`'s "not the Next.js you know" / inspect-before-assuming discipline:
  - `node_modules/@langchain/google-genai/dist/chat_models.d.ts`: `bindTools(tools: GoogleGenerativeAIToolType[], kwargs?)` returns a `Runnable<..., AIMessageChunk, ...>`. The documented example (lines ~317–360 of that file) shows binding tools as plain `{ name, description, schema: z.object(...) }` objects (not the `tool()` helper, not a class) and invoking a normal `.invoke()` call; the result's `.tool_calls` is an array of `{ name, args, type: "tool_call" }` (an `id` field is also present per `@langchain/core`'s `ToolCall` type, needed to correlate a `ToolMessage` reply back to its call).
  - `node_modules/@langchain/google-genai/dist/chat_models.js` (`withStructuredOutput`, ~line 644): confirmed Gemini's `withStructuredOutput` in this integration is implemented via the native `responseSchema`/JSON-mode generation config, **not** via forced function-calling. This means bound tools and `withStructuredOutput` are two different underlying mechanisms on this provider, and the Gemini API does not accept both a `tools` list and a `responseSchema` on the same call — confirmed by the fact that `withStructuredOutput`'s implementation sets `responseSchema` via `.withConfig()` with no tool-binding path, and the bind-tools example never combines the two. **Conclusion: a single call cannot both call tools and return the final structured `SalesEmployeeResponse` — this requires two stages (tool-calling stage, then a separate structured-output stage), detailed in Implementation Requirements below.**
  - `node_modules/@langchain/core/dist/language_models/chat_models.d.ts`: confirms `bindTools` is part of the shared `BaseChatModel` interface (`BindToolsInput[]`), and that `ToolMessage` (from `@langchain/core/messages`) is the standard way to feed a tool's result back into the next model call, keyed by `tool_call_id`.
  - `node_modules/@langchain/core/dist/prompt_values.d.ts`: `ChatPromptValue.toChatMessages(): BaseMessage[]` — confirms the existing `buildPrompt().invoke({...})` result can be converted to a mutable `BaseMessage[]` array, which is what the tool-calling loop needs to append `AIMessage`/`ToolMessage` turns to.

## Relevant existing architecture
- Server-only data access modules (`lib/products.ts`, `lib/services.ts`, etc.) always take `businessId` as an explicit parameter from a trusted caller, filter every query by `business_id` in the query itself, and throw `AppError` on unexpected DB failure.
- `lib/rag.ts` is the one place LangChain/Gemini orchestration lives; route handlers and Server Actions stay thin and call into it.
- Structured AI output goes through Zod schemas passed to `withStructuredOutput`, with `.describe()` on every field to guide the model — same convention will apply to the new tool's input/result schemas.
- `businessId` is always fixed at construction/closure time for anything the model can indirectly influence (see `KnowledgeRetriever`), never accepted as a per-call argument that the model could theoretically populate.

## Decisions and assumptions
1. **Tool covers both products and services with one tool, not two.** The user's phase framing groups "a specific product or service by name" under one tool name (`check_product_details`), and `products`/`services` are identically shaped. The tool looks up by name across both tables and reports which type it found. Flag for `STATE.md`: this is a real scope decision, not just an implementation default.
2. **Name matching: case-insensitive exact match first, not fuzzy/partial.** This tool exists specifically to be more precise than retrieval's fuzzy chunk matching (per the user's own framing), so it should not itself become fuzzy. Postgres `ilike` with the literal query (not wrapped in `%...%`) is used for case-insensitive exact matching, not substring matching. If nothing matches, the tool reports `found: false` rather than guessing at the closest name.
3. **If both a product and a service share the same name:** report the product (products checked first). This is an edge case not covered in the user's spec; documented here rather than silently picked. Flag for `STATE.md`/user attention.
4. **Two-stage tool-calling flow in `askSalesEmployee()`**, forced by the provider-level constraint discovered during inspection (tools and `responseSchema` are mutually exclusive on a single Gemini call via this LangChain integration):
   - Stage 1 (tool stage): the chat model is bound with `check_product_details` via `bindTools()` and invoked with the existing system/history/question messages (no structured output). If the response has `tool_calls`, each is executed via the new authorized executor, and a `ToolMessage` is appended per call, then the model (still tool-bound) is invoked again with the extended message list. This repeats up to a fixed cap (`MAX_TOOL_ITERATIONS = 2`) to bound cost/latency and prevent a runaway loop; on hitting the cap, the loop simply stops issuing further tool calls and proceeds to Stage 2 with whatever context has been gathered so far — this is not a user-facing error.
   - Stage 2 (final-answer stage): a **second**, tools-unbound call using the existing `withStructuredOutput(SalesEmployeeResponseSchema, ...)` pattern, given the full accumulated message list (original prompt + every tool round), producing the same `SalesEmployeeResponse` shape as today. The existing caller (`app/api/chat/route.ts` — the only one, per "Existing code inspected" above) is unaffected — the function's external contract (params in, `SalesEmployeeResponse` out) does not change.
   - This means every answer now costs at least 2 model calls when documents are found (up from 1), and up to `MAX_TOOL_ITERATIONS + 1` when tools are used. Flag for `STATE.md`: a real latency/cost tradeoff, accepted as the necessary shape of tool-calling on this provider via this LangChain integration, not an oversight.
5. **The zero-retrieval fallback path is unchanged.** When `KnowledgeRetriever` returns zero documents, `askSalesEmployee` still returns `FALLBACK_MESSAGE` immediately with no model call and no tool access, exactly as today — Phase 8's exit criterion stays intact. The tool only ever runs when there's already at least some retrieved context to reason from.
6. **Tool executor re-validates its own input with Zod**, even though `bindTools`' schema already constrains what Gemini can send. Defense in depth per `docs/security.md` §8 ("validated inputs" is listed as its own requirement, separate from "narrow, explicit Zod schema") — a malformed or unexpected payload (e.g. if a future model version sends something schema-noncompliant) fails closed with a structured `invalid_input` result rather than throwing into the tool-calling loop.
7. **Authorization check**: since this tool only reads within the caller's own already-authenticated `businessId` (fixed in a closure, never accepted from the model — see Security requirements), "authorization before execution" is satisfied by construction: there is no separate per-call permission to check beyond the tenant scope itself. This is recorded explicitly rather than left implicit, since `docs/security.md` §8 calls it out as its own checklist item.
8. **No new database migration.** The tool reads existing `products`/`services` columns via existing RLS-protected/tenant-filtered queries. No schema change needed.
9. **Tool execution failure (a DB error) does not throw out of `askSalesEmployee`.** It returns a structured `{ found: false, reason: "lookup_failed" }` tool result (logged server-side via `AppError`'s internal-message path) so the model can gracefully tell the prospect it couldn't check that right now, rather than a hard failure aborting the whole answer. This matches `docs/security.md` §10 (safe-for-users error handling) applied to a tool result instead of a top-level response.
10. **No automated test framework added.** `npm test` still has no real implementation in this project (same standing gap as every prior phase's pgTAP tests). Per the project's established precedent (manual verification substituting for automated tenant-isolation proof at every phase so far — see `STATE.md` §2's repeated "known gaps carried forward" notes), the Phase 14 exit criterion ("a tool invoked with a forged tenant or malformed input fails closed, with a test proving it") is satisfied via explicit manual test steps below, not a new Jest/Vitest install, since installing a test framework is a dependency addition beyond this prompt's approved scope. Flagged here for the user: say if an automated test framework should be added instead — not assumed.

## Open decisions this depends on
None. D1/D2/D5/D7 (the only resolved decisions on record) don't bear on this work, and no new open decision blocks Phase 14 per `docs/phases.md`.

## Dependencies / packages required
None. `@langchain/core`, `@langchain/google-genai`, `zod` are already installed and already used by `lib/rag.ts`/`lib/lead-extraction.ts`.

## Files likely to change
- **New:** `lib/tools/check-product-details.ts` — tool definition (name/description/Zod schema for `bindTools`), result type, and the authorized executor function.
- **Modified:** `lib/rag.ts` — `askSalesEmployee()` gains the two-stage tool-calling flow described above. `SYSTEM_TEMPLATE` gains a short instruction telling the model when to use the tool (see Implementation Requirements). No change to `getChatModel()`'s signature.
- **Modified:** `docs/architecture.md` — new subsection documenting the tool-calling pattern (see below).
- **Not modified:** `app/api/chat/route.ts`, `lib/products.ts`, `lib/services.ts`, `lib/messages.ts` — none of `askSalesEmployee`'s external contract changes. No dashboard debug page exists to modify or add one to (see above) — none is added by this prompt.

## Database changes
None.

## Server / client boundaries
Everything here is server-only. `lib/tools/check-product-details.ts` starts with `import "server-only"`, same as every other `lib/` module. No new value reaches the client — the tool's result is consumed entirely inside `lib/rag.ts` and folded into the existing `answer` string returned to callers. No secret is newly introduced; `GEMINI_API_KEY` usage is unchanged (already read inside `getChatModel()`).

## Documentation requirements
Add a new `### AI tool-calling (Phase 14a)` subsection to
`docs/architecture.md`, inside the existing `## AI orchestration:
retrieval-to-generation pipeline (Phases 8-9)` section — placed after the
"Conversation context" paragraph and before the existing `### Lead
extraction (Phase 10)` subsection, since tool-calling is a direct extension
of the core `askSalesEmployee()` pipeline, not a downstream consumer of it
the way lead extraction is. Cover, briefly (matching this file's existing
density, not padded):
- The two-stage flow: a tools-bound call (`bindTools`) that may produce
  `tool_calls`, executed and fed back as `ToolMessage`s in a bounded loop
  (`MAX_TOOL_ITERATIONS`), followed by a separate tools-unbound
  `withStructuredOutput` call for the final `SalesEmployeeResponse`.
- **Why two stages, stated as the provider-level fact discovered by
  inspection:** this LangChain/Gemini integration implements
  `withStructuredOutput` via the native `responseSchema` JSON-mode
  generation config, not forced function-calling, and a single Gemini call
  cannot carry both a `tools` list and a `responseSchema` — so tool use and
  structured final output cannot happen in the same model call.
- That `businessId` is fixed at the tool-executor level (a closure
  parameter, never part of the tool's model-facing Zod schema), following
  the same pattern `KnowledgeRetriever` already established for retrieval.
- A pointer to `lib/tools/` as where future tools (`check_faq_topic`,
  `request_callback`) live, so this convention doesn't need rediscovering
  from source when those are built.

## Implementation requirements
1. **`lib/tools/check-product-details.ts`:**
   - `CheckProductDetailsInputSchema = z.object({ query: z.string().trim().min(1).max(200).describe("The exact product or service name to look up, as the prospect referred to it.") })`.
   - Export a `checkProductDetailsTool` object shaped for `bindTools()`: `{ name: "check_product_details", description: "<clear description telling the model this does an exact lookup by name against this business's real product/service catalog, for when a prospect asks about a specific named product or service and precise price/description matters>", schema: CheckProductDetailsInputSchema }`.
   - `CheckProductDetailsResult` type: a discriminated union —
     `{ found: true; type: "product" | "service"; name: string; description: string | null; price: string | null }`
     `| { found: false; reason: "not_found" | "invalid_input" | "lookup_failed" }`.
   - `export async function executeCheckProductDetails(supabase: SupabaseClient, businessId: string, rawArgs: unknown): Promise<CheckProductDetailsResult>`:
     - `businessId` is a function parameter supplied by `lib/rag.ts` from its own trusted `businessId` — **never** part of `CheckProductDetailsInputSchema`, never read from `rawArgs`.
     - Re-validate `rawArgs` with `CheckProductDetailsInputSchema.safeParse`; on failure, log (server-side, via `console.error` or the `AppError`-internal-message pattern, no user-facing throw) and return `{ found: false, reason: "invalid_input" }`.
     - Query `products` first: `.select("name, description, price").eq("business_id", businessId).ilike("name", query).maybeSingle()`. If found, return `{ found: true, type: "product", ... }`.
     - Else query `services` the same way; if found, return `{ found: true, type: "service", ... }`.
     - Else return `{ found: false, reason: "not_found" }`.
     - Wrap both queries' Postgres error branches (`error` truthy) to log the internal detail and return `{ found: false, reason: "lookup_failed" }` rather than throwing — a tool failure must not take down the whole `askSalesEmployee` call (Decision 9).
     - Log every invocation server-side (one line, before returning): businessId, the sanitized query string, and the outcome (`found`/`reason`) — no secrets, no full prospect message content, per `docs/security.md` §6/§10.

2. **`lib/rag.ts` changes:**
   - Import `checkProductDetailsTool`, `executeCheckProductDetails`, `CheckProductDetailsResult` from `@/lib/tools/check-product-details`; import `AIMessage`, `ToolMessage`, `BaseMessage` from `@langchain/core/messages`.
   - Add `const MAX_TOOL_ITERATIONS = 2;`.
   - In `askSalesEmployee`, after the existing zero-document fallback check and after building `context`, replace the current single `withStructuredOutput` call with:
     a. Build the initial `BaseMessage[]` via `(await buildPrompt().invoke({ context, businessName, question, history: toLangchainHistory(history) })).toChatMessages()`.
     b. Bind the tool: `const toolModel = getChatModel().bindTools([checkProductDetailsTool]);`
     c. Loop up to `MAX_TOOL_ITERATIONS` times: invoke `toolModel` with the current message array; if the resulting `AIMessage` has no `tool_calls` (or an empty array), break; otherwise push the `AIMessage` onto the message array, then for each tool call execute `executeCheckProductDetails(supabase, businessId, toolCall.args)` and push a `ToolMessage` (`content: JSON.stringify(result)`, `tool_call_id: toolCall.id!`, `name: toolCall.name`) onto the array, then continue the loop.
     d. After the loop (whether it broke early or hit the cap), make the final call: `const model = getChatModel().withStructuredOutput(SalesEmployeeResponseSchema, { name: "SalesEmployeeResponse" }); const result = await model.invoke(messages);` — using the accumulated `messages` array instead of the original single `prompt` value.
     e. Return shape is unchanged (`answer`, `grounded`, `usedContext`, `sourceChunkIds`, `escalate`, `escalationReason`), still built from `result` and `documents` exactly as today.
     f. Wrap the whole tool-and-final-answer flow in the existing `try { ... } catch` that already throws `AppError("Something went wrong generating a response...", "askSalesEmployee: chat generation failed", error)` — a tool-loop failure (as opposed to an individual tool execution's own internal failure, which is caught inside `executeCheckProductDetails` per Decision 9) surfaces the same way any other generation failure does today.
   - Update `SYSTEM_TEMPLATE` to add one instruction line, e.g.: *"When a prospect asks about a specific named product or service and you need its exact, current price or description, use the check_product_details tool rather than relying only on the reference context above — it queries the business's live catalog directly."* Keep every existing rule in the template unchanged.

## Security requirements
- `docs/security.md` §8, applied concretely: `CheckProductDetailsInputSchema` is the narrow explicit Zod schema; `executeCheckProductDetails` re-validates before running; `businessId` is injected from `askSalesEmployee`'s own trusted parameter and is structurally unreachable from the model (not in the tool's input schema, not read from `rawArgs`); the result is always the structured `CheckProductDetailsResult` union, success or failure, never a thrown exception that could destabilize the caller.
- `docs/security.md` §9: the tool's two Supabase queries are tenant-scoped by `business_id` in the query itself (`.eq("business_id", businessId)`), same pattern as every existing `lib/products.ts`/`lib/services.ts` function.
- `docs/security.md` §1: no query in this prompt is ever unscoped; there is no code path where `check_product_details` can run without a `businessId` already resolved by the caller.
- Treat the tool's own *result* content as safe (it's the business's own row, already tenant-scoped before it ever reaches the model) — but the *tool_call arguments* coming back from the model are still treated as untrusted input requiring validation (Decision 6), consistent with §8's "AI-generated structured output is untrusted input."
- No new env var, no new client-exposed value, no secret logged (tool's log line is businessId + query string + outcome only).

## Error handling
- Malformed/invalid tool-call args from the model → `{ found: false, reason: "invalid_input" }`, logged, loop continues normally (the model sees this in its next turn and can retry or answer without it).
- No matching product/service → `{ found: false, reason: "not_found" }` — a legitimate, expected outcome, not an error.
- Database failure during lookup → `{ found: false, reason: "lookup_failed" }`, internal detail logged via the `AppError`-message convention, no throw.
- Tool-loop cap reached (`MAX_TOOL_ITERATIONS`) → not an error; proceeds to Stage 2 with whatever context exists.
- Stage 2 (final structured-output) call failure → existing `AppError("Something went wrong generating a response. Please try again.", "askSalesEmployee: chat generation failed", error)` path, unchanged.
- Zero-retrieval case → existing `FALLBACK_MESSAGE` path, completely unchanged, no tool involvement.

## Acceptance criteria
- [ ] `lib/tools/check-product-details.ts` exists, is `server-only`, exports `checkProductDetailsTool` and `executeCheckProductDetails`.
- [ ] The tool's Zod input schema has no `businessId` field, and `executeCheckProductDetails` never reads a tenant identifier from `rawArgs`.
- [ ] Asking about a real product/service by exact name (case-insensitive) returns its true price/description via the tool, verifiable by comparing the AI's stated price against the dashboard's Products/Services record.
- [ ] Asking about a name that doesn't exist for that business returns a "not found"/"don't have that" style answer, not a fabricated price.
- [ ] A malformed tool call (simulate by temporarily passing an invalid `rawArgs` shape, e.g. `{ query: 123 }`, directly to `executeCheckProductDetails` in a throwaway scratch script — see Manual testing steps, Group B) returns `{ found: false, reason: "invalid_input" }`, not a thrown error.
- [ ] A forged/mismatched tenant scenario (call `executeCheckProductDetails(supabase, businessB.id, { query: "<a product name that only exists for Business A>" })`) returns `{ found: false, reason: "not_found" }` — proving Business A's product is unreachable through Business B's `businessId`, even though the query string matches.
- [ ] Zero-retrieval questions still return `FALLBACK_MESSAGE` with no model call (existing Phase 8 behavior, unbroken) — observable via `/api/chat`'s response and/or server logs.
- [ ] `askSalesEmployee`'s exported function signature is unchanged; `app/api/chat/route.ts` needs no changes.
- [ ] `docs/architecture.md` has a new subsection documenting the two-stage tool-calling flow and the provider-level constraint behind it.
- [ ] `npm run lint` passes.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run build` passes.

## Automated checks
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- No `npm test` — no test framework installed yet (Decision 10); acceptance is via the manual steps below, consistent with every prior phase's tenant-isolation verification method.

## Manual testing steps
No dashboard debug page exists for `askSalesEmployee()` (see "Existing code
inspected" — `ai-test`/`leads-test` were deleted in Phase 13a). Two groups of
verification are needed: (A) black-box tests against the real, production
`/api/chat` widget endpoint, run by the user; (B) direct fail-closed tests
against `executeCheckProductDetails()` that need no UI, **run by the
implementing agent itself during implementation**, via a throwaway script
under the project's scratch directory (never committed, deleted after use) —
same precedent as prior phases' direct `npx supabase db query --linked`
verification instead of deferring everything to the user. The implementer
reports the actual captured output for group B in the implementation report,
not just "confirmed."

### Group A — via `/api/chat` (user-run, or implementer-run and reported)

Reuse the Phase 11/12-proven method: get a real `widget_key` and set
`widget_allowed_origin` from `/dashboard/widget-settings` for two real test
businesses (Business A, Business B), each with at least one product with a
distinctive name/price, then send requests shaped exactly like the endpoint's
`bodySchema` (`widgetKey`, optional `conversationId`, `message`), with an
`Origin` header matching the configured allowed origin:

```
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"widgetKey":"<Business A widget key>","message":"What is the price of <Business A real product name>?"}'
```

1. **Happy path:** send the request above. Confirm the JSON response's
   `answer` states the exact price/description from Business A's real
   Products/Services dashboard record, not a vaguer paraphrase.
2. **Not-found path:** same shape, asking about a product name that doesn't
   exist for Business A. Confirm `answer` reads as "I don't have that"
   fallback-style language, not an invented price.
3. **Cross-tenant fail-closed (the Phase 14 exit criterion, black-box):**
   using Business A's `widgetKey`/origin, ask specifically about a product
   name that only exists for Business B. Confirm `answer` cannot produce
   Business B's real price/description — it must read as the not-found case.
4. **Conversation continuity unaffected:** re-`POST` with the same
   `widgetKey` and the `conversationId` returned by step 1, asking a
   follow-up that only makes sense with turn 1's context (e.g. "how much
   does that cost again?"). Confirm the reply demonstrates it has the
   earlier turn — proving the two-stage tool-calling change didn't break
   `history` handling.
5. **`escalate` unaffected:** send a message that should trigger escalation
   per the existing persona rules (e.g. "I want to speak to a person").
   Confirm the response's `escalate` field is still `true`, proving the
   Stage 2 structured-output contract wasn't broken by the two-stage change.
   (`grounded`/`usedContext`/`escalationReason` never reach this endpoint's
   response today — see below for how those are checked instead.)
6. **Zero-knowledge business:** repeat step 1's shape against a business
   with no knowledge at all. Confirm the response is `FALLBACK_MESSAGE`,
   returned promptly (no visible extra latency from a tool round-trip that
   shouldn't have happened) — the existing Phase 8 zero-call guarantee.
7. Tail server logs during steps 1–6 for the tool's log line (businessId +
   query + outcome) on the tool-using requests, and confirm no secret or
   full prospect message is logged. Since `grounded`/`usedContext` aren't in
   the HTTP response, add a temporary `console.log` of `response` right
   before the `return withCors(jsonSuccess(...))` line in
   `app/api/chat/route.ts` for the duration of this testing pass only, then
   remove it before reporting done — do not commit a debug log line.

### Group B — direct fail-closed tests (implementer-run, throwaway script)

8. **Malformed input fail-closed:** in a throwaway script (e.g.
   `scratch/check-product-details-manual-test.ts`, run via `npx tsx` or
   equivalent, deleted when done), call
   `executeCheckProductDetails(supabase, businessId, { query: 123 })`
   directly against a real business's Supabase client. Confirm — and paste
   into the implementation report — that it returns
   `{ found: false, reason: "invalid_input" }` and does not throw.
9. **Forged/mismatched tenant fail-closed (the Phase 14 exit criterion,
   direct):** in the same script, call
   `executeCheckProductDetails(supabase, businessB.id, { query: "<a product name that only exists for Business A>" })`.
   Confirm — and paste into the implementation report — that it returns
   `{ found: false, reason: "not_found" }`, proving Business A's product is
   structurally unreachable through Business B's `businessId` even though
   the query string matches exactly.
10. Delete the throwaway script before reporting the phase done; confirm via
    `git status` that nothing under `scratch/` (or wherever it was placed)
    is staged or left behind.

## Out of scope
- `check_faq_topic` — deferred, not drafted, separate future prompt.
- `request_callback` — deferred, not drafted, separate future prompt; will need its own migration (`requested_callback boolean not null default false` on `leads`) and inspection of `captureLeadFromConversation()`/`createLead()` before deciding which lead-creation path to reuse — none of that is touched here.
- Any change to `app/api/chat/route.ts`, the widget, rate limiting, or CORS.
- Any new database migration, RLS policy, or grant.
- Any UI/dashboard change. No dashboard debug page exists or is added by this prompt (see "Existing code inspected").
- Installing a test framework (Decision 10) — flagged for the user, not assumed.
- Fuzzy/partial name matching, multi-result disambiguation, or a "did you mean" flow for `check_product_details` — exact match only, per Decision 2.
