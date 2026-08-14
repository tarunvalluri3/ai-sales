# Phase 14c — `request_callback` tool

## Goal
After this is implemented, `askSalesEmployee()` can, only after the prospect
has explicitly agreed to a callback (in response to their own request or the
AI's proactive offer) and has given contact info, call a new `request_callback`
tool that creates or updates a tenant-scoped `leads` row with
`requested_callback = true`. This is the first write action any tool in this
codebase can take — everything about it gets more scrutiny than 14a/14b's
read-only pattern, not a mechanical copy of it. The third and final tool for
Phase 14.

## Current phase
Phase 14 — AI tools / actions, third of three planned tools. Confirmed from
`STATE.md` §1/§2/§3 (14a and 14b both complete and fully verified;
`request_callback` named as the final remaining tool).

## User request
Design decided with the user before this prompt, in full:
- **Trigger conditions:** the AI may raise a callback two ways — the prospect
  asks for one, or the AI proactively offers one as part of its existing
  escalation judgment. Offering is conversational only, never itself a tool
  call. The tool only fires once the prospect has given clear agreement
  (responding to either an explicit ask or a proactive offer) **and**
  provided contact info, in the same or an earlier turn. No path fires the
  tool from the AI's own inferred intent alone. This must be stated
  explicitly in the system prompt instruction, not only enforced after the
  fact at the input-validation layer — the model must understand consent is
  required *before* attempting the call.
- **Contact info requirement:** mirrors Phase 10's "no contact info → no lead
  row" rule, enforced in the tool's own input contract (at least one of
  email/phone required), reusing `lib/schemas/lead.ts`'s existing
  conditional-requirement pattern rather than inventing new validation logic.
  A call without either fails closed with a structured result telling the
  model to ask the prospect for contact info first — never a silent success
  with no way to reach them, never a throw.
- **Data model:** no new table. `requested_callback boolean not null default
  false` added to `leads` (its own migration, following the established
  column-addition + grant precedent — verify by inspection whether a new
  grant is actually needed, don't assume). The tool creates or updates a lead
  via whichever of `captureLeadFromConversation()`/`createLead()` actually
  fits a tool-triggered write, decided after inspecting both, not assumed.
  Preferred callback time/notes go in the existing `notes` field — no new
  column for that.
- **Tool mechanics** otherwise reuse the 14a/14b pattern exactly: same file
  shape, `businessId` structurally absent from the model-facing schema and
  injected from `askSalesEmployee`'s trusted parameter, executor-level Zod
  re-validation, tenant-scoped writes, fail-closed on DB error, one log line
  per invocation (businessId + outcome — **not** the prospect's actual
  contact info, since this tool touches real PII unlike the read-only
  tools' query-string logging), added to the same `bindTools([...])`
  array/loop, no second cap.
- **Test rigor:** at least as rigorous as 14a/14b's forged-tenant/malformed-
  input proofs, plus: a call with no contact info is rejected before any
  write; a successful call creates exactly one correctly-attributed lead row
  (or correctly updates the existing one for that conversation — state which
  and why), never a duplicate, never attributed to the wrong business or
  wrong conversation.

## Skills and docs read
- `STATE.md` §1/§2 (Phase 10, 11, 14a, 14b entries) — the lead model's history, the existing (and, it turns out, currently unreachable) lead-creation path, and the proven tool-calling pattern this reuses.
- `docs/architecture.md`'s "AI tool-calling" and "Lead extraction (Phase 10)" subsections.
- `docs/security.md` §1, §7, §8, §9, §10 — tenant isolation, untrusted input, AI tool-execution rules, retrieval isolation, and safe error handling, all directly relevant to a write-capable tool.
- `docs/phases.md` — Phase 14's exit criterion and Phase 15's boundary (this tool does not implement human handoff itself, only records the request).
- `PRODUCT.md` §7 (escalation triggers) and §8 (the lead field specification — `AGENTS.md` forbids inventing fields beyond it; adding `requested_callback` is an explicit, user-directed extension of that spec, so §8's table needs updating too, not just the migration).
- `docs/prompt-template.md`.

## Existing code inspected
- **`lib/lead-capture.ts`'s `captureLeadFromConversation()` has zero live callers anywhere in the codebase today.** Its only caller was `/dashboard/leads-test`'s "End conversation & extract lead" button, and that page was deleted in Phase 13a (`STATE.md`'s Phase 13a entry explicitly records this). `app/api/chat/route.ts` never calls it. This means there is currently no live path that creates a `leads` row in production at all — a load-bearing fact for this prompt's design, not an assumption.
- **`captureLeadFromConversation()` doesn't fit a tool-triggered write even if it were wired up.** It calls `extractLead()` — a *separate* Gemini call over the *entire* transcript, re-deriving contact info/qualification from scratch — and it **always creates a brand-new `conversations` row** (`createConversation(...)` inside the function body). A tool call already has explicit `contactEmail`/`contactPhone`/`notes` arguments from the model and an existing, already-resolved `conversationId` from the live conversation; re-running a whole-transcript extraction and minting a second, orphaned conversation row for the same live chat would be wrong on both counts.
- **`lib/leads.ts`'s `createLead()` and `getLeadForConversation()` both construct their own Supabase client internally** (`createServerSupabaseClient()`, the Clerk-session client) rather than accepting one as a parameter — unlike `lib/conversations.ts`'s functions, which all take `supabase` as an explicit first parameter. The public chat widget (`app/api/chat/route.ts`, the tool's only real-world entry point) has **no Clerk session** — it uses `createServiceSupabaseClient()`. Calling `createLead()`/`getLeadForConversation()` from a tool invoked via the widget path would silently construct a second, sessionless Clerk client with no valid `auth.jwt()`, which is exactly the bug class `STATE.md`'s "fix-widget-retrieval-client-injection" entry already documents and fixed once for `lib/retrieval.ts`/`lib/rag.ts` — not a hypothetical risk, a previously-real one.
- **`lib/conversations.ts`'s `getConversationForBusiness(supabase, businessId, id)` already takes the client as a parameter** and is exactly the tenant-ownership check this tool needs (verifies a `conversationId` really belongs to `businessId` before any write) — directly reusable as-is, no client-construction issue.
- **Conclusion, following from the above:** neither existing lead-creation path fits. The tool's executor does its own direct, tenant-scoped `leads` queries using the `supabase` client passed in from `askSalesEmployee` (the same convention `check-product-details.ts`/`check-faq-topic.ts` already established for their own tenant-scoped queries against `products`/`services`/`faqs`), and reuses `getConversationForBusiness()` for the tenant-ownership check rather than duplicating that logic.
- **`supabase/migrations/20260813120005_create_leads_table.sql` inspected directly:** `qualification text not null check (...)` and `qualification_reason text not null` have **no default** — any insert must supply both. `grant select, insert, update, delete on public.leads to authenticated;` is a **table-level** grant (no column list), which in Postgres automatically covers any column added later via `ALTER TABLE ... ADD COLUMN` — confirmed by inspection, not assumed, so **no new grant statement is needed** for `requested_callback`. `service_role` (the widget's actual write path) bypasses RLS and grants entirely per `docs/security.md` §3, unaffected either way. There is **no unique constraint on `conversation_id`** — only a plain (non-unique) index — even though `getLeadForConversation()`'s `.maybeSingle()` already implicitly assumes at most one lead per conversation. Two concurrent/duplicate inserts for the same conversation would currently be allowed by the schema and would silently break that existing assumption.
- **`lib/schemas/lead.ts` inspected for reuse:** `normalizeEmail()`/`normalizePhone()` (format-validate-or-null, never throw) and `leadPersistSchema`'s `.refine((data) => data.contactEmail !== null || data.contactPhone !== null, ...)` pattern are the exact "at least one of email/phone" logic to mirror. `leadPersistSchema` itself isn't reused wholesale — it requires `qualification`/`qualificationReason` as caller-supplied, non-nullable fields, which this tool doesn't have (see Decisions).
- `lib/tools/check-product-details.ts`, `lib/tools/check-faq-topic.ts`, `lib/rag.ts` — the proven file shape and tool-loop dispatch to extend with a third tool and a third `else if` branch.
- `lib/supabase/types.ts`'s `Lead` type and `PRODUCT.md` §8's field table — confirmed current, no `requested_callback` field yet on either.

## Relevant existing architecture
Same as 14a/14b for the mechanical parts (narrow Zod schema, `businessId` injected not model-supplied, executor-level re-validation, structured result never a throw, tenant-scoped queries, `lib/tools/` file-per-tool convention). New for this tool: a second trusted, server-injected value (`conversationId`) that must also never be model-supplied, and a genuine write path that needs its own idempotency/attribution guarantees, not just a read guarantee.

## Decisions and assumptions
1. **`askSalesEmployee()`'s signature gains a required `conversationId: string` parameter**, positioned with `businessId` (both are trusted identity values, grouped ahead of the content parameters): `askSalesEmployee(supabase, businessId, conversationId, businessName, question, history)`. The only caller, `app/api/chat/route.ts`, already has `conversation.id` in hand before calling `askSalesEmployee` — it's threaded through, not newly derived. This is a real, deliberate breaking change to the function's contract, flagged explicitly (unlike 14a/14b, which added no new parameter).
2. **The tool executor's own tenant-ownership check reuses `getConversationForBusiness(supabase, businessId, conversationId)`** rather than a duplicated inline query — defense in depth even though the caller already guarantees a valid pair, matching this project's standing "re-verify, don't just trust the caller" convention (`lib/products.ts` et al. do the same).
3. **`qualification`/`qualification_reason` get fixed, deterministic values on insert, not a second AI-extraction call.** Running `extractLead()`-style qualification for every `request_callback` call would duplicate a whole model call for a fact the tool doesn't need to reason about, and would reopen the exact "AI-generated, untrusted, display-only" trust question `PRODUCT.md` §8 already resolved for the *other* creation path. Chosen values: `qualification: "warm"` (an explicit callback request is a real, above-baseline intent signal, but not asserted as `"hot"` without more evidence) and a fixed `qualification_reason: "Prospect explicitly requested a callback via chat."` — a factual statement about what happened in this tool call, not a fabricated business fact (`AGENTS.md` §3 rule 4 is about inventing facts about the *business*, not describing the tool's own trigger). Flagged for the user to confirm or override at approval time.
4. **`source: "request_callback_tool"`** (a fixed constant) on insert, distinguishing rows created through this path from any future revival of `captureLeadFromConversation()`'s path, for dashboard/debugging clarity.
5. **`interest_type`/`interest_id` are left `null` on insert.** Resolving a catalog interest isn't this tool's job (that's `check_product_details`/`check_faq_topic`'s territory, or a future `captureLeadFromConversation()` revival) — inventing a resolution here would be scope creep.
6. **Existing-lead-for-conversation handling: fill-blank-only, never overwrite.** If a `leads` row already exists for `(business_id, conversation_id)` (checked via a direct tenant-scoped query, same shape as `getLeadForConversation()`'s), the tool **updates** it: sets `requested_callback = true` always; sets `contact_name`/`contact_email`/`contact_phone` **only where the existing column is currently `null`** (never clobbers already-captured contact info with a possibly-lower-quality value from this tool call); appends the new `notes` text to any existing notes (`"\n\n"`-joined), capped at 2000 characters total, truncating the *new* addition if needed rather than discarding history. If no row exists, the tool **inserts** a new one with `requested_callback = true` from the start.
7. **Add `unique (conversation_id)` on `leads` in this same migration**, closing a real gap: `getLeadForConversation()` already assumes at most one lead per conversation (`.maybeSingle()` would itself start erroring on a genuine duplicate), but nothing in the schema enforces it today. This directly protects the "never a duplicate" requirement at the database layer, not just in application logic. **Before applying, the implementer must run a live check for existing duplicates** (`select conversation_id, count(*) from leads group by conversation_id having count(*) > 1`) — if any exist, stop and report to the user rather than deciding unilaterally how to resolve them; the migration should only proceed once confirmed clean. Flagged for the user to confirm at approval time, since it's a schema change beyond the literal "add one column" ask.
8. **`PRODUCT.md` §8's field table gets a new `requested_callback` row**, since `AGENTS.md` explicitly forbids inventing lead fields beyond that approved spec — this prompt is the user's own explicit extension of it, and the doc needs to stay the source of truth, not fall silently out of sync.
9. **No new pgTAP file.** This is a column addition (plus a supporting unique constraint) to an already-RLS-covered, already-isolation-tested table, with no new RLS policy — same precedent as Phase 13b's four new `businesses` columns, which also added no new pgTAP file.
10. **Tool result naming deliberately differs from the read tools':** `{ success: true, leadId, created }` / `{ success: false, reason }`, not `{ found, ... }` — this tool performs an action, not a lookup, and the shape should say so rather than mechanically reusing the read tools' vocabulary.
11. **No consent flag in the tool's Zod schema.** Per the user's explicit design, consent is enforced by *instructing* the model in the system prompt, not by adding a machine-checkable `prospectConfirmed`-style boolean the model could just set `true` regardless of what actually happened — a fake mechanical gate here would contradict the stated design and add no real security value (unlike `businessId`/`conversationId`'s exclusion from the schema, which *is* a real, structural guarantee).
12. **The zero-retrieval hard bypass (Phase 8) still applies unchanged**, inherited from 14a/14b: if `KnowledgeRetriever` returns zero documents, `askSalesEmployee` returns `FALLBACK_MESSAGE` immediately with no model call and no tool access at all — including this one. For a write-capable tool this is more consequential (a business with literally zero configured knowledge could never get a callback processed through the AI, even for an explicit request), but changing that foundational guarantee is out of scope here; flagged as an inherited limitation, not a new one introduced by this prompt.
13. **Live cross-tenant re-testing (14a/14b's pattern) does not apply the same way here, and that's stated explicitly rather than attempted and faked.** In 14a/14b, a live `/api/chat` cross-tenant test was meaningful because the model could be asked about a name/topic belonging to a *different* business than the one its widget key resolved to. Here, `conversationId` is always derived server-side for the *same* business the widget key already resolved (`resolveBusinessFromWidgetKey` → `createConversation`/`getConversationForBusiness`, both already tenant-scoped) — there is no way to reach the live `/api/chat` path with a genuinely mismatched `(businessId, conversationId)` pair to begin with. The forged-tenant proof for this tool is therefore necessarily a **direct executor call** (Group B), not reproducible live — this is a structural fact about the surface, not a gap in test rigor.

## Open decisions this depends on
None outstanding. Decisions 3 and 7 above are flagged for explicit user confirmation at approval time (not blocking decisions from `STATE.md` §4, but choices this prompt is asking the user to bless before implementation).

## Dependencies / packages required
None. Same installed packages as 14a/14b.

## Files likely to change
- **New:** `lib/tools/request-callback.ts` — tool definition, result type, executor.
- **New:** one migration adding `requested_callback boolean not null default false` and `unique (conversation_id)` to `leads`.
- **Modified:** `lib/rag.ts` — `askSalesEmployee()` gains the `conversationId` parameter; `bindTools([...])` gains the third tool; the dispatch gains a third branch.
- **Modified:** `app/api/chat/route.ts` — passes `conversation.id` into the now-extended `askSalesEmployee()` call.
- **Modified:** `docs/architecture.md` — tool-calling subsection extended with the third tool and the `conversationId`-threading change.
- **Modified:** `PRODUCT.md` §8 — `requested_callback` row added to the lead field table.
- **Not modified:** `lib/leads.ts`, `lib/lead-capture.ts`, `lib/conversations.ts` (only *read* via `getConversationForBusiness`, not changed), `lib/schemas/lead.ts` (only its exports reused, not changed).

## Database changes
One migration: `alter table public.leads add column requested_callback boolean not null default false;` plus `alter table public.leads add constraint leads_conversation_id_unique unique (conversation_id);` (after the pre-flight duplicate check in Decision 7). No grant statement needed (Decision confirmed by inspection above) — verify live post-migration via `has_column_privilege('authenticated', 'public.leads', 'requested_callback', 'INSERT')` returning `true`, same discipline as every prior grant-touching phase.

## Server / client boundaries
`lib/tools/request-callback.ts` is `server-only`. No new client-exposed value. No new secret. Prospect-supplied contact info is real PII flowing through this tool — never logged in plaintext (Decision: log only businessId + conversationId + outcome), never returned to the client beyond what `/api/chat`'s existing response shape already exposes (which is nothing lead-related today — unchanged).

## Documentation requirements
- Extend `docs/architecture.md`'s existing tool-calling subsection with a short paragraph on `request_callback`: the write-vs-read distinction, the `conversationId`-threading change to `askSalesEmployee()`'s signature, why neither existing lead-creation path fit (point to this prompt for the full reasoning rather than repeating it at length), and the consent-in-system-prompt design.
- Update `PRODUCT.md` §8's field table: add a `requested_callback` row (`boolean, defaults false` / "set by the request_callback AI tool when the prospect has agreed to a callback and given contact info").

## Implementation requirements
1. **Migration** (exact filename per the project's timestamp convention, generated at implementation time): add `requested_callback` column and the `conversation_id` unique constraint, per Database changes above, with the pre-flight duplicate check run and reported first.
2. **`lib/tools/request-callback.ts`:**
   - `RequestCallbackInputSchema`: `contactName`, `contactEmail`, `contactPhone`, `notes` — all `z.string().trim().max(...).nullable()` (loose, AI-facing, mirroring `LeadExtractionSchema`'s style), each `.describe(...)`'d. No `businessId`, no `conversationId` field.
   - `requestCallbackTool = { name: "request_callback", description: "<explains this creates/updates a callback request for the current conversation, only to be called after the prospect has clearly agreed to a callback and given contact info; explains that a missing_contact_info failure means the model should ask the prospect for their email or phone before trying again>", schema: RequestCallbackInputSchema }`.
   - `RequestCallbackResult = { success: true; leadId: string; created: boolean } | { success: false; reason: "missing_contact_info" | "invalid_input" | "lookup_failed" }`.
   - `executeRequestCallback(supabase, businessId, conversationId, rawArgs)`:
     a. `.safeParse(rawArgs)`; on failure, log + return `invalid_input`.
     b. Normalize `contactEmail`/`contactPhone` via `normalizeEmail()`/`normalizePhone()` (imported from `lib/schemas/lead.ts`); if both end up `null`, log + return `missing_contact_info` — no write attempted.
     c. `getConversationForBusiness(supabase, businessId, conversationId)`; if `null` (conversation doesn't exist or doesn't belong to this business), log + return `lookup_failed` — no write attempted. This is the tenant-forgery guard.
     d. Direct tenant-scoped query for an existing lead: `.from("leads").select("id, contact_name, contact_email, contact_phone, notes").eq("business_id", businessId).eq("conversation_id", conversationId).maybeSingle()`. On a Postgres error, log + return `lookup_failed`.
     e. If found: update per Decision 6 (fill-blank contact fields, append+cap notes, always set `requested_callback = true`); return `{ success: true, leadId: existing.id, created: false }`.
     f. If not found: insert per Decisions 3–5 (`qualification: "warm"`, fixed `qualification_reason`, `source: "request_callback_tool"`, `interest_type`/`interest_id: null`, `requested_callback: true`); return `{ success: true, leadId: newRow.id, created: true }`.
     g. On any insert/update Postgres error, log + return `lookup_failed` rather than throwing.
     h. One log line per outcome: `console.log("request_callback", businessId, conversationId, outcome)` / `console.error(...)` for failures — **never** `contactEmail`/`contactPhone`/`contactName`/`notes`.
3. **`lib/rag.ts` changes:**
   - `askSalesEmployee(supabase, businessId, conversationId, businessName, question, history = [])` — new parameter, positioned per Decision 1.
   - Import `requestCallbackTool`, `executeRequestCallback`.
   - `bindTools([checkProductDetailsTool, checkFaqTopicTool, requestCallbackTool])`.
   - Dispatch gains: `else if (toolCall.name === "request_callback") { toolResult = await executeRequestCallback(supabase, businessId, conversationId, toolCall.args); }`.
   - `SYSTEM_TEMPLATE` gains the consent-explicit instruction from the Goal section above (offering is conversational only; the tool fires only after clear prospect agreement **and** contact info already given; never call it from inferred intent alone).
   - `MAX_TOOL_ITERATIONS` and the rest of the loop/final-call structure unchanged.
4. **`app/api/chat/route.ts`:** update the one `askSalesEmployee(...)` call site to pass `conversation.id` in the new parameter position.

## Security requirements
- `docs/security.md` §8: narrow Zod schema; executor re-validates; both `businessId` **and** `conversationId` injected from trusted server parameters, structurally absent from the model-facing schema; structured result always, never a throw reaching the loop; authorization (tenant + conversation ownership) checked *before* any write, via `getConversationForBusiness`.
- `docs/security.md` §1/§9: every query (`getConversationForBusiness`, the existing-lead lookup, the insert/update) is `business_id`-scoped in the query itself; the conversation-ownership check additionally prevents a `(businessId, conversationId)` mismatch from ever reaching the write.
- `docs/security.md` §6/§10: contact info (real PII) is never logged in plaintext; DB errors are logged internally only, never surfaced raw.
- Rows created/updated by this tool remain within the same tenant-isolation guarantees already proven for `leads` (Phase 10's RLS policies, table-level grants, `leads_contact_required` check constraint — all untouched, still in force).

## Error handling
- Malformed args → `invalid_input`, logged, loop continues.
- Both contact fields absent/unnormalizable → `missing_contact_info`, logged, no write — the model is expected (per the system prompt) to ask the prospect for contact info and can retry the tool once it has it.
- `conversationId` doesn't belong to `businessId` (or doesn't exist) → `lookup_failed`, logged, no write.
- DB error on any query → `lookup_failed`, internal detail logged, no throw.
- Stage 2 (final structured-output) failure → existing `AppError` path, unchanged.
- Zero-retrieval case → existing `FALLBACK_MESSAGE` path, unchanged, no tool access at all (Decision 12).

## Acceptance criteria
- [ ] `lib/tools/request-callback.ts` exists, `server-only`, exports `requestCallbackTool` and `executeRequestCallback`.
- [ ] The tool's Zod schema has neither `businessId` nor `conversationId`; the executor never reads either from `rawArgs`.
- [ ] A call with no usable contact info returns `missing_contact_info` and writes nothing (verified by a direct DB read before/after).
- [ ] A call with a `businessId`/`conversationId` pair that don't belong together returns `lookup_failed` and writes nothing.
- [ ] A malformed-args call returns `invalid_input` and writes nothing, without throwing.
- [ ] A successful first call creates exactly one lead row, correctly attributed (`business_id`, `conversation_id` both correct), `requested_callback: true`, `qualification`/`qualification_reason`/`source` populated per Decisions 3–4.
- [ ] A second successful call for the *same* conversation updates the existing row (fill-blank contact fields, appended notes) rather than creating a duplicate — verified by a row count that stays at 1.
- [ ] `askSalesEmployee`'s new `conversationId` parameter is threaded correctly from `app/api/chat/route.ts`; both other tools (`check_product_details`, `check_faq_topic`) still work correctly in the same loop (no regression).
- [ ] The migration's pre-flight duplicate check is run and its result reported before the unique constraint is applied.
- [ ] Post-migration, `has_column_privilege('authenticated', 'public.leads', 'requested_callback', 'INSERT')` is confirmed `true` live, not assumed.
- [ ] `PRODUCT.md` §8 and `docs/architecture.md` updated.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass.

## Automated checks
`npm run lint`, `npx tsc --noEmit`, `npm run build`. No `npm test` — same standing project-wide gap. Acceptance via the manual steps below, at least as rigorous as 14a/14b's per the user's explicit requirement.

## Manual testing steps
**Group B — direct, throwaway script (implementer-run, deleted after use, actual output reported), against real test businesses/conversations:**
1. Malformed input → confirm `{ success: false, reason: "invalid_input" }`, confirm no new `leads` row via a direct count query before/after.
2. No contact info (both null after normalization) → confirm `{ success: false, reason: "missing_contact_info" }`, confirm no write.
3. Forged/mismatched tenant — call with Business B's `businessId` but a real `conversationId` belonging to Business A → confirm `{ success: false, reason: "lookup_failed" }`, confirm no write to either business.
4. Successful create → confirm `{ success: true, created: true, leadId }`; directly read the row back and confirm `business_id`/`conversation_id`/`requested_callback: true`/contact fields/`qualification`/`source` all correct.
5. Successful update — call again for the same conversation with different/additional contact info and notes → confirm `{ success: true, created: false, leadId: <same id as step 4> }`; confirm exactly one row still exists for that conversation (no duplicate); confirm fill-blank/notes-append behavior matches Decision 6.
6. Delete the throwaway script and any fixture data created purely for this test; confirm via `git status`.

**Group A — black-box, via `/api/chat`** (real widget key), against a business with real knowledge so retrieval is non-empty:
7. A conversation where the prospect explicitly asks for a callback and gives contact info in the same message → confirm (via a direct DB read after the request, since the HTTP response doesn't expose lead data) that exactly one `leads` row was created with `requested_callback: true`, correctly attributed to that business and conversation.
8. A conversation where the AI proactively offers a callback (e.g. after declining an out-of-knowledge question) and the prospect agrees and supplies contact info in a follow-up turn → confirm the same outcome, proving multi-turn consent works, not just single-turn.
9. A conversation where the prospect vaguely mentions wanting a callback but never clearly agrees to one being sent (or agrees but never gives contact info) → confirm no lead row is created, and that the AI's reply asks for what's missing rather than silently succeeding. (Model behavior isn't fully deterministic — same caveat already documented for 14a/14b's tool-invocation behavior; report the actual model behavior observed, don't assume it 3/3.)
10. Regression: `check_product_details`/`check_faq_topic` still work correctly in the same session after this change.
11. Check server logs throughout: confirm the tool's log line contains only businessId + conversationId + outcome, **never** the prospect's actual contact info or notes text.

## Out of scope
- Any live handoff/notification mechanism (emailing the business, paging a human) — Phase 15's job. This tool only records the request in `leads`.
- Reviving `captureLeadFromConversation()` or wiring it into the widget path — a separate, larger decision if the user ever wants whole-transcript-extraction leads back; not touched here.
- `interest_type`/`interest_id` resolution for callback-created leads.
- Any UI/dashboard change (though the existing `/dashboard/leads` list will incidentally start showing real rows for the first time in production, once this ships — no code change needed there, flagged as a side effect worth knowing about, not a task).
- Installing a test framework.
