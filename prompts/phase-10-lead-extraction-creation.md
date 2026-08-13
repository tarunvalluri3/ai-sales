# Phase 10 — Lead extraction and creation

## Goal

After this is implemented, a realistic multi-turn conversation with the Phase 9 sales-employee pipeline can be turned into a correctly-attributed, validated lead row — tenant-scoped, persisted, and readable from a minimal dashboard page — following the exact field specification now resolved in `PRODUCT.md` §8 (decision D6). This closes Phase 10's exit criterion: "a realistic conversation produces a correctly-attributed, validated lead row."

## Current phase

Phase 10 — Lead extraction and creation. Confirmed from `STATE.md` §1/§3 (Phase 9 closed and fully verified 2026-08-12; D6 resolved same day into `PRODUCT.md` §8; Phase 10 next, prompt written now per the user's explicit go-ahead).

## User request

The user resolved D6 (the lead field specification, now `PRODUCT.md` §8) and asked for the Phase 10 implementation prompt per `docs/phases.md`.

During prompt-writing, a real architectural ordering conflict surfaced: `PRODUCT.md` §8 requires `leads.conversation_id` to be a **required**, FK-backed reference to "the source conversation (Phase 11)" — but `docs/phases.md` places Phase 10 *before* Phase 11 (the phase that owns conversation creation and the chat API). Rather than resolve this unilaterally, the user was asked directly. **Decision, confirmed by the user:** Phase 10 creates a **minimal `conversations` stub table now** — just enough (`id`, `business_id`, `created_at`, `source`) to give `leads.conversation_id` a real, required FK target — and Phase 11 later extends it with the actual chat API, message persistence, and widget contract. This is the one piece of this prompt that reaches slightly ahead of a table Phase 11 will grow, and it's called out explicitly rather than smuggled in.

## Skills and docs read

- `STATE.md` — current phase, Phase 9's implementation, D6's resolution.
- `AGENTS.md` — stack rules, five non-negotiable rules, prompt-first workflow, §9 architecture boundaries (explicitly separates "lead logic" from AI orchestration and database access — both must be respected here).
- `PRODUCT.md` §8 (the full resolved lead specification this phase implements verbatim), §7 (AI behavior contract — `qualification` is an AI-generated signal, same untrusted/display-only category as Phase 9's `escalate`/`usedContext`).
- `docs/phases.md` — Phase 10's own scope/exit criterion, and Phase 11's scope (used to draw the exact line: only the minimal `conversations` stub crosses ahead; message handling, the chat API contract, rate limiting, and the public widget stay Phase 11's job).
- `docs/security.md` §1 (tenant isolation), §7 (untrusted input — AI structured outputs must be Zod-validated at the boundary, explicitly called out), §8 (AI safety — AI output never selects a tenant or a database row without a validated, tenant-scoped lookup), §9 (retrieval isolation, reused unchanged from Phase 8/9).

## Existing code inspected

- `lib/rag.ts` (Phase 8/9, in full) — `KnowledgeRetriever`, `askSalesEmployee()`, `SalesEmployeeResponseSchema`/`withStructuredOutput()` pattern this phase's own extraction schema follows; `ConversationMessage` type (`{ role: "user" | "assistant"; content: string }`) already exists and is exactly the transcript shape this phase needs — reused, not redefined.
- `lib/products.ts` (in full, representative of `lib/services.ts` too) — the established server-only CRUD pattern: explicit `business_id` filter on every query in addition to RLS, `AppError` on failure, `update`/`delete` return `boolean` (affected-or-not) rather than leaking existence information. `lib/leads.ts`/`lib/conversations.ts` follow this exact shape.
- `lib/schemas/catalog.ts` — the established pattern for a shared Zod-fields module colocated by what it validates, not a generic grab-bag. `lib/schemas/lead.ts` follows this.
- `lib/business-context.ts` — `requireBusinessContext()` returns `{ userId, orgId, businessId, businessName }`; reused unchanged.
- `app/dashboard/ai-test/{page.tsx,actions.ts,ask-form.tsx}` — the single-turn RAG/persona test tool from Phase 8/9. **Deliberately left unmodified** (Decision 3 below) — a new, separate throwaway tool is added for this phase's multi-turn/extraction testing rather than retrofitting this one with an unrelated concern.
- `app/dashboard/knowledge/**`, `app/dashboard/products/**` — the established "minimal functional page, not wired into dashboard nav" pattern (Phases 5/6), reused for `/dashboard/leads` (the real "dashboard-readable data" deliverable) and `/dashboard/leads-test` (the throwaway multi-turn conversation/extraction tool).
- `lib/supabase/types.ts` — no `Conversation`/`Lead` types exist yet; added here.

## Relevant existing architecture

- `business_id` always resolved server-side via `requireBusinessContext()`, never client input (`docs/security.md` §1, §7, §9).
- `AGENTS.md` §9 explicitly separates "lead logic" and "AI orchestration" and "database access" as distinct architectural boundaries — this phase keeps AI extraction (`lib/lead-extraction.ts`), DB CRUD (`lib/leads.ts`, `lib/conversations.ts`), and the orchestration that ties them together (`lib/lead-capture.ts`) in separate modules rather than one large file.
- Phase 9 established the pattern of trusting model self-reported fields (`escalate`, `usedContext`) only for low-stakes display purposes, never for authorization or a tenant/record decision. This phase must **not** extend that trust to a database foreign key: the model may *suggest* a product/service name in free text, but the actual `interest_id` written to the database comes only from a server-side, tenant-scoped exact-match lookup against that business's own `products`/`services` — never a raw ID the model invents (`docs/security.md` §8's "AI output never selects a tenant or bypasses authorization," applied here to "AI output never directly becomes a foreign key value").

## Decisions and assumptions

1. **`conversations` is a minimal stub table this phase, not Phase 11's real chat/message model.** Columns: `id`, `business_id`, `created_at`, `source` (nullable text — where the conversation started; `PRODUCT.md` §8 already specifies this exact field name on `leads`, and it's more naturally captured once per conversation than duplicated per lead, but is *also* copied onto the `leads` row per the approved spec, since that's what §8 asks for). No `messages` table, no status, no `ended_at`, no chat API, no widget — those are Phase 11's job. Confirmed with the user directly (see User request above) rather than assumed.
2. **The multi-turn transcript for testing is never persisted as individual message rows.** Since there's no `messages` table this phase (Decision 1), the conversation transcript used for extraction lives only in the test page's client-side React state for the duration of the browser session — lost on refresh, same throwaway character as every prior phase's test tool. The `conversations` row itself is created lazily, at the moment lead extraction actually runs, not at the start of the test conversation — it only needs to exist by the time a `leads` row is inserted. **Explicit tradeoff, confirmed intentional for v1, not an accidental gap:** a conversation where the prospect never gives contact info leaves literally zero trace in the database — no `conversations` row, no `leads` row, nothing. Conversation-count/engagement telemetry (e.g. "how many prospects talked to the AI but didn't convert to a lead") is not a v1 goal per `PRODUCT.md`, so this isn't tracked. If that kind of analytics is ever wanted, it requires its own decision about *always* persisting a conversation row regardless of outcome (likely alongside Phase 11's real conversation/message persistence, which will need one anyway) — not assumed or built here.
3. **A new throwaway page, `/dashboard/leads-test`, handles the multi-turn conversation + extraction flow — `/dashboard/ai-test` (Phase 8/9) is left untouched.** Retrofitting the existing single-turn RAG debugging tool with an unrelated multi-turn/lead-extraction concern would conflate two different testing purposes in one page. `askSalesEmployee()`'s existing `history` parameter (built in Phase 9, never exercised until now) is what makes the new page's multi-turn behavior possible without any change to `lib/rag.ts`.
4. **`interest_id` is never taken directly from AI output.** The extraction model outputs `interestType` (`"product" | "service" | "general" | null`) and `interestName` (free text, nullable) — never a raw ID. Server-side code resolves `interestName` to a real `interest_id` via a case-insensitive **exact** name match against that business's own `products`/`services` table (tenant-scoped, same pattern as every other lookup in this project). No match → `interest_id` stays `null`, `interest_type` is still recorded if the model gave one. **No fuzzy/partial matching in this phase** — flagged as a known limitation, not built speculatively.
5. **`contactEmail`/`contactPhone` are validated in two layers, not one.** The AI extraction schema accepts them as loose, nullable strings (an AI's free-text rendering of "an email" or "a phone number" isn't guaranteed to be strictly well-formed). A separate normalization step then validates each individually against `z.string().email()` / a permissive phone-format regex; a field that fails its own format check is treated as **not provided** (set to `null`) rather than rejecting the entire extraction — a slightly malformed AI guess at an email shouldn't discard an otherwise-good lead capture. The persistence-layer schema (`lib/schemas/lead.ts`) is the actual validation boundary per `docs/security.md` §7's "AI structured outputs" requirement, not the AI's own schema.
6. **The "at least one of email/phone" rule is enforced three times, defense-in-depth style**, matching this project's established pattern (e.g. RLS + application filter, table grants + RLS): (a) application logic in `lib/lead-capture.ts` checks first and returns "no lead created" without even attempting persistence if both are null after normalization; (b) the Zod persistence schema has a `.refine()` requiring at least one; (c) a database `CHECK` constraint on `leads` requires at least one. Any one of these failing is a bug; all three existing is intentional redundancy, not accidental duplication.
7. **`qualification`/`qualification_reason` are two separate database columns**, not one combined field — `PRODUCT.md` §8 describes them as one logical concept ("hot / warm / cold, plus a short AI-written reason") but splitting them into typed columns (`qualification` as a constrained enum, `qualification_reason` as free text) enables filtering/sorting by qualification level later without parsing text. Always populated by the extraction model (not optional) — even a low-signal conversation gets a qualification with an honest reason (e.g. "cold — no clear buying intent expressed").
8. **`status` allows free transitions between all four values via a simple dropdown** on `/dashboard/leads`, not an enforced linear state machine (`new` → `contacted` → `converted`/`lost` describes the *typical* path in `PRODUCT.md` §8, not a hard constraint) — inventing transition-validation rules `PRODUCT.md` doesn't specify would be scope creep.
9. **Lead CRUD authorization: any authenticated org member**, following resolved decision D7's precedent for business-owned records without an explicit stricter role requirement in `PRODUCT.md`. Revisit if a stricter model is ever wanted, same caveat as D7.
10. **No lead re-qualification.** `qualification`/`qualification_reason` are set once at creation from the extraction call and never recomputed — `PRODUCT.md` §8 doesn't ask for ongoing re-scoring, and building it now would be speculative.

## Open decisions this depends on

D6 is resolved (`PRODUCT.md` §8). No other open decision blocks this phase — D4 (widget identity) is Phase 11's concern, not touched here (no public/unauthenticated entry point exists in this phase).

## Dependencies / packages required

None new. Reuses `@langchain/google-genai`'s `withStructuredOutput()` (already installed, Phase 9) and `zod` (already installed).

## Files likely to change

- `supabase/migrations/<ts>_create_conversations_table.sql` — new, minimal stub table (Decision 1).
- `supabase/migrations/<ts>_create_leads_table.sql` — new, full `PRODUCT.md` §8 schema.
- `supabase/tests/database/009_conversations_tenant_isolation.sql`, `010_leads_tenant_isolation.sql` — new pgTAP tests, written per project convention (not necessarily executed — same standing gap as every prior phase).
- `lib/conversations.ts` (new) — `createConversation(businessId, source)`.
- `lib/leads.ts` (new) — `createLead`, `listLeadsForBusiness`, `updateLeadStatus`, tenant-scoped CRUD.
- `lib/schemas/lead.ts` (new) — the persistence-layer Zod schema (Decision 5/6).
- `lib/lead-extraction.ts` (new) — the AI extraction call: `LeadExtractionSchema`, extraction system prompt, `extractLead(businessName, transcript)`.
- `lib/lead-capture.ts` (new) — orchestration: `captureLeadFromConversation(businessId, businessName, source, transcript)`, ties extraction + interest-name resolution + the email/phone gate + persistence together.
- `lib/supabase/types.ts` — add `Conversation`, `Lead` types.
- `app/dashboard/leads-test/{page.tsx,actions.ts,conversation-form.tsx}` (new) — throwaway multi-turn conversation + "extract lead" tool, not wired into nav.
- `app/dashboard/leads/{page.tsx,actions.ts,status-select.tsx}` (new) — minimal lead list with a status dropdown per row, not wired into nav (same Phase 5/6 convention).
- `docs/architecture.md` — new Phase 10 subsection.

## Database changes

**`supabase migration new create_conversations_table`:**
- `public.conversations`: `id uuid primary key default gen_random_uuid()`, `business_id uuid not null references businesses(id) on delete cascade`, `source text`, `created_at timestamptz not null default now()`.
- Index on `business_id`.
- RLS enabled + forced. Two policies: `select`, `insert`, both scoped via the same `business_id in (select id from businesses where clerk_org_id = (select auth.jwt()) -> 'o' ->> 'id')` join-through-`businesses` pattern as `products`/`services`/`faqs`/`knowledge_documents`. No `update`/`delete` policy — this phase never modifies or removes a conversation row.
- Grants: `authenticated` = `SELECT, INSERT` only. `anon` = none (inherits zero by default per the Phase 3 `ALTER DEFAULT PRIVILEGES` fix — verify live after applying, per the standing "verify actual grants" rule in `docs/architecture.md`).

**`supabase migration new create_leads_table`:**
- `public.leads`: `id uuid primary key default gen_random_uuid()`, `business_id uuid not null references businesses(id) on delete cascade`, `conversation_id uuid not null references conversations(id) on delete cascade`, `contact_name text`, `contact_email text`, `contact_phone text`, `interest_type text check (interest_type in ('product','service','general'))`, `interest_id uuid` (no FK — app-enforced, matching Phase 6's `knowledge_documents.source_id` precedent per `PRODUCT.md` §8), `notes text`, `qualification text not null check (qualification in ('hot','warm','cold'))`, `qualification_reason text not null`, `status text not null default 'new' check (status in ('new','contacted','converted','lost'))`, `source text`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` with the existing `set_updated_at()` trigger reused.
- `check (contact_email is not null or contact_phone is not null)` — the database-level layer of Decision 6's three-layer rule.
- Indexes on `business_id`, `conversation_id`.
- RLS enabled + forced, four policies (select/insert/update/delete), same join-through-`businesses` pattern.
- Grants: `authenticated` = `SELECT, INSERT, UPDATE, DELETE`; `anon` = none. Verify live after applying.

## Server / client boundaries

- `lib/conversations.ts`, `lib/leads.ts`, `lib/lead-extraction.ts`, `lib/lead-capture.ts` are all `server-only`.
- `GEMINI_API_KEY` stays inside `lib/lead-extraction.ts`, never reaches a client component.
- `/dashboard/leads-test`/`/dashboard/leads` are Server Components posting to Server Actions — no new client-exposed endpoint.

## Implementation requirements

1. **`LeadExtractionSchema`** (Zod, `lib/lead-extraction.ts`): `contactName: z.string().nullable()`, `contactEmail: z.string().nullable()`, `contactPhone: z.string().nullable()`, `interestType: z.enum(["product","service","general"]).nullable()`, `interestName: z.string().nullable()`, `notes: z.string().nullable()`, `qualification: z.enum(["hot","warm","cold"])`, `qualificationReason: z.string()` — each with a short `.describe()`.
2. **Extraction system prompt**: given `businessName` and the full transcript (`ConversationMessage[]`, reused type), instruct the model to extract only what the prospect actually volunteered — never invent a name/email/phone/interest that wasn't said; `qualification`/`qualificationReason` always required, based on genuine buying-intent signals in the transcript; if the prospect gave no contact info, all three contact fields should be `null` (the pipeline handles the "no lead" outcome, not the model).
3. **`extractLead(businessName, transcript)`** (`lib/lead-extraction.ts`): invokes `getChatModel()` (reuse the same construction as `lib/rag.ts`, or factor out a shared helper if trivial — implementer's call, flag if factored) with `.withStructuredOutput(LeadExtractionSchema, { name: "LeadExtraction" })`, returns the parsed result. Errors wrapped in `AppError`, same pattern as `lib/rag.ts`.
4. **Interest resolution** (`lib/lead-capture.ts`): given `businessId`, `interestType`, `interestName`, if `interestType` is `"product"` query `products` where `business_id = businessId and lower(name) = lower(interestName)` limit 1 (same for `"service"`/`services`); a match's `id` becomes `interest_id`; no match or `interestType` is `null`/`"general"` → `interest_id` stays `null`.
5. **Contact-field normalization** (`lib/lead-capture.ts` or `lib/schemas/lead.ts`): validate `contactEmail` against `z.string().email()` and `contactPhone` against a permissive phone regex individually; a failing field becomes `null` rather than failing the whole flow (Decision 5).
6. **`captureLeadFromConversation(businessId, businessName, source, transcript)`** (`lib/lead-capture.ts`):
   - Calls `extractLead()`, normalizes contact fields, resolves `interest_id`.
   - If both `contactEmail` and `contactPhone` are `null` after normalization, return `{ created: false }` — **no `conversations` row and no `leads` row are created** (a conversation stub with no lead attached would be dead weight with nothing pointing at it yet).
   - Otherwise: create the `conversations` row (`createConversation(businessId, source)`), Zod-validate the full lead payload (`lib/schemas/lead.ts`, including the `.refine()` from Decision 6), insert via `createLead()`, return `{ created: true, lead }`.
   - Any thrown error from any step is allowed to propagate as the existing `AppError`/`logAndGetUserMessage` pattern already handles at the Server Action boundary.
7. **`/dashboard/leads-test`**: a client component maintains `messages: ConversationMessage[]` in local state; each submit calls a Server Action wrapping `askSalesEmployee(businessId, businessName, question, messages)` (passing the accumulated history — Phase 9's parameter, finally exercised), appends both the user question and assistant answer to `messages`, and re-renders the running transcript. A separate "End conversation & extract lead" button calls a second Server Action wrapping `captureLeadFromConversation()` with the accumulated `messages` and an optional `source` text input, displaying either the created lead's key fields or "No lead created — no contact details were given."
8. **`/dashboard/leads`**: lists this business's leads (`listLeadsForBusiness`), showing contact info, interest, qualification + reason, notes, source, and a `status` dropdown per row wired to `updateLeadStatus()`. Same "not in dashboard nav" convention as every prior phase's minimal page. **`updateLeadStatus(businessId, leadId, status)` follows `lib/products.ts`'s exact `updateProduct()` contract**: filtered by both `business_id` and `id`, returns `boolean` (affected-or-not) rather than throwing or distinguishing "not found" from "belongs to another tenant" — a cross-tenant attempt silently affects zero rows and returns `false`, exactly like every other update/delete function in this project (`docs/architecture.md`'s established "no existence information leaks" pattern), not a new or different behavior.

## Security requirements

- Tenant scoping: `businessId` from `requireBusinessContext()` only, every query explicitly filtered in addition to RLS (`docs/security.md` §1, §7, §9).
- AI output is untrusted (`AGENTS.md` §3 rule 5, `docs/security.md` §8): `interestName` is never used as a raw ID — always resolved through a validated, tenant-scoped exact-match lookup (Decision 4); `qualification`/`qualificationReason` are display-only, never used to gate anything security-relevant.
- All extracted fields pass through Zod at the true persistence boundary (`lib/schemas/lead.ts`), per `docs/security.md` §7's explicit callout that AI structured outputs need the same validation discipline as any other external input.
- No secret reaches the client: `GEMINI_API_KEY` stays inside `lib/lead-extraction.ts`.

## Error handling

- **Extraction/chat failure:** wrapped in `AppError` with the existing safe generic message, same pattern as Phase 8/9.
- **No contact info given:** not an error — `captureLeadFromConversation()` returns `{ created: false }`, and the UI shows a plain "no lead created" message, not a failure state.
- **Persistence validation failure** (should be unreachable given Decision 5/6's normalization, but defense-in-depth): the Zod `.refine()`/DB `CHECK` failing surfaces as a safe generic error, logged server-side with the real cause.
- **Invalid question input on `/dashboard/leads-test`:** same Zod-at-the-boundary pattern as `/dashboard/ai-test`.

## Acceptance criteria

- [ ] A multi-turn test conversation on `/dashboard/leads-test` where the prospect volunteers a name, email, and a specific product interest produces a `leads` row with all of those fields correctly populated and `interest_id` correctly resolved to that real product's UUID.
- [ ] A conversation where the prospect gives a phone number but no email still creates a lead (only one of the two is required).
- [ ] A conversation where the prospect gives neither email nor phone produces `{ created: false }` — no `conversations` row, no `leads` row.
- [ ] `qualification`/`qualificationReason` are populated and plausible for a conversation showing clear buying intent, and honestly low/uncertain for one that doesn't.
- [ ] An `interestName` that doesn't match any real product/service by exact name leaves `interest_id` null while still recording `interest_type` if given.
- [ ] Cross-tenant isolation holds: Business A's leads/conversations are never visible to Business B via `/dashboard/leads` or any query.
- [ ] `/dashboard/leads`'s status dropdown correctly updates a lead's `status` for its own business. For a lead belonging to another business, `updateLeadStatus()` returns `false` (zero rows affected, via RLS + the explicit `business_id`/`id` filter) rather than throwing or otherwise distinguishing "not found" from "belongs to another tenant" — the same silent-no-op contract as `updateProduct()`/`deleteProduct()` in `lib/products.ts`, not a new pattern.
- [ ] `npm run lint` passes with zero errors/warnings.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run build` passes, both new routes compile and appear in the route manifest.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- pgTAP tests written (`009_conversations_tenant_isolation.sql`, `010_leads_tenant_isolation.sql`) per convention; `supabase test db` itself is the same standing not-yet-executed gap as every prior phase, superseded by manual live verification.

## Manual testing steps

1. On `/dashboard/leads-test`, hold a multi-turn conversation as a prospect interested in a real product from that business's catalog, volunteering a name and email partway through. End the conversation and extract. Confirm the created lead on `/dashboard/leads` shows the correct name, email, `interest_type: product`, and `interest_id` matching that real product's row.
2. Repeat with a phone number instead of an email — confirm a lead is still created.
3. Repeat with no contact info volunteered at all — confirm "no lead created," and confirm directly (SQL or Dashboard) that no `conversations` or `leads` row was written for that attempt.
4. Have a conversation mentioning a product name that doesn't exist in the catalog (e.g. a typo or made-up name) — confirm `interest_type` is still recorded if the model inferred one, but `interest_id` is `null`.
5. Have a clearly high-intent conversation (asking about pricing, wanting to buy soon) vs. a vague browsing one — confirm `qualification` and `qualificationReason` plausibly differ between the two.
6. **Cross-tenant:** create leads for two different test businesses, then confirm `/dashboard/leads` for Business A never shows Business B's leads, and attempting to update Business B's lead status while authenticated as Business A fails.
7. Update a lead's status through all four values on `/dashboard/leads` — confirm each persists and is reflected on reload.

## Out of scope

- The real chat API, message persistence, rate limiting, widget key resolution — Phase 11. This phase's `conversations` table is a minimal stub Phase 11 will extend, not the final shape.
- Public/unauthenticated access of any kind — this phase's tools are authenticated-dashboard-only, same as Phase 8/9's.
- Fuzzy/partial product-name matching for `interest_id` resolution — exact case-insensitive match only, per Decision 4.
- Lead re-qualification, editing extracted fields beyond `status`, or a state-machine-enforced status flow — Decisions 8/10.
- Dashboard navigation/chrome integration for `/dashboard/leads` — Phase 13, same as every prior minimal page.
- Any lead-facing analytics or export — not specified in `PRODUCT.md`.
