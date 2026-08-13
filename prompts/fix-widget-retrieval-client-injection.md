# Fix: extend client injection to `lib/retrieval.ts`/`lib/rag.ts` for the widget path

## Goal

After this is implemented, `POST /api/chat` no longer 500s on every real request. `lib/retrieval.ts`'s `searchKnowledgeChunks()` and `lib/rag.ts`'s `KnowledgeRetriever`/`askSalesEmployee()` accept the Supabase client as an explicit parameter, the same way Phase 11 already did for `lib/conversations.ts`/`lib/messages.ts` — so the widget route can pass its service-role client all the way through retrieval, not just through conversation/message persistence. Every other caller of `askSalesEmployee()` (`/dashboard/ai-test`, `/dashboard/leads-test`) is updated to pass the Clerk-session client explicitly, so their behavior is unchanged.

## Current phase

Phase 11 — Chat API (already implemented and migrations applied, per `STATE.md` §1). This is a small, scoped corrective fix to that implementation, discovered during the user's own manual verification — same treatment as `prompts/fix-rag-grounded-used-context-signal.md` and `prompts/fix-match-knowledge-chunks-public-execute-grant.md`.

## User request

The user reports every real `/api/chat` request fails with a 500. Server logs show `permission denied for function match_knowledge_chunks (42501)`. Root cause, as diagnosed by the user: `lib/retrieval.ts`'s `searchKnowledgeChunks()` (called via `lib/rag.ts`'s `KnowledgeRetriever`/`askSalesEmployee()`) still unconditionally constructs a Clerk-session client via `createServerSupabaseClient()` internally. On the widget's request path there is no Clerk session, so that client authenticates as `anon` — which correctly has no `EXECUTE` grant on `match_knowledge_chunks` (Phase 7's deliberate fix, not to be touched). The fix is to extend Decision #5's client-injection pattern (already applied to `lib/conversations.ts`/`lib/messages.ts` in Phase 11) to cover `searchKnowledgeChunks()`/`KnowledgeRetriever`/`askSalesEmployee()`, so `/api/chat` can pass the service-role client through the full retrieval chain. Every other `askSalesEmployee()` caller must keep passing the Clerk-session client explicitly, unchanged in behavior.

## Skills and docs read

- `STATE.md` §1/§2 — Phase 11's implementation, including Decision #5 (client injection for `lib/conversations.ts`/`lib/messages.ts`) and the standing "verify actual grants" discipline that already correctly protects `match_knowledge_chunks`.
- `docs/security.md` §3 (RLS/service-role framing), §9 (retrieval isolation — `business_id` from the trusted source only).
- `AGENTS.md` §5 — this is a real functional gap in the approved Phase 11 scope (the endpoint cannot serve a single real request), not scope creep; still routed through the normal small-fix prompt treatment rather than skipped as "trivial," since it touches the AI/retrieval call chain (`AGENTS.md` §5's trivial-change exemption explicitly excludes "AI pipeline, prompt, or retrieval change").

## Existing code inspected

- `lib/retrieval.ts` — `searchKnowledgeChunks(businessId, queryText, limit)` constructs `createServerSupabaseClient()` internally at line 26, then calls the `match_knowledge_chunks` RPC. This is the only place in the codebase that calls this RPC.
- `lib/rag.ts` — `KnowledgeRetriever` (a `BaseRetriever` subclass) is constructed with `{ businessId, limit? }` and calls `searchKnowledgeChunks(this.businessId, query, this.limit)` with no client of its own. `askSalesEmployee(businessId, businessName, question, history?)` constructs a `new KnowledgeRetriever({ businessId })` internally — no client parameter anywhere in this file. `getChatModel()` (used by both `askSalesEmployee()` and `lib/lead-extraction.ts`) makes no Supabase call at all — it only builds a `ChatGoogleGenerativeAI` instance — so it needs no change.
- `lib/lead-extraction.ts` — `extractLead()` calls `getChatModel()` only, no Supabase client anywhere. Confirmed unaffected by this fix.
- `lib/lead-capture.ts` — `captureLeadFromConversation()` calls `extractLead()` (no DB) and the already-injected `createConversation()`/`createLead()`. Does **not** call `askSalesEmployee()`. Confirmed unaffected.
- `app/dashboard/ai-test/actions.ts` — `askKnowledgeAction()` calls `askSalesEmployee(businessId, businessName, parsed.data)`, running under a real Clerk session (`requireBusinessContext()`). Needs to start passing `createServerSupabaseClient()` explicitly.
- `app/dashboard/leads-test/actions.ts` — `askTurnAction()` calls `askSalesEmployee(businessId, businessName, parsedQuestion.data, parsedHistory.data)`, also under a real Clerk session. Same update needed. `extractLeadAction()` in the same file calls `captureLeadFromConversation()`, not `askSalesEmployee()` — unaffected.
- `app/api/chat/route.ts` — already constructs `const supabase = createServiceSupabaseClient();` for the conversation/message persistence calls, but calls `askSalesEmployee(business.businessId, business.businessName, message, history)` with no client — this is the actual bug. The fix is to pass the already-constructed `supabase` through.
- `lib/conversations.ts`/`lib/messages.ts` — the existing, correct precedent: `type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;`, client as the first parameter, callable with either the Clerk-session or service-role client since both are structurally the same type (`createClient()` with no generic schema argument).

## Relevant existing architecture

- Phase 11 Decision #5 already established this exact pattern for `lib/conversations.ts`/`lib/messages.ts`: "DB-access functions take the Supabase client as an explicit parameter, instead of constructing one internally... so both the Clerk-authenticated dashboard path and the new service-role widget path share one query implementation." This fix is that same decision, applied to the one call chain it was missed on.
- `match_knowledge_chunks`'s `authenticated`-only `EXECUTE` grant (Phase 7, `docs/architecture.md`'s standing per-function-privilege rule) is correct and is not to be changed — `anon` correctly has no access. The bug is that the widget path was accidentally calling it *as* `anon` in the first place, not that the grant is wrong.
- `docs/security.md` §9: retrieval must be tenant-scoped by a trusted `business_id`, which this fix doesn't touch — `business_id` was always correctly resolved via `resolveBusinessFromWidgetKey()`; the client used to run the query was the actual gap.

## Decisions and assumptions

1. **Client parameter goes first**, matching `lib/conversations.ts`/`lib/messages.ts`'s existing convention: `searchKnowledgeChunks(supabase, businessId, queryText, limit)`, `askSalesEmployee(supabase, businessId, businessName, question, history?)`.
2. **`KnowledgeRetriever` takes `supabase` as a required constructor field** (`{ supabase, businessId, limit? }`), stored alongside `businessId`, passed through to `searchKnowledgeChunks()` on every `_getRelevantDocuments()` call.
3. **Type reuse**: import the same `SupabaseClient = ReturnType<typeof createServerSupabaseClient>` pattern already used in `lib/conversations.ts`/`lib/messages.ts`, not a new type definition, so both client kinds remain interchangeable without a cast.
4. **No change to `getChatModel()` or `lib/lead-extraction.ts`** — neither touches Supabase at all; confirmed by inspection above, not assumed.
5. **Every existing caller of `askSalesEmployee()` is updated in the same commit**, not left broken — `app/dashboard/ai-test/actions.ts` and `app/dashboard/leads-test/actions.ts` both start importing `createServerSupabaseClient` and passing it explicitly. Their behavior (Clerk-session-scoped retrieval, RLS-enforced) is unchanged — this is a signature change, not a behavior change, for both of them.
6. **`app/api/chat/route.ts` passes its already-constructed `supabase` (the service-role client) into `askSalesEmployee()`** — no second client construction on that path.

## Open decisions this depends on

None.

## Dependencies / packages required

None new.

## Files likely to change

- `lib/retrieval.ts` — `searchKnowledgeChunks()` gains a leading `supabase` parameter; internal `createServerSupabaseClient()` call removed.
- `lib/rag.ts` — `KnowledgeRetriever`'s constructor fields gain `supabase`; `askSalesEmployee()` gains a leading `supabase` parameter, passed into `new KnowledgeRetriever({ supabase, businessId })`.
- `app/dashboard/ai-test/actions.ts` — import `createServerSupabaseClient`, pass it as `askSalesEmployee()`'s first argument.
- `app/dashboard/leads-test/actions.ts` — same, for `askTurnAction()`'s `askSalesEmployee()` call.
- `app/api/chat/route.ts` — pass the existing `supabase` (service-role client) as `askSalesEmployee()`'s first argument.
- `docs/architecture.md` — the "AI orchestration" section's description of `KnowledgeRetriever`/`askSalesEmployee()` and the Phase 11 "Public chat widget" subsection both get a short correction noting the client is now injected, matching the `lib/conversations.ts`/`lib/messages.ts` pattern described there.

## Database changes

None. `match_knowledge_chunks`'s grants are correct and untouched.

## Server / client boundaries

Unchanged. `lib/retrieval.ts` and `lib/rag.ts` remain `server-only`. No new secret exposure — this only changes *which already-existing, already-correctly-scoped* Supabase client instance performs the query, not what's accessible from a client component.

## Implementation requirements

1. `lib/retrieval.ts`: add `type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;` (import the type from `@/lib/supabase/server`, matching `lib/conversations.ts`). Change `searchKnowledgeChunks` to `searchKnowledgeChunks(supabase: SupabaseClient, businessId: string, queryText: string, limit = 5)`, remove the internal `createServerSupabaseClient()` call, use the passed-in `supabase` for the RPC call.
2. `lib/rag.ts`:
   - Add the same `SupabaseClient` type alias (or import it from `lib/retrieval.ts` if that's cleaner — implementer's call, keep it to one definition either way).
   - `KnowledgeRetriever`'s constructor: `constructor(fields: { supabase: SupabaseClient; businessId: string; limit?: number })`, store `this.supabase = fields.supabase`, use it in `_getRelevantDocuments()`'s call to `searchKnowledgeChunks(this.supabase, this.businessId, query, this.limit)`.
   - `askSalesEmployee(supabase: SupabaseClient, businessId: string, businessName: string, question: string, history: ConversationMessage[] = [])`: construct `new KnowledgeRetriever({ supabase, businessId })`.
3. `app/dashboard/ai-test/actions.ts`: import `createServerSupabaseClient` from `@/lib/supabase/server`; change the call to `askSalesEmployee(createServerSupabaseClient(), businessId, businessName, parsed.data)`.
4. `app/dashboard/leads-test/actions.ts`: same import; change `askTurnAction()`'s call to `askSalesEmployee(createServerSupabaseClient(), businessId, businessName, parsedQuestion.data, parsedHistory.data)`.
5. `app/api/chat/route.ts`: change the call to `askSalesEmployee(supabase, business.businessId, business.businessName, message, history)`, reusing the `supabase` constructed earlier in the handler (no new client construction).

## Security requirements

- `docs/security.md` §9: retrieval stays tenant-scoped by `business_id`, unchanged — this fix only changes which client instance carries out the already-tenant-scoped query.
- No change to `match_knowledge_chunks`'s grants (`authenticated`-only `EXECUTE`, `anon`/`PUBLIC` revoked) — confirm this fix doesn't touch that migration or attempt to "fix" it from the other direction (e.g. do **not** grant `anon` execute as a workaround).
- Confirm the widget path (`app/api/chat/route.ts`) now genuinely queries as `service_role` (which bypasses RLS by design, per Phase 11's own established exception) rather than as `anon` — the manual test below must show a successful, grounded response, not just the absence of the 42501 error.

## Error handling

No change to error handling shape — `searchKnowledgeChunks()`'s existing `AppError` wrapping is unchanged; only its client source changes. A permission error from any *other* misconfiguration would still surface the same safe `AppError` message it does today.

## Acceptance criteria

- [ ] A real `POST /api/chat` request (valid widget key, matching origin, real question) returns `200` with a grounded answer — the primary regression this fix exists to close, not just "no more 42501 in the logs."
- [ ] `/dashboard/ai-test` still works unchanged (Clerk-session retrieval, grounded/fallback behavior identical to before this fix).
- [ ] `/dashboard/leads-test`'s multi-turn conversation flow still works unchanged.
- [ ] `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

## Manual testing steps

1. **Primary regression — must be re-run, not assumed fixed:** repeat a Phase 11 manual test step (a real `POST /api/chat` request with a valid widget key and matching `Origin`, against a business with real knowledge). Confirm `200` and a real, grounded `answer` — this is the exact request that previously 500'd with `42501`.
2. Confirm the zero-knowledge-business case on the widget path still returns the fallback message with no Gemini call (same guarantee as Phase 8/9, now exercised through the service-role client for the first time).
3. On `/dashboard/ai-test`, ask a real, answerable question. Confirm it still returns a grounded answer, unchanged from before this fix (Clerk-session retrieval still works).
4. On `/dashboard/leads-test`, run a short multi-turn conversation. Confirm both turns work and the history/follow-up behavior is unchanged.
5. Re-run the Phase 11 manual testing steps that depend on a successful `askSalesEmployee()` call (multi-turn widget conversation, cross-tenant isolation check) end to end, since none of them could have passed while this bug was present.

## Out of scope

- Any change to `match_knowledge_chunks`'s grants or RLS.
- Any change to `lib/lead-extraction.ts` (confirmed to need none).
- Any change to rate limiting, widget-key/origin resolution, or message persistence — none of those are implicated by this bug.
- Re-litigating Phase 11's other design decisions.
