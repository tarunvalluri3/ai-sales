# Phase 11 — Chat API

## Goal

After this is implemented, a prospect's browser can `POST` a chat message to a new public, unauthenticated endpoint carrying a per-business **widget key**; the server resolves that key (with an origin check) to a validated `business_id`, creates or continues a persisted conversation, persists both the prospect's message and the AI's reply, invokes the existing `askSalesEmployee()` pipeline for the response, and enforces rate limiting per key/IP/conversation — all without ever trusting a client-supplied `business_id`. This does not yet include a chat UI (Phase 12) or automatic lead-capture triggering from the widget (not in this phase's scope — see "Out of scope").

## Current phase

Phase 11 — Chat API. Confirmed from `STATE.md` §1/§3.

## User request

Implement Phase 11 per `docs/phases.md`'s scope: business context resolution via the widget key, conversation creation, message handling, invoking the existing `askSalesEmployee()` pipeline, persistence, error handling, and rate/abuse protection. Streaming is explicitly out of scope unless separately approved. Decision D4 (public widget identity mechanism) is now resolved — see `STATE.md` §4 for the full resolved shape this prompt implements.

## Skills and docs read

- `STATE.md` (§1, §2 Phase 10 entry, §4 resolved D4, §5, §6, §7, §8)
- `PRODUCT.md` (§3 actors, §5 target workflow, §7 AI behavior contract, §8 lead model)
- `docs/phases.md` (Phase 11 section)
- `docs/security.md` (§1 multi-tenancy, §2 authentication, §3 database/RLS, §4 public chat widget, §5 env vars, §7 untrusted input, §9 retrieval isolation, §10 error handling)
- `docs/architecture.md` (Database section; "AI orchestration" section; "Lead extraction (Phase 10)" subsection, especially its `conversations` stub note)
- `docs/prompt-template.md` (this file's own contract)
- `.claude/skills/supabase/`, `.claude/skills/supabase-postgres-best-practices/` — not opened this session; the migrations below are straightforward extensions of already-established patterns (RLS join-through-`businesses`, explicit per-function privilege revokes) and don't need new guidance beyond what's already documented in `docs/architecture.md`. Flag for the implementing session to skim `supabase-postgres-best-practices` before writing the rate-limit function, since atomic upsert-increment functions are a pattern this project hasn't used yet.

## Existing code inspected

- `lib/business-context.ts` — `requireBusinessContext()`, the Clerk-session `{ userId, businessId, businessName }` resolver. Not usable on the widget path (no Clerk session exists for a prospect) — this phase's `resolveBusinessFromWidgetKey()` is the widget-path analog.
- `lib/business.ts` — `getBusinessForOrg()`/`createBusinessForOrg()`, both using `createServerSupabaseClient()` (Clerk-session client). `createBusinessForOrg()` does not set `widget_key` explicitly; the new column's DB-level default handles that.
- `lib/supabase/server.ts` — `createServerSupabaseClient()`, builds a **new client per call**, authenticated via Clerk's `accessToken` callback. This cannot authenticate a request with no Clerk session, which is exactly the widget's situation.
- `lib/conversations.ts` — `createConversation(businessId, source)`, currently hardcoded to `createServerSupabaseClient()` internally. Only caller today is `lib/lead-capture.ts`.
- `lib/leads.ts`, `lib/lead-capture.ts`, `lib/lead-extraction.ts` — Phase 10's lead pipeline. `lib/lead-capture.ts`'s `captureLeadFromConversation()` currently creates its own conversation row lazily. Not modified by this prompt except the one call-site change noted below (client injection) — lead-capture triggering from the widget stays out of scope (see "Out of scope").
- `lib/rag.ts` — `askSalesEmployee(businessId, businessName, question, history?)`, `ConversationMessage` type (`{ role: "user" | "assistant"; content: string }`), `FALLBACK_MESSAGE`. This is the single entry point this phase's route handler calls. Unchanged by this phase.
- `lib/supabase/types.ts` — hand-written per-table types. `Business` needs two new fields; `Conversation` is unchanged in shape (Phase 10's stub, reused as-is per `docs/architecture.md`'s note that "Phase 11 extends this table with the real contract rather than replacing it" — in practice that means *messages* are new, not a change to `conversations`' own columns).
- `lib/errors.ts`, `lib/api-response.ts` — `AppError`/`logAndGetUserMessage`, `jsonSuccess`/`jsonError`. Reused as-is.
- `app/api/health/route.ts` — the only existing route handler; establishes the "Zod schema colocated in the file, `jsonSuccess`/`jsonError`, catch-and-convert via `AppError`" convention this phase's route follows.
- `docs/architecture.md`'s "Authentication" section — confirms non-document requests (Route Handlers) get a `404` from `auth.protect()` on an unauthenticated caller, which is irrelevant here since this route deliberately never calls `auth.protect()`/`requireAuthContext()` at all — it is the one intentionally public endpoint in the app, per `docs/security.md` §4.
- Migration files under `supabase/migrations/` for the `businesses`, `conversations`, and `leads` table shapes, to match column/RLS/grant conventions exactly (uuid pk, `business_id` fk on delete cascade, `set_updated_at()` trigger reuse where a table has `updated_at`, explicit function-level `revoke ... from anon, authenticated` per the Phase 7 standing rule).

## Relevant existing architecture

- No ORM; hand-authored imperative Supabase migrations are the schema source of truth.
- RLS-first tenant isolation (D2) plus application-layer `business_id` filtering as defense in depth — **except** on the widget's own request path, where there is no Clerk session for RLS to key off of at all. On that path, the service-role client bypasses RLS entirely, so the application-layer `business_id` filter becomes the *only* tenant boundary, not defense-in-depth on top of RLS. This is a deliberate, narrow exception, consistent with `docs/security.md` §3's own framing of the service role as reserved for "narrow, deliberate operations."
- Every new Postgres function needs its own explicit least-privilege grant/revoke, verified live — no schema-wide safety net exists for functions (Phase 7/`docs/architecture.md`'s standing rule, born from the abandoned schema-wide fix).
- New tables get zero default `anon`/`authenticated` grants (Phase 3's `ALTER DEFAULT PRIVILEGES`) — each table's own migration opens exactly the access it needs.
- Route handlers stay thin; Zod schemas colocated with the boundary they validate; responses always through `jsonSuccess`/`jsonError`; errors always converted through `AppError`/`logAndGetUserMessage` before reaching the client.
- `lib/` modules are `server-only`, one concern per module (AI orchestration / database access / orchestration-that-ties-them-together kept separate — `AGENTS.md` §9).

## Decisions and assumptions

1. **Widget key generation: automatic at business creation, via a DB column default (`default gen_random_uuid()`), not application code.** Matches the resolved D4 outcome ("generated at business creation"). A single v4 UUID (122 bits of entropy) is adequate for a *publishable* identifier — the same trust class as a Stripe publishable key, not a bearer secret — consistent with `docs/security.md` §4 ("Publishable key values are safe client-side; any secret paired with them is not"). Existing businesses (created before this migration) get a value backfilled automatically, since Postgres evaluates a volatile column default per row during the `ALTER TABLE ... ADD COLUMN` rewrite.
2. **`widget_allowed_origin` starts `null` and the widget fails closed until it's set.** No business can receive widget traffic until an owner explicitly configures an allowed origin via the new minimal dashboard page. This is safer than defaulting to any value and matches the resolved D4 wording ("checked against the request's Origin/Referer header server-side before the key is resolved").
3. **A new, minimal, un-navigated `/dashboard/widget-settings` page** (same convention as `/dashboard/ai-test`, `/dashboard/leads-test`) displays the business's `widget_key` (read-only) and a form to set/update `widget_allowed_origin`. Key rotation/regeneration is explicitly not built — matches the resolved decision's "no key rotation/multiple-keys support for v1." Column-level `UPDATE` grant restricted to `widget_allowed_origin` only (`grant update (widget_allowed_origin) on businesses to authenticated;`), so this RLS/grant path cannot be used to rename the business or touch `widget_key`.
4. **A new service-role Supabase client, `lib/supabase/service.ts`.** This is the first time the app needs one — every prior phase deferred it. The widget request path has no Clerk session, so `createServerSupabaseClient()` cannot authenticate it; RLS itself has nothing to key off of for an anonymous request. `SUPABASE_SECRET_KEY` becomes a required env var starting this phase (it was "planned, not yet required" since Phase 3). This client is used **only** by the widget's own code path (`lib/widget-auth.ts`, and the service-role branch of the DB-access functions below) — never by any dashboard/Clerk-session code.
5. **DB-access functions (`lib/conversations.ts`'s `createConversation`, and new `lib/messages.ts`) take the Supabase client as an explicit parameter, instead of constructing one internally.** This lets both the Clerk-authenticated dashboard path (existing `lib/lead-capture.ts` call) and the new service-role widget path share one query implementation per table, rather than duplicating queries in two files. `lib/lead-capture.ts`'s one call site is updated to pass `createServerSupabaseClient()` explicitly — this is the only behavior-preserving change needed there; lead-capture logic itself is untouched.
6. **Rate limiting: a single generic `rate_limit_counters` table**, fixed-window counting (`scope`, `identifier`, `window_start`, `request_count`), incremented atomically via one Postgres function (`increment_rate_limit_counter`) to avoid a read-then-write race. Three scopes used by the route handler: `ip`, `key` (the widget key), `conversation`. Limits are hardcoded constants in `lib/rate-limit.ts` (no config UI exists yet, and none is asked for): IP 30 requests / 5 minutes, key 120 requests / 5 minutes, conversation 20 requests / 5 minutes. These are a reasonable, adjustable-later starting point, not a tuned/product-specified value — flag as an assumption.
7. **`rate_limit_counters` gets RLS enabled and forced with zero policies** (deny-all for `anon`/`authenticated`; only the service role, which bypasses RLS, ever touches it) — consistent with "every table gets RLS," even though it holds no business-owned data and needs no `business_id` column (identifiers are IPs, widget keys, and conversation ids, none of which are themselves tenant-scoped rows).
8. **A new `messages` table**, business-owned (`business_id` fk), holding both prospect and AI turns (`role` check `user`/`assistant`, `content`, `conversation_id` fk). Gets the full RLS/grant shape used by every prior business-owned table, but with `authenticated` granted `SELECT` only (for a future Phase 13 dashboard conversation view) — no `INSERT`/`UPDATE`/`DELETE` grant to `authenticated`, since only the service-role widget path writes messages in v1 (`docs/architecture.md`'s existing "any authenticated member" precedent, D7, applies to structured business data like products/services/FAQs, not to writing into a live AI conversation — no request has asked for dashboard members to inject widget messages, and Phase 15 (human handoff) is the natural home for that if it's ever wanted).
9. **Conversation and message persistence happens unconditionally, on every request, regardless of whether a lead is ever captured** — a deliberate change from Phase 10's lazy, lead-triggered `conversations` row creation. `docs/architecture.md`'s Phase 10 note already anticipated this: "If it's ever wanted, it requires persisting a conversation row regardless of outcome — a decision for whenever Phase 11's real conversation/message model lands." This phase is that decision.
10. **A returning `conversationId` from the client must belong to the resolved `business_id`, or the request is rejected with a generic 400** — never silently reattached to a different business, and the error message doesn't distinguish "conversation belongs to another business" from "conversation doesn't exist," to avoid leaking cross-tenant existence information (same posture as `lib/leads.ts`'s `updateLeadStatus()` not distinguishing "not found" from "wrong tenant").
11. **Origin validation: exact string match** against the stored `widget_allowed_origin`, checked against the request's `Origin` header first, falling back to the origin portion of `Referer` if `Origin` is absent (some legitimate same-origin POSTs omit `Origin`). If neither header is present, or neither matches, the request is rejected. No wildcard/subdomain matching in v1 — an exact origin string, matching the resolved decision's "one allowed origin per business."
12. **CORS is handled as a browser-compatibility concern, not the security boundary.** `Access-Control-Allow-Origin: *` is set on every response from this route (success and error alike), since the request carries no cookies/Clerk session (no credentialed-CORS risk), and the *actual* authorization check is the server-side stored-origin comparison in `lib/widget-auth.ts`, which happens regardless of what the browser's CORS policy would have allowed. An `OPTIONS` handler is added for the browser's preflight request.
13. **The public response body is deliberately minimal**: `{ conversationId, answer, escalate }`. No `sourceChunkIds`, `usedContext`, or `escalationReason` are returned to the prospect — those are useful for the dashboard's own debugging pages (`/dashboard/ai-test`, `/dashboard/leads-test`), not for an anonymous website visitor, and `escalationReason` in particular is AI-written commentary aimed at the business, not phrased for the prospect.
14. **Message length bound: 1–2000 characters, trimmed** — matches the existing bound already used in `app/dashboard/ai-test/actions.ts` for the same kind of free-text question input, rather than inventing a new number.
15. **History passed to `askSalesEmployee()` is the conversation's prior messages, most-recent-last, capped at the last 20 messages** — bounds the prompt size for a long-running conversation. 20 is an assumption (no product requirement specifies a number); flag as adjustable later, same as the rate-limit constants.
16. **Lead-capture is explicitly not triggered from this endpoint.** `docs/phases.md`'s Phase 11 scope list does not mention lead extraction/creation, and its exit criterion is about the chat endpoint alone. Wiring a widget conversation to `captureLeadFromConversation()` needs a defined trigger (explicit "end conversation" signal? idle timeout? every N turns?) that isn't specified anywhere yet and would be scope creep to invent here. See "Out of scope."
17. **No stale `rate_limit_counters` row cleanup job.** Rows accumulate indefinitely. Acceptable for now (small rows, fixed-window keys naturally stop growing once traffic to an old window stops), but flagged as a known gap — a cleanup job (cron or otherwise) is future work, not specified by any phase yet.

## Open decisions this depends on

None. D4 is resolved as of this session (`STATE.md` §4).

## Dependencies / packages required

None. No rate-limiting library, no CORS package — hand-rolled per this project's "no new infra unless justified" discipline (already the pattern for `lib/chunking.ts` in Phase 6). `crypto.randomUUID()`/`gen_random_uuid()` and the existing `@supabase/supabase-js` client are sufficient.

## Files likely to change

**New migrations** (`supabase/migrations/`, exact timestamps via `npx supabase migration new <name>`):
- `add_widget_columns_to_businesses` — adds `widget_key uuid not null default gen_random_uuid() unique`, `widget_allowed_origin text null` to `businesses`; adds an `UPDATE` RLS policy (org-match, same shape as the existing `SELECT`/`INSERT` policies) plus a column-level `grant update (widget_allowed_origin) on businesses to authenticated;`.
- `create_messages_table` — `public.messages` (`id` uuid pk, `business_id` uuid fk → `businesses.id` on delete cascade, `conversation_id` uuid fk → `conversations.id` on delete cascade, `role` text check (`user`/`assistant`), `content` text not null, `created_at` timestamptz default now()). Indexed on `(business_id, conversation_id, created_at)`. RLS enabled + forced, one `SELECT` policy (org-match via `business_id`, same join-through-`businesses` shape as `products`/`knowledge_documents`). Grant: `authenticated` = `SELECT` only. No `INSERT`/`UPDATE`/`DELETE` grant to `authenticated` or `anon` (only the service role writes, and it bypasses grants).
- `create_rate_limit_counters_table` — `public.rate_limit_counters` (`id` uuid pk, `scope` text check (`ip`/`key`/`conversation`), `identifier` text not null, `window_start` timestamptz not null, `request_count` int not null default 1, unique (`scope`, `identifier`, `window_start`)). RLS enabled + forced, zero policies.
- `create_increment_rate_limit_counter_function` — `public.increment_rate_limit_counter(p_scope text, p_identifier text, p_window_seconds int) returns int`, `security invoker`, atomically upserts and returns the new `request_count` for the current fixed window. Explicit `revoke execute on function ... from public, anon, authenticated;` and `grant execute ... to service_role;` in the same migration, verified live via `has_function_privilege()` per the Phase 7 standing rule.
- `supabase/tests/database/011_messages_tenant_isolation.sql` — pgTAP, same shape as `009_conversations_tenant_isolation.sql`/`010_leads_tenant_isolation.sql` (written, not required to be executed this phase, per the existing standing gap — covered by manual live verification instead, same as every prior phase).

**New `lib/` files:**
- `lib/supabase/service.ts` — `createServiceSupabaseClient()`, `server-only`, built from `SUPABASE_SECRET_KEY`. Doc-commented as bypassing RLS entirely and restricted to the widget request path.
- `lib/widget-auth.ts` — `WidgetAuthError`, `resolveBusinessFromWidgetKey(key: string, origin: string | null): Promise<{ businessId: string; businessName: string }>`.
- `lib/rate-limit.ts` — `checkAndIncrementRateLimit(scope: "ip" | "key" | "conversation", identifier: string, limit: number, windowSeconds: number): Promise<boolean>` (calls the RPC, returns whether the request is allowed).
- `lib/messages.ts` — `createMessage(supabase, businessId, conversationId, role, content)`, `listRecentMessages(supabase, businessId, conversationId, limit)`.

**Modified:**
- `lib/conversations.ts` — `createConversation` takes the Supabase client as its first parameter; adds `getConversationForBusiness(supabase, businessId, id)`.
- `lib/lead-capture.ts` — updates its one `createConversation(...)` call site to pass `createServerSupabaseClient()` explicitly. No other change.
- `lib/business.ts` — no functional change; `createBusinessForOrg`'s insert doesn't need to set `widget_key` (DB default handles it), but its `.select()` will now return the new columns since it selects `*`.
- `lib/supabase/types.ts` — `Business` gains `widget_key: string; widget_allowed_origin: string | null;`. New `Message` type. New `RateLimitScope`/`RateLimitCounter` types if useful for `lib/rate-limit.ts`'s internals (optional, implementer's call).
- `.env.example`, `docs/security.md` §5 — add `SUPABASE_SECRET_KEY` as required, **secret**, server-only.

**New route:**
- `app/api/chat/route.ts` — `POST` and `OPTIONS` handlers.

**New minimal dashboard page** (un-navigated, same convention as `/dashboard/ai-test`):
- `app/dashboard/widget-settings/page.tsx` — `requireBusinessContext()`-protected, shows `widget_key` (read-only, with the full snippet's key value visible for copy-paste) and the current `widget_allowed_origin`.
- `app/dashboard/widget-settings/actions.ts` — Server Action, Zod-validates the origin is a canonical `scheme://host[:port]` string (via `new URL(value).origin === value`), updates `widget_allowed_origin`.

**Docs:**
- `docs/architecture.md` — new "Public chat widget (Phase 11)" subsection documenting the service-role exception, the widget-auth/rate-limit flow, and the messages/rate_limit_counters table shapes.

## Database changes

Four new migrations, applied via `npx supabase db push --linked` after `npx supabase migration new <name>` for each, in this order (later ones depend on `messages`/`conversations` existing):

1. `add_widget_columns_to_businesses`
2. `create_messages_table`
3. `create_rate_limit_counters_table`
4. `create_increment_rate_limit_counter_function`

Exact grant/RLS shapes are specified per-table in "Files likely to change" above. After push, verify actual grants live (per `docs/architecture.md`'s standing rule) for all three new/changed objects — `businesses` (confirm the new column-level `UPDATE` grant is scoped to `widget_allowed_origin` only, not full-row `UPDATE`), `messages` (`authenticated` = `SELECT` only, `anon` = none), and `increment_rate_limit_counter` (`service_role` = `EXECUTE`, `anon`/`authenticated`/`PUBLIC` = none, via `has_function_privilege()`).

## Server / client boundaries

- `app/api/chat/route.ts` is a Route Handler — server-only by construction, but note it is the **first genuinely public, unauthenticated endpoint** in the app. It must never call `requireAuthContext()`/`auth.protect()`.
- `lib/supabase/service.ts`'s client uses `SUPABASE_SECRET_KEY` — never imported into, or its output passed to, any client component. It is only ever constructed inside this route handler's call chain (`lib/widget-auth.ts`, `lib/rate-limit.ts`, `lib/conversations.ts`/`lib/messages.ts` when called with it).
- `SUPABASE_SECRET_KEY` is a new secret — never logged, never in a `NEXT_PUBLIC_*` variable, never sent in any response body.
- The widget key itself is **not secret** — it is meant to be embedded in a prospect-facing web page's client-side script (that is its entire purpose). It authorizes nothing on its own; the origin check is what prevents a lifted key from being replayed elsewhere.
- The new `/dashboard/widget-settings` page/Server Action are protected by `requireBusinessContext()`, same as every other dashboard page.

## Implementation requirements

1. `lib/supabase/service.ts` exports `createServiceSupabaseClient()` — `server-only`, `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY)`, no `accessToken` callback (service role doesn't need one). Doc comment states explicitly: bypasses RLS, restricted to the widget path.
2. `lib/widget-auth.ts`'s `resolveBusinessFromWidgetKey(key, origin)`:
   - Uses `createServiceSupabaseClient()`.
   - Queries `businesses` by `widget_key = key`, selecting `id, name, widget_allowed_origin`.
   - Throws `WidgetAuthError` (generic message, no detail on *which* check failed) if: no row matches; `widget_allowed_origin` is `null`; `origin` is `null`; or `origin !== widget_allowed_origin`.
   - Returns `{ businessId, businessName }` on success.
3. `lib/rate-limit.ts`'s `checkAndIncrementRateLimit(scope, identifier, limit, windowSeconds)` calls `supabase.rpc("increment_rate_limit_counter", { p_scope: scope, p_identifier: identifier, p_window_seconds: windowSeconds })` via the service-role client, and returns `count <= limit`. The RPC call always increments, even on requests that end up rejected for the current window (so retries can't reset the count) — this is intentional, not a bug to fix later.
4. `app/api/chat/route.ts`:
   - Colocated Zod schema: `{ widgetKey: z.string().uuid(), conversationId: z.string().uuid().optional(), message: z.string().trim().min(1).max(2000) }`.
   - `OPTIONS` handler returns 204 with `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`.
   - `POST` handler, in order:
     a. Parse/validate the JSON body; on failure, `jsonError("Invalid request.", 400)`.
     b. Extract `ip` from `x-forwarded-for` (first entry, trimmed) or fall back to a fixed placeholder string if absent; extract `origin` from the `Origin` header, or the origin portion of `Referer` if `Origin` is absent, or `null` if neither is present.
     c. Rate-limit check, scope `"ip"`: reject with `jsonError("Too many requests.", 429)` on failure.
     d. `resolveBusinessFromWidgetKey(widgetKey, origin)` inside a `try`/`catch` for `WidgetAuthError` → `jsonError("Invalid request.", 401)` (same generic message as a body-validation failure — do not distinguish invalid key from origin mismatch in the response).
     e. Rate-limit check, scope `"key"`, identifier = `widgetKey`: reject with 429 on failure.
     f. Resolve the conversation: if `conversationId` given, `getConversationForBusiness(serviceClient, businessId, conversationId)` — if not found, `jsonError("Invalid request.", 400)`. If not given, `createConversation(serviceClient, businessId, "chat_widget")`.
     g. Rate-limit check, scope `"conversation"`, identifier = the conversation's id: reject with 429 on failure.
     h. `listRecentMessages(serviceClient, businessId, conversationId, 20)` for history (chronological order, mapped to `ConversationMessage[]`), **before** inserting the current turn.
     i. `createMessage(serviceClient, businessId, conversationId, "user", message)`.
     j. `askSalesEmployee(businessId, businessName, message, history)` inside a `try`/`catch` — on `AppError`, `jsonError(error.userMessage, 500)` via `logAndGetUserMessage`. The user's message row is already persisted at this point even if generation fails; do not roll it back (a normal database write; conversations legitimately contain turns that got no reply due to a transient provider failure).
     k. `createMessage(serviceClient, businessId, conversationId, "assistant", response.answer)`.
     l. `jsonSuccess({ conversationId, answer: response.answer, escalate: response.escalate })`, with `Access-Control-Allow-Origin: *` on this response too (and on every error response above).
5. `lib/conversations.ts`: `createConversation(supabase, businessId, source)` — same insert as today, just taking `supabase` as a parameter instead of constructing it. `getConversationForBusiness(supabase, businessId, id)` — `select` filtered by both `id` and `business_id`, `.maybeSingle()`, returns `Conversation | null`.
6. `lib/messages.ts`: `createMessage(supabase, businessId, conversationId, role, content)` — insert, throws `AppError` on failure (same convention as every other `lib/` CRUD module). `listRecentMessages(supabase, businessId, conversationId, limit)` — `select` filtered by `business_id` and `conversation_id`, ordered `created_at` **descending**, limited to `limit`, then the result array **reversed back to ascending order** before mapping to `ConversationMessage[]` (`role` as stored, `content` as stored). Ordering ascending-then-limiting would return the *oldest* messages in a conversation past `limit` turns, not the most recent ones — the descending-limit-then-reverse sequence is required to actually satisfy Decision #15's "most-recent-last, capped at the last 20."
7. `app/dashboard/widget-settings/page.tsx`: `requireBusinessContext()`, then a fresh `getBusinessForOrg(orgId)` (or reuse the context's data if `BusinessContext` is extended — implementer's call, but do not invent new fields on `BusinessContext` beyond what's needed) to read `widget_key`/`widget_allowed_origin`. Renders the key read-only and a form for the origin.
8. `app/dashboard/widget-settings/actions.ts`: Server Action, `"use server"`, Zod-validates the submitted origin string (`z.string().refine((v) => { try { return new URL(v).origin === v; } catch { return false; } })`), calls `requireBusinessContext()`, updates `businesses.widget_allowed_origin` for that `businessId` via the Clerk-session client (relying on the new column-level grant + RLS `UPDATE` policy — no widening beyond that column).

## Security requirements

- `docs/security.md` §4 in full: widget key resolved server-side only, origin allowlist checked before resolution, rate limiting per key/IP/conversation, resolved `business_id` is the only one ever used (a `business_id` anywhere in the request body — there isn't one in this schema, but confirm no code path ever reads one if present), the endpoint returns only the resolved business's own data.
- `docs/security.md` §9: retrieval stays tenant-scoped via `askSalesEmployee()`'s existing `businessId` parameter — this phase doesn't touch retrieval itself, only what supplies `businessId` to it.
- `docs/security.md` §7: the request body (`widgetKey`, `conversationId`, `message`) is validated with Zod at the boundary; `message` is prospect-supplied untrusted text, bounded to 2000 characters.
- `docs/security.md` §3: service-role usage here is the "narrow, deliberate operation" case explicitly anticipated — confirm no other code path accidentally imports `lib/supabase/service.ts`.
- `docs/security.md` §6: `SUPABASE_SECRET_KEY` never logged, never client-side.
- `docs/security.md` §10: `WidgetAuthError`/body-validation/rate-limit responses are all generic, safe messages — no internal detail (which specific check failed, whether a key exists at all, whether a conversation exists) leaks in any response body or status-code distinction beyond what's specified above.

## Error handling

| Failure | User-facing behavior |
|---|---|
| Malformed request body | `400`, `{ ok: false, error: "Invalid request." }` |
| Unknown/invalid widget key | `401`, `{ ok: false, error: "Invalid request." }` (same message as an origin mismatch — no distinction) |
| Origin missing or mismatched | `401`, same generic message as above |
| Widget key valid but `widget_allowed_origin` not yet configured | `401`, same generic message as above (fails closed) |
| `conversationId` doesn't belong to the resolved business (or doesn't exist) | `400`, `{ ok: false, error: "Invalid request." }` |
| Rate limit exceeded (any of the three scopes) | `429`, `{ ok: false, error: "Too many requests." }` |
| `askSalesEmployee()` throws (Gemini/provider failure) | `500`, safe message via `logAndGetUserMessage` — user's message is already persisted; no assistant message is persisted |
| Message/conversation persistence itself fails (`AppError` from `lib/messages.ts`/`lib/conversations.ts`) | `500`, safe message via `logAndGetUserMessage` |

## Acceptance criteria

- [ ] Four new migrations applied cleanly; grants verified live for `businesses` (column-scoped `UPDATE`), `messages` (`SELECT`-only for `authenticated`), and `increment_rate_limit_counter` (`service_role`-only `EXECUTE`).
- [ ] A `POST` to `/api/chat` with a valid widget key, matching `Origin` header, and no `conversationId` creates a new conversation, persists the user message, persists the assistant reply, and returns `{ conversationId, answer, escalate }`.
- [ ] A second `POST` reusing the returned `conversationId` (same key/origin) continues the same conversation, and the AI's reply reflects the earlier turn (multi-turn context works — e.g. ask a follow-up that only makes sense given the first message).
- [ ] An invalid/unknown `widgetKey` is rejected with `401` and the generic message.
- [ ] A valid `widgetKey` with a mismatched (or missing) `Origin`/`Referer` is rejected with `401`.
- [ ] A business with `widget_allowed_origin` still `null` (not yet configured via the dashboard) rejects every widget request with `401`.
- [ ] A `conversationId` that belongs to a *different* business (or doesn't exist) is rejected with `400`, and does not attach any new message to the wrong business's data.
- [ ] A forged `business_id` field included in the request body is silently ignored (the response and persisted rows reflect only the widget-key-resolved business).
- [ ] Exceeding the IP, key, or conversation rate limit returns `429` and stops short of calling Gemini or persisting anything for that request.
- [ ] `/dashboard/widget-settings` displays the business's real `widget_key` and lets the owner set `widget_allowed_origin`; a second test business gets a visibly different `widget_key`.
- [ ] Cross-tenant isolation: Business A's widget key/conversation never returns, persists into, or otherwise touches Business B's rows — verified via direct inspection (`messages`/`conversations` rows for both businesses after interleaved widget traffic).
- [ ] `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `supabase test db` remains a standing gap (never executed by anyone across any phase so far) — written (`011_messages_tenant_isolation.sql`) but not required to pass this phase, superseded by the manual verification in "Manual testing steps" below, consistent with every prior phase's closure.

## Manual testing steps

1. Push the four migrations (`npx supabase db push --linked`); confirm no errors.
2. Check grants live (SQL editor or `npx supabase db query --linked`) for `businesses` (confirm `widget_allowed_origin` is column-grant-updatable by `authenticated`, `widget_key` is not), `messages` (`authenticated` = `SELECT` only), and `increment_rate_limit_counter` (`has_function_privilege('authenticated', 'increment_rate_limit_counter(text,text,int)', 'execute')` is `false`; `service_role`'s is `true`).
3. As a signed-in business owner, visit `/dashboard/widget-settings`; note the displayed `widget_key`; set `widget_allowed_origin` to `http://localhost:3000` (or wherever a manual test page will run from).
4. From a plain HTML page (or `curl -H "Origin: http://localhost:3000"`) served/declared at that same origin, `POST /api/chat` with `{ "widgetKey": "<the key>", "message": "What products do you sell?" }`. Confirm `200`, a real grounded `answer`, and a `conversationId`.
5. Re-`POST` with the same `widgetKey` and the returned `conversationId`, asking a follow-up that only makes sense with the first message's context (e.g. "how much does the first one cost?"). Confirm the reply demonstrates it has the earlier turn.
6. Repeat step 4 with a deliberately wrong `Origin` header (or omit it entirely). Confirm `401`.
7. Repeat step 4 with a random/garbage `widgetKey`. Confirm `401`.
8. Repeat step 5 but substitute a `conversationId` that belongs to a *second* test business (created and widget-configured the same way). Confirm `400`, and confirm no message got written to either business's `messages` under the wrong `conversation_id`/`business_id` pairing.
9. Include `"business_id": "<second business's real id>"` as an extra field in a step-4-style request using the first business's `widgetKey`. Confirm the response and persisted rows are still scoped to the first business — the forged field is ignored.
10. Send requests past the configured IP limit (30/5 min) in quick succession from the same origin/IP. Confirm the request eventually returns `429` and that no new `messages`/Gemini call happened for the rejected request (check the terminal running `next dev` — no request/response cycle to Gemini logged for that call).
11. Confirm cross-tenant isolation directly: after steps 4–10, inspect `conversations`/`messages` for both test businesses and confirm each only contains its own rows.

## Out of scope

- **Streaming responses** — explicitly deferred pending separate approval, per the user's instruction and `docs/phases.md`'s "Streaming only if explicitly approved."
- **Lead capture triggering from the widget** — `captureLeadFromConversation()` (Phase 10) exists but nothing in this phase calls it from `/api/chat`. Needs a defined trigger (explicit end-of-conversation signal, idle timeout, turn count, etc.) that no phase has specified yet — a follow-up decision, not assumed here.
- **A GET endpoint to resume/redisplay a conversation's prior messages** — this phase's `POST` returns only the newest turn's answer. A returning prospect's client redisplaying history before sending a new message is a Phase 12 (Chat UI) concern.
- **Widget key rotation/regeneration, or multiple keys per business** — explicitly deferred by the resolved D4 decision until actually needed.
- **`rate_limit_counters` row cleanup/expiry** — rows accumulate indefinitely; no cron/scheduled cleanup exists or is built this phase.
- **Any chat widget frontend/embed script** — Phase 12's job. This phase only proves the API contract via direct HTTP requests.
- **Dashboard conversation/message viewing UI** — `messages`' `SELECT` grant for `authenticated` is added now so Phase 13 doesn't need a schema change, but no page renders it yet.
- **Human takeover of a live conversation** — Phase 15.
