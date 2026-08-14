# Architecture conventions

Established in Phase 0. Extend, don't restructure, in later phases unless a
prompt explicitly proposes a change here.

## Folder layout

No `src/` directory — `app/` sits at the repo root. This was already the
state of the repo when this convention was written, and `tsconfig.json`'s
`@/*` → `./*` path alias assumes it.

- `app/` — routes, layouts, route handlers (App Router).
- `lib/` — server-only shared modules (utilities, error handling, and, from
  Phase 1 on, the data-access layer and AI orchestration code). Every file in
  `lib/` that isn't safe to import into a client component starts with
  `import "server-only";`, so an accidental client import fails the build
  instead of shipping server logic into the browser bundle.
- `components/` — introduced when the first shared UI component exists.
  Not created speculatively.

## Validation

Zod is the required validation library at every runtime boundary
(`AGENTS.md` §2, §9). Installed starting Phase 1, where the first request
flows through a route handler (`app/api/health/route.ts`).

Convention: Zod schemas are colocated with the route handler or server
action that owns the boundary they validate, not centralized in a generic
`lib/validation.ts` grab-bag. A schema shared by more than one boundary can
move to a `lib/` module named for what it validates (e.g.
`lib/schemas/lead.ts`), not a catch-all file.

## Route handler conventions

Established in Phase 1 via `app/api/health/route.ts`. Route handlers:

- Stay thin — parse/validate input, call into `lib/` (or, from Phase 3 on,
  a service module) for any real logic, and shape the response. No business
  logic inline in the handler once such logic exists.
- Validate all input (query params, body, headers) with a Zod schema
  colocated in the same file, per the Validation convention above.
- Return responses through `lib/api-response.ts`'s `jsonSuccess`/`jsonError`
  helpers, so every endpoint shares one JSON envelope shape
  (`{ ok: true, data }` / `{ ok: false, error }`).
- Never let a thrown error reach the client directly — catch it, convert it
  through `lib/errors.ts`'s `AppError` / `logAndGetUserMessage`, and return
  it via `jsonError` with a safe message and an appropriate status code.

## Authentication

Established in Phase 2, migrated to the resource-based pattern immediately
after (see `prompts/clerk-resource-based-auth.md`) once Clerk deprecated
the alternative.

`proxy.ts` (the Next.js 16 network-boundary file) only runs
`clerkMiddleware()` to establish the auth context for downstream `auth()`
calls — it does **not** perform path-based route protection.
`createRouteMatcher` is deprecated by Clerk and is not used.

Every protected Server Component, Route Handler, or Server Action calls
`auth.protect()` directly (or, where Clerk-level identity is also needed,
`lib/auth.ts`'s `requireAuthContext()`, which wraps it) at the top of the
resource. Behavior differs by request type:

- **Document requests (pages):** an unauthenticated visitor is redirected
  to sign-in.
- **Non-document requests (Route Handlers, Server Actions):** an
  unauthenticated caller gets a `404`, not a redirect — plan API error
  handling around this when Phase 11 adds protected routes.

`auth.protect()` also accepts a role/permission check
(`auth.protect({ role: 'org:admin' })`) for authorization, not just
authentication. First used in Phase 4 (`lib/auth.ts`'s `requireAuthContext()`
takes an optional `{ role: "org:admin" }`, used by
`app/onboarding/actions.ts`'s Server Action). `"org:admin"` is Clerk's
default organization-admin role slug, confirmed against the installed
`@clerk/nextjs` 7.7.3 / `@clerk/shared` type definitions before
implementation (not memory).

Confirmed live in Phase 4 by directly replaying the onboarding Server
Action's POST request (captured via browser devtools, per this file's own
guidance above that render-time gating is not a security boundary) under a
signed-in **non-admin** org member's session, bypassing the UI entirely:
`auth.protect({ role: "org:admin" })` rejected the request server-side and
no `businesses` row was created for that member's org — the authorization
check holds independent of the page-level gate. **Honest gap:** the exact
status code / response shape returned to the replayed request was observed
live during this test but not recorded, and is not documented here. If the
precise shape matters later (e.g. building client-side handling for a
role-rejected Server Action), re-run the devtools replay described above
rather than assuming a value.

## Database

Established in Phase 3. No ORM — Supabase migrations under
`supabase/migrations/` are the schema source of truth (imperative, not
declarative: `supabase migration new <name>`, then hand-authored SQL).
Tests live under `supabase/tests/database/` (pgTAP, run via
`supabase test db`).

**Verification fallback when the Supabase Dashboard is unavailable:**
Phase 7 was fully verified (including grant checks and manual RLS/
similarity spot-checks) via `npx supabase db query --linked` instead of
the Dashboard's SQL editor, during a Supabase-side dashboard outage. This
is a viable alternative any time the Dashboard is down or inconvenient —
it runs arbitrary SQL against the linked live project from the CLI, so
every ad hoc verification query this project's phases have used in the
Dashboard's SQL editor (grant checks via `information_schema`,
cross-tenant RLS spot-checks, etc.) works the same way through it.

`lib/supabase/server.ts` exports `createServerSupabaseClient()` —
`server-only`-guarded, builds a **new client per call** authenticated as
the current Clerk session via Supabase's native third-party auth
integration (`accessToken: async () => (await auth()).getToken()`). Never
share one client instance across requests for different users.

Tenant isolation is RLS-first (resolved decision D2, `STATE.md` §4): every
business-owned table has RLS enabled and forced, with a policy scoped to
the caller's Clerk organization, plus an application-layer `business_id`/
tenant-link filter as defense in depth — never rely on application code
alone.

RLS policies read the caller's Clerk identity from `auth.jwt()`. Clerk's
current (v2, since 2025-04-14) session token nests organization claims
under `o`: `(select auth.jwt()) -> 'o' ->> 'id'` for the org id (not the
deprecated flat `org_id`), `(select auth.jwt()) ->> 'sub'` for the user
id. Always wrap `auth.jwt()` in `(select ...)` so Postgres caches it once
per statement instead of calling it per row.

New tables are **not** auto-exposed to Data API roles by default
(`supabase/config.toml`'s `[api] auto_expose_new_tables`) — an explicit
`grant select/insert/update/delete on <table> to authenticated;` is
required in addition to RLS policies, or the policy has nothing to act on.

New tables may also inherit **broader** default privileges than intended,
from a database-level `ALTER DEFAULT PRIVILEGES` set at project
provisioning time — independent of, and not overridden by, any `GRANT` a
migration adds (`GRANT` is additive; it can't revoke a grant that already
exists from another source). This bit `businesses`: `anon` and
`authenticated` both held full CRUD plus `TRUNCATE`/`REFERENCES`/`TRIGGER`
despite the table's migration only explicitly granting `SELECT` to
`authenticated` — RLS still blocked unauthorized row access, but
`TRUNCATE` bypasses RLS entirely (it's not a row-scoped operation), so
this was a real gap, not a cosmetic one (fixed in
`supabase/migrations/20260811145006_tighten_businesses_grants.sql`).
**After applying a migration that creates a table, verify its actual
grants** (Dashboard table permissions view, or `select grantee,
privilege_type from information_schema.role_table_grants where
table_name = '<table>';`) — don't assume the migration's explicit `GRANT`
is the only one in effect.

`supabase/migrations/20260811150450_default_privileges_least_privilege.sql`
closed this at the source: `alter default privileges in schema public
revoke all on tables from anon, authenticated;` means every table created
from that migration onward starts with zero default grants to those
roles, so each table's own migration is what explicitly opens the access
it needs — verified working via a throwaway test table. Still worth a
quick grant check on the first genuinely new table (Phase 5) as
end-to-end confirmation.

A hand-written type per table lives in `lib/supabase/types.ts` (e.g.
`Business`). Switch to `supabase gen types` once there are enough tables
to justify the generation step.

### Business-owned child tables (Phase 5)

`products`, `services`, and `faqs` (Phase 5) are the first tables keyed by
`business_id` rather than `clerk_org_id` directly. Their RLS policies join
through `businesses` to check org ownership:

```sql
business_id in (
  select id from public.businesses
  where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
)
```

Each has four policies (`select`/`insert`/`update`/`delete`), all scoped
this way — **any authenticated member of the owning org**, not just
`org:admin`. This is a deliberate authorization decision, not just an
implementation detail: unlike business creation (Phase 4, gated to
`org:admin` at the application layer), structured-knowledge CRUD has no
owner/member distinction in `PRODUCT.md`'s current role model, so RLS
imposes none either. Revisit if a stricter default is ever wanted — see
the resolved-decision entry in `STATE.md` §4.

Confirmed post-migration (per the standing "verify actual grants" rule
above): `authenticated` = `SELECT, INSERT, UPDATE, DELETE`, `anon` = none,
on all three tables — the first genuinely new tables since the Phase 3
default-privileges fix, closing that phase's "recommended, not required"
follow-up confirmation.

`lib/business-context.ts`'s `requireBusinessContext()` is the
`{ userId, businessId }` helper `docs/security.md` §2 asks for. It wraps
`requireAuthContext()` + `getBusinessForOrg()` and redirects (to
`/session-tasks/choose-organization` or `/onboarding`) rather than
throwing when the caller has no org or no business yet. All Phase 5 data
access resolves `businessId` through it — never from client input.

### Knowledge ingestion (Phase 6)

`knowledge_documents` and `knowledge_chunks` are the first ingestion
tables: the retrievable unit of business knowledge (a document, split
into chunks), with no embedding column yet — Phase 7 adds pgvector
storage. Same RLS/grant shape as `products`/`services`/`faqs` (join
through `businesses` via `business_id`), except `knowledge_chunks` has no
`update` policy or grant — chunks are always deleted and reinserted on a
content change (`lib/knowledge.ts`'s `regenerateChunksForDocument`), never
updated in place, since nothing yet depends on stable chunk IDs across
edits (no embeddings, no chunk-level references).

A `knowledge_documents` row is either `source_type = 'manual'` (pasted/
typed text, entered through `/dashboard/knowledge`, CRUD in
`lib/knowledge.ts`) or generated from a product/service/FAQ row
(`source_type = 'product'/'service'/'faq'`, `source_id` pointing at that
row, kept in sync by `lib/knowledge-sync.ts`). `source_id` has no FK
constraint — it references one of three different tables depending on
`source_type`, which Postgres can't express as a single FK — so integrity
for generated documents is entirely app-enforced: `lib/knowledge-sync.ts`
is the only writer of non-null `source_id` rows, and a unique index on
`(business_id, source_type, source_id)` prevents duplicates per record.
Manual documents (`source_id` always `null`) never collide with each
other or with generated rows under this index, since Postgres never
treats `NULL = NULL` as a match in a unique constraint.

**Fixed post-launch (`20260812143330_fix_knowledge_documents_generated_source_index.sql`):**
the index was originally created as a *partial* index (`where source_type
<> 'manual'`), which broke `syncGeneratedDocument()`'s `upsert({
onConflict: ... })` — Postgres's `ON CONFLICT` inference requires the
inference specification to match a partial index's predicate exactly,
and `supabase-js`'s `upsert()` can only name columns, not a predicate, so
every generated-document sync failed with `42P10`. The index is now
non-partial (see above); do not reintroduce a partial predicate here.

`lib/products.ts`, `lib/services.ts`, and `lib/faqs.ts` each call
`syncGeneratedDocument()` after a successful create/update and
`deleteGeneratedDocument()` after a successful delete, so every
structured record stays reachable by retrieval without a separate manual
step. If the sync call throws, the whole mutation is reported as failed
to the user (the existing `logAndGetUserMessage` catch in each Server
Action already does this) — a structured record is never left silently
out of sync with its generated knowledge document.

Chunking (`lib/chunking.ts`) is a hand-rolled, deterministic, pure text
splitter (paragraph → sentence → hard-cutoff fallback, 1000-char target,
150-char overlap by default) — not LangChain. LangChain is reserved for
Phase 8 (`docs/phases.md`); Phase 6 is pure text splitting with no model
call involved, so pulling in a LangChain package now would be premature
per `AGENTS.md` §9's "install a dependency only when the current phase
needs it."

All ingestion in this phase runs through the existing per-request
Clerk-authenticated Supabase client (`createServerSupabaseClient()`) —
no service-role client was introduced. Every ingestion event happens
synchronously inside the authenticated business member's own Server
Action (they're editing their own knowledge, or their own product/
service/FAQ), so RLS already grants exactly the access needed. A
service-role client is deferred until an actual decoupled/background job
needs one (e.g. a future embedding backfill).

### Embeddings + pgvector (Phase 7)

`pgvector` is enabled (`create extension vector with schema extensions`,
already on `search_path` per `supabase/config.toml`). `knowledge_chunks`
gained a nullable `embedding vector(1536)` column — resolved decision D3
(`STATE.md`): `gemini-embedding-001` truncated from its 3072-dimension
default to 1536, which matches full-3072 MTEB retrieval quality via
Google's MRL truncation, fits under pgvector's 2000-dimension HNSW index
limit with the standard `vector` type (avoiding `halfvec`), and halves
storage/memory versus 3072 at scale. Nullable because chunks created
during Phase 6 (before this column existed) have no embedding yet and
aren't backfilled — they get one the next time their parent document is
saved, same pattern as the Phase 6 index-bug fix. No vector index yet
(`docs/phases.md`: "create the vector index when the data volume
justifies it, not reflexively") — the migration comment documents the
exact `create index ... using hnsw (...)` command for whoever adds it
once justified.

**Critical, easy-to-miss detail:** `gemini-embedding-001` does **not**
auto-normalize truncated (non-3072-dimension) output — this is
documented Google behavior, not an assumption. Skipping normalization
wouldn't throw an error, it would silently distort cosine-similarity
rankings. `lib/embeddings.ts`'s `l2Normalize()` is applied to every
embedding before storage; do not remove it, and do not assume a future
model swap makes it redundant without re-checking that model's own
normalization behavior.

**LangChain client capability finding (Implementation Requirement 1 of
the Phase 7 prompt):** the installed `@langchain/google-genai`'s
`GoogleGenerativeAIEmbeddings` (v2.2.0, inspected directly from its
`.d.ts`) exposes no dimension-control mechanism whatsoever — no
`outputDimensionality` field on the constructor or on `embedQuery`/
`embedDocuments`. Its own underlying dependency, the legacy
`@google/generative-ai` SDK, doesn't support it either (confirmed the
same way). The currently-maintained `@google/genai` SDK's
`EmbedContentConfig.outputDimensionality` does. Since
`@langchain/google-genai` therefore contributed zero functionality here,
it was **removed** rather than kept as an unused dependency —
`lib/embeddings.ts`'s `TruncatedGeminiEmbeddings` class extends
`@langchain/core`'s `Embeddings` base directly (preserving the LangChain
interface for Phase 8's future retriever/vector-store code) but calls
`@google/genai` underneath for the actual API request. If a future
LangChain release adds real dimension support to
`GoogleGenerativeAIEmbeddings`, this is a candidate to revisit and
simplify — re-check the installed package's types before assuming it's
still needed.

`match_knowledge_chunks(p_business_id, p_query_embedding, p_match_count)`
is the tenant-scoped similarity search function, `security invoker` (not
definer, so RLS still applies to the underlying `select`) plus an
explicit `business_id` filter in the query body as defense-in-depth —
the same "RLS is never the only tenant filter" pattern as every other
table in this project. `lib/retrieval.ts`'s `searchKnowledgeChunks()` is
its only caller so far; no chat/RAG logic consumes it yet (Phase 8).

**Functions default to broader execute access than tables in this
project — a provisioning-time artifact, exactly like the Phase 3 table
case, not just Postgres's SQL-standard `PUBLIC` default.** This project's
tables default to *zero* grants (the Phase 3 `ALTER DEFAULT PRIVILEGES`
migration closed that at the source — see above). Functions did not:
`match_knowledge_chunks`'s original migration granted `execute` to
`authenticated` but never revoked the default, so the function was
reachable by `anon` and by completely unauthenticated connections until
`20260812163653_revoke_public_execute_on_match_knowledge_chunks.sql`
fixed it individually. `security invoker` meant `knowledge_chunks`' RLS
policies still blocked any actual cross-tenant data access — this was a
defense-in-depth failure, not a live data leak — but it's exactly the
kind of gap that's invisible unless checked for explicitly.

This took **three** migrations to actually close, and the first two
diagnoses were each wrong in a different way — worth reading in full,
since the same mistake pattern (assume the fix worked, don't verify
against the actual system catalog) produced two false "fixed" states in
a row.

1. `20260812191914_default_privileges_revoke_execute_on_functions.sql`
   (`revoke execute on functions from public;`) assumed the gap was
   Postgres's ordinary SQL-standard `PUBLIC` default. **Wrong** — live
   verification (`has_function_privilege()` on a throwaway function
   still returning `true` for `anon`/`authenticated`) showed this
   project's default ACL for functions in `public` explicitly grants
   `anon`/`authenticated`, not just `PUBLIC`.
2. `20260812200105_default_privileges_revoke_execute_functions_anon_authenticated.sql`
   (`revoke execute on functions from anon, authenticated;`) corrected
   *which roles* to name, but **still didn't work** — the same
   `has_function_privilege()` check still returned `true` for both
   roles. The real problem: neither migration specified `FOR ROLE`, so
   both only ever edited the default ACL entry owned by the *current
   session's role* (effectively `postgres`). `pg_default_acl` revealed
   **two separate default ACL entries** for functions in `public` — one
   owned by `postgres` (already effectively clean), one owned by
   `supabase_admin` (grants `anon`/`authenticated`/`postgres`/`service_role`)
   — and the `supabase_admin`-owned one is the one that actually governs
   new objects, because **Supabase's own tooling provisions objects
   under `supabase_admin`, not under whichever role a migration happens
   to run as.**
3. `20260812213356_default_privileges_revoke_execute_functions_supabase_admin.sql`
   (`alter default privileges for role supabase_admin in schema public
   revoke execute on functions from anon, authenticated;`) targeted the
   actual owning role explicitly, diagnosed correctly from
   `pg_default_acl` — but **failed to apply**: `npx supabase db push`
   returned `permission denied to change default privileges` (Postgres
   error `42501`). Nothing changed; the statement never took effect.
   Because this failure is permanent (see below) and was blocking every
   subsequent `db push` from getting past it, the file has since been
   **neutralized in place**: its `alter default privileges` statement
   was removed, leaving only its investigation comments plus a note
   explaining the removal. It is now an intentional no-op — this is a
   change to the migration file, not a retroactive change to what was
   ever applied to the live database.

**Final, corrected conclusion (not a retry candidate): a schema-wide
`ALTER DEFAULT PRIVILEGES ... FOR ROLE supabase_admin` fix is not
achievable at all through a normal migration connection on this
project.** The two prior attempts' diagnosis was right —
`supabase_admin` is genuinely the role whose default ACL governs
newly-created functions — but altering *another* role's default
privileges requires membership in that role (or superuser), and the
`postgres` role a `db push` connects as has neither on managed
Supabase: `supabase_admin` is reserved for Supabase's own internal
provisioning tooling. This is a platform permission boundary, not a bug
in the migration's SQL, and there is no equivalent normal-connection
workaround — abandon the schema-wide approach for functions rather than
attempting a fourth variant.

All three migrations stay in `supabase/migrations/` as a record of the
investigation. None are retroactive and none affect
`match_knowledge_chunks` (already fixed individually via its own direct
`revoke`, unaffected by any of this default-ACL confusion) or anything
created before they ran. The first two applied cleanly but changed
nothing that mattered (they edited the `postgres`-owned default ACL
entry, not the `supabase_admin`-owned one that actually governs new
functions); the third never applied at all, per the permission-denied
error above.

**Standing rule adopted instead of a schema-wide fix: every new
Postgres function this project creates must get its own explicit
`revoke execute ... from anon` (or equivalent least-privilege grant) in
its own migration, verified live via `has_function_privilege()` after
creation** — the same pattern already proven working for
`match_knowledge_chunks`
(`20260812163653_revoke_public_execute_on_match_knowledge_chunks.sql`).
The default no longer auto-opens broader access than intended for
*tables* (Phase 3's fix, confirmed working); for *functions*, per-object
discipline is the mitigation, not a schema default — there is no
"forget it once and it's still safe" guarantee for functions the way
there is for tables, so this must be checked on every phase that adds
one.

**Still flagged, not yet done:** whether the Phase 3 table-level
default-privileges fix (`20260811150450_default_privileges_least_privilege.sql`)
has this same `supabase_admin`-vs-current-role gap has not been
independently re-verified against `pg_default_acl`. Phase 5's
throwaway-table verification found zero default grants, consistent
with the table case being fine, but predates this session's discovery
of the two-owning-roles issue. Given that a schema-wide fix for
*functions* turned out to be structurally impossible via a normal
connection, if this table-level check ever turns up the same gap, the
mitigation would similarly have to be per-table discipline, not a
retried schema-wide `ALTER DEFAULT PRIVILEGES`.

## AI orchestration: retrieval-to-generation pipeline (Phases 8-9)

`lib/rag.ts` (`server-only`) is the retrieval-to-generation pipeline. It
holds `KnowledgeRetriever` (a `@langchain/core` `BaseRetriever` wrapping
Phase 7's `searchKnowledgeChunks()`, fixed to one `businessId` at
construction time so every retrieval an instance performs stays
tenant-scoped), `FALLBACK_MESSAGE`, and `askSalesEmployee()` — the single
entry point that other code calls.

**The zero-knowledge guarantee, unchanged since Phase 8:** if retrieval
returns zero chunks for a business, `askSalesEmployee()` returns
`FALLBACK_MESSAGE` immediately, with **no Gemini call at all** — not a
model call working from an empty or near-empty context. This is the
concrete mechanism behind `PRODUCT.md` §7 category 4's "never present a
retrieval failure as an answer": there is no code path where the model
generates an answer when there's nothing to ground it in, so there's
nothing for the model to hallucinate around. Phase 9's richer persona
(the business name is technically always available as category-1
profile information) deliberately did **not** weaken this — a model
call with only a business name to work with still risks generic-sounding
filler that reads as invented specifics, so the hard bypass stays a
hard bypass.

**Persona and structured output (Phase 9):** when chunks *are* retrieved,
the system prompt frames the model as an employee of the specific
business (`businessName`, sourced from `requireBusinessContext()`, which
already has the full `businesses` row in hand via `getBusinessForOrg()`
— no extra query), states the four `PRODUCT.md` §7 information
categories explicitly, and instructs the model on the category-4
fallback, competitor/general-knowledge restrictions, and qualification
framing. The model is invoked via
`ChatGoogleGenerativeAI.withStructuredOutput(SalesEmployeeResponseSchema,
{ name: "SalesEmployeeResponse" })` — confirmed via the installed
`@langchain/google-genai` package's own `.d.ts` and documented example
before use — so `{ answer, usedContext, escalate, escalationReason }`
comes back as a typed, Zod-validated object rather than parsed from
free text.

**`grounded` means "the answer used retrieved context," not "context
was retrieved" — corrected post-Phase-9.** The first cut of this field
was `documents.length > 0` — true whenever the retriever found *any*
chunk, regardless of whether the model's answer actually drew on it.
Manual testing caught the gap: a general-knowledge question (e.g.
"what's the capital of France?") could retrieve a chunk via embedding
similarity, get correctly declined per the persona rules, and still
show as "grounded," which misrepresented a declined answer as
data-backed. The fix adds `usedContext: boolean` to
`SalesEmployeeResponseSchema` — model-self-reported, same trust level
as `escalate` (`docs/security.md` §8: a display signal only, never used
for tenant scoping or authorization) — and `grounded` is now
`documents.length > 0 && result.usedContext`. `usedContext` is also
exposed as its own field on `SalesEmployeeResponse`, separate from the
collapsed `grounded` boolean, for finer-grained debugging. The
zero-chunk hard bypass is unaffected: it never calls the model and
always returns `grounded: false, usedContext: false`.

**Escalation scope, deliberately partial:** `escalate`/`escalationReason`
only cover what a single turn can determine on its own (explicit request
for a human; a complaint; a request for a commitment the AI isn't
authorized to make). `PRODUCT.md` §7's other two triggers — "the AI hits
the same unknown repeatedly" and a business-defined trigger — are not
implemented: the former needs real persisted conversation state (Phase
11 owns conversation/message persistence) to detect correctly rather
than a guessed heuristic, and the latter has no configuration surface
yet (Phase 13). `escalate` is a display/UI signal only — it authorizes
nothing and triggers no real handoff mechanism (Phase 15's job).

**Conversation context:** `askSalesEmployee()` accepts an optional,
non-persisted `history: { role, content }[]` parameter (via a LangChain
`MessagesPlaceholder`), so `PRODUCT.md` §7 category 3 (conversation
information) can be honored once Phase 11 supplies real persisted
history. No caller passes a non-empty history yet — `/dashboard/ai-test`
(the same throwaway, un-navigated manual-test page from Phase 8) still
tests single-turn only.

Model output — `answer`, `escalate`, `escalationReason` — is untrusted
input (`AGENTS.md` §3 rule 5, `docs/security.md` §8): rendered as
display text/a UI flag only, never used to authorize anything, select a
tenant, or execute a real-world action.

### AI tool-calling (Phase 14a)

`askSalesEmployee()` can now call tools mid-answer, starting with
`check_product_details` (`lib/tools/check-product-details.ts`) — an exact,
tenant-scoped lookup of one product or service by name directly from the
`products`/`services` tables, for when a prospect asks about something
specific and precise price/description matters more than retrieval's
fuzzy chunk-matching can guarantee.

**A second tool, `check_faq_topic` (`lib/tools/check-faq-topic.ts`,
Phase 14b), joined the same `bindTools([...])` array and the same bounded
loop — no second loop, no second `MAX_TOOL_ITERATIONS`.** Each `tool_calls`
entry is dispatched to its executor by `toolCall.name`. Its matching
strategy deliberately differs from `check_product_details`'s exact match:
FAQ `question` values are full sentences a prospect will rarely phrase
verbatim, so the tool matches by case-insensitive **substring** (`ilike
'%topic%'`) against `question` only, taking the first match ordered by
`created_at` rather than erroring when a common keyword matches more than
one FAQ. It still returns the literal stored `answer` verbatim, never a
paraphrase — the same "exact record, not retrieval's fuzzy chunk-match"
guarantee as `check_product_details`, just with a more forgiving lookup
step to get there.

**Two stages, not one — a provider-level constraint, not a stylistic
choice.** Inspecting the installed `@langchain/google-genai`'s
`withStructuredOutput` implementation showed it uses Gemini's native
`responseSchema` JSON-mode generation config, not forced function-calling
— and a single Gemini call cannot carry both a `tools` list and a
`responseSchema`. So tool use and the final structured
`SalesEmployeeResponse` can never happen in the same model call. The flow
is: (1) a tools-bound call (`getChatModel().bindTools([...])`) that may
come back with `tool_calls`; each is executed and fed back as a
`ToolMessage` (keyed by `tool_call_id`), looped up to `MAX_TOOL_ITERATIONS`
(currently 2) to bound cost/latency — hitting the cap is not an error, the
loop just stops issuing tool calls; then (2) a separate, tools-unbound
`withStructuredOutput` call over the full accumulated message list
produces the final answer, exactly as before this phase. This costs at
least one extra model call whenever documents are retrieved (up from one
call to two-or-more), accepted as the necessary shape of tool-calling on
this provider via this integration.

**Tenant scope is injected, never model-supplied**, same principle
`KnowledgeRetriever` already established for retrieval: a tool's
executor takes `businessId` as a function parameter from
`askSalesEmployee`'s own already-trusted parameter, never as a field on
the tool's model-facing Zod input schema. `check_product_details`'s tool
schema has only a `query` field; `executeCheckProductDetails()` re-validates
`rawArgs` itself (defense in depth beyond `bindTools`' own schema
enforcement) and returns a structured `{ found, ... }` / `{ found: false,
reason }` result rather than throwing, so a tool failure can't take down
the whole answer.

**`request_callback` (`lib/tools/request-callback.ts`, Phase 14c) is the
first write action any tool in this codebase can take**, and it needed more
than the read tools' mechanics. `askSalesEmployee()`'s signature gained a
required `conversationId` parameter (threaded from `app/api/chat/route.ts`,
which already resolves it before calling), positioned alongside `businessId`
as a second trusted, server-injected value the model's schema structurally
excludes — the tool creates or updates a `leads` row for that conversation,
never reads `conversationId` from `rawArgs`. Two existing lead-creation
paths were inspected and rejected: `captureLeadFromConversation()` re-runs a
whole-transcript extraction and always mints a new `conversations` row (the
wrong shape for a tool call that already has explicit args and an existing
conversation), and `lib/leads.ts`'s `createLead()`/`getLeadForConversation()`
both construct a Clerk-session client internally, which has no valid session
on the widget's service-role path (the same bug class the
fix-widget-retrieval-client-injection entry already fixed once for
retrieval). The executor instead does its own tenant-scoped `leads` queries
with the passed-in client, reusing `lib/conversations.ts`'s
`getConversationForBusiness()` (already client-injected) as the
tenant-ownership guard before any write — a `conversationId` that doesn't
belong to `businessId` fails closed with no write, the tool's real
forged-tenant proof. A second call for the same conversation updates the
existing row (fill-blank contact fields, appended notes, `leads`'s new
`unique (conversation_id)` constraint backstopping "never a duplicate") 
rather than inserting a second one. Consent is enforced by instruction, not
a schema field: the system prompt states explicitly that offering a
callback is conversational only, and the tool may only be called once the
prospect has clearly agreed **and** given contact info — there is
deliberately no `prospectConfirmed`-style boolean in the tool's schema,
since the model could set that `true` regardless of what actually happened.
The tool's log line is businessId + conversationId + outcome only — never
the prospect's actual contact info, unlike the read tools' query-string
logging, since this one touches real PII.

### Lead extraction (Phase 10)

`PRODUCT.md` §8's resolved field specification (decision D6) is
implemented across four separated modules, per `AGENTS.md` §9's
explicit "lead logic" / "AI orchestration" / "database access"
boundaries: `lib/lead-extraction.ts` (AI-only — calls Gemini via
`getChatModel().withStructuredOutput()`, the same pattern as
`lib/rag.ts`, and knows nothing about Postgres), `lib/conversations.ts`
and `lib/leads.ts` (database-only CRUD, no AI calls), and
`lib/lead-capture.ts` (the orchestration layer that ties them together
— resolves interest names to real catalog IDs, normalizes contact
fields, applies the "at least one of email/phone" gate, and only then
persists).

**`public.conversations` is a deliberate, minimal stub, not Phase 11's
real chat/message model.** `leads.conversation_id` is a required FK per
the approved spec, but `docs/phases.md` places Phase 10 before Phase 11
(the phase that actually owns conversation creation). Rather than widen
Phase 10's scope into Phase 11's or weaken the spec's "required," the
user was asked directly and chose to have Phase 10 create just enough
of a `conversations` table (`id`, `business_id`, `source`,
`created_at` — no messages, no chat API, no status) to give leads a
real FK target; Phase 11 extends this table with the real contract
rather than replacing it. A conversation row is created lazily, only at
the moment a lead is actually captured — a test conversation that never
yields contact info leaves zero trace in the database (no
`conversations` row, no `leads` row). This is an intentional v1
tradeoff, not an oversight: conversation-count/engagement telemetry
isn't a `PRODUCT.md` goal yet. If it's ever wanted, it requires
persisting a conversation row regardless of outcome — a decision for
whenever Phase 11's real conversation/message model lands, not assumed
here.

**AI output never becomes a foreign key directly.** The extraction
model (`lib/lead-extraction.ts`'s `LeadExtractionSchema`) outputs
`interestType` and a free-text `interestName` — never a raw ID.
`lib/lead-capture.ts`'s `resolveInterestId()` is the only thing that
turns that into a real `interest_id`: a case-insensitive **exact**
name match against that business's own `products`/`services` (fetched
tenant-scoped via the existing `listProductsForBusiness()`/
`listServicesForBusiness()`), never a fuzzy/partial match. No match
leaves `interest_id` null while still recording `interest_type` if the
model gave one. This is the same "never trust AI-suggested identifiers
directly" principle Phase 9 already applied to `escalate`/`usedContext`
(model self-report, display-only) — applied here to a case where the
model's output could otherwise have become a real database reference,
which is a meaningfully higher-stakes trust boundary than a display
flag (`docs/security.md` §8).

**Contact fields are validated twice, at two different strictness
levels.** `lib/lead-extraction.ts`'s `LeadExtractionSchema` accepts
`contactEmail`/`contactPhone` as loose, unvalidated strings — an AI's
free-text rendering of "an email" isn't guaranteed RFC-valid.
`lib/schemas/lead.ts`'s `normalizeEmail()`/`normalizePhone()` then
validate each individually and return `null` on a failed format check,
rather than rejecting the whole extraction over one malformed field.
`leadPersistSchema` (also in `lib/schemas/lead.ts`) is the actual
validation boundary before anything reaches the database
(`docs/security.md` §7's explicit callout that AI structured outputs
need the same Zod discipline as any other external input), and
includes a `.refine()` requiring at least one of the two contact
fields — one of three layers enforcing that rule (the others being
`lib/lead-capture.ts`'s early return before persistence is even
attempted, and the `leads_contact_required` database `CHECK`
constraint), the same "redundant, not accidental" defense-in-depth
pattern used everywhere else in this project (RLS + application
filter, table grants + RLS, etc.).

**`qualification`/`qualification_reason` are untrusted, display-only AI
output**, same trust category as Phase 9's `escalate`/`usedContext` —
never used for authorization, tenant scoping, or any decision with
real-world effect. Set once at lead creation and never recomputed; no
re-qualification exists in this phase.

`updateLeadStatus()` (`lib/leads.ts`) follows the exact contract
`lib/products.ts`'s `updateProduct()` established: filtered by both
`business_id` and `id`, returns `boolean` rather than throwing or
distinguishing "not found" from "belongs to another tenant" — a
cross-tenant attempt silently affects zero rows.

The multi-turn manual test surface (`/dashboard/leads-test`) is a
**separate** throwaway page from `/dashboard/ai-test` (Phase 8/9),
deliberately not merged into it — it exercises `askSalesEmployee()`'s
`history` parameter (built in Phase 9, unexercised until now) by
accumulating a transcript in client-side React state only; no
`messages` table exists to persist it into (see the `conversations`
stub note above). Ending the test conversation calls
`captureLeadFromConversation()` directly.

### Public chat widget (Phase 11)

`app/api/chat/route.ts` is the first genuinely public, unauthenticated
endpoint in this app (resolved decision D4, `STATE.md` §4). It never
calls `requireAuthContext()`/`auth.protect()`. Instead:

- `lib/widget-auth.ts`'s `resolveBusinessFromWidgetKey(key, origin)`
  resolves a per-business `widget_key` (a new `businesses` column,
  `uuid not null default gen_random_uuid() unique` -- a *publishable*
  identifier, same trust class as a Stripe publishable key, not a
  secret) to a validated `business_id`, checked against a per-business
  `widget_allowed_origin` column (also new, nullable -- the widget fails
  closed until an owner sets it via `/dashboard/widget-settings`). The
  check happens against the request's `Origin` header, falling back to
  the origin portion of `Referer`, **before** the key is ever treated as
  valid. `WidgetAuthError` is deliberately generic -- the route never
  tells a caller *which* check failed.
- No code path in this flow accepts a client-supplied `business_id`.
  There isn't even a `business_id` field in the request schema.

**This is the first phase needing a service-role Supabase client**
(`lib/supabase/service.ts`'s `createServiceSupabaseClient()`,
`SUPABASE_SECRET_KEY` -- required as of this phase). Every prior phase
deferred this deliberately (`docs/security.md` §3: "reserved for narrow,
deliberate operations"); the widget request path is that narrow,
deliberate case, since a prospect has no Clerk session for RLS to key
off of at all. **On this path, RLS is bypassed entirely** -- the
application-layer `business_id` filter in every query is the *only*
tenant boundary, not defense-in-depth on top of RLS the way every other
table in this project works. This client is never imported by any
dashboard/Clerk-session code.

`lib/conversations.ts`'s `createConversation`/`getConversationForBusiness`,
the new `lib/messages.ts`'s `createMessage`/`listRecentMessages`, and (as
a same-day corrective fix, `prompts/fix-widget-retrieval-client-injection.md`)
`lib/retrieval.ts`'s `searchKnowledgeChunks` and `lib/rag.ts`'s
`KnowledgeRetriever`/`askSalesEmployee` all take the Supabase client as
an explicit parameter, rather than constructing one internally, so both
the Clerk-session dashboard path (`lib/lead-capture.ts`,
`/dashboard/ai-test`, `/dashboard/leads-test`) and the service-role
widget path share one query implementation per table/retrieval call
instead of duplicating it. **The retrieval chain was missed in the
original Phase 11 implementation**: `searchKnowledgeChunks()` still
constructed a Clerk-session client internally, so every widget request
called `match_knowledge_chunks` as `anon` (no session on that path) --
which correctly has no `EXECUTE` grant on that function (Phase 7's
deliberate fix, left untouched by this correction) -- and every real
`/api/chat` request 500'd with `42501` until this was caught in manual
testing and fixed.

**`public.messages`** is the real persisted chat-turn table this phase
adds -- both prospect and AI turns (`role` check `user`/`assistant`),
`business_id`/`conversation_id` fk'd, same RLS-join-through-`businesses`
shape as every other business-owned table. `authenticated` gets `SELECT`
only (for a future Phase 13 dashboard conversation view); no
`INSERT`/`UPDATE`/`DELETE` grant exists for it at all -- only the
service-role widget path writes messages in v1.

**Conversation/message persistence is now unconditional, on every
request** -- a deliberate change from Phase 10's lazy, lead-triggered
`conversations` row creation. The Phase 10 note above ("a decision for
whenever Phase 11's real conversation/message model lands") is resolved
here: every widget turn is persisted regardless of whether a lead is
ever captured. A returning `conversationId` from the client must belong
to the resolved `business_id`, verified via `getConversationForBusiness`
-- a mismatch or nonexistent id gets a generic `400`, indistinguishable
from each other, so no cross-tenant existence information leaks.

**Rate limiting** is a lightweight Postgres fixed-window counter table,
`public.rate_limit_counters` (`scope`, `identifier`, `window_start`,
`request_count`, unique on the three), incremented atomically by
`public.increment_rate_limit_counter(p_scope, p_identifier,
p_window_seconds)` -- one `INSERT ... ON CONFLICT ... DO UPDATE ...
RETURNING` statement, avoiding the read-then-write race a naive
check-then-increment from the client would have. `lib/rate-limit.ts`'s
`checkAndIncrementRateLimit()` is the only caller, applied to three
scopes per request: `ip` (30/5min), `key` (120/5min, keyed on the
widget key), `conversation` (20/5min). This function got the same
per-function privilege treatment as `match_knowledge_chunks` (Phase 7)
from the start, not as a follow-up fix: `EXECUTE` explicitly revoked
from `public`/`anon`/`authenticated`, granted only to `service_role`,
in the same migration that creates it.

**CORS**: `Access-Control-Allow-Origin: *` is set on every response
from this route (success and error alike), plus an `OPTIONS` handler
for the browser preflight. This is a browser-compatibility concern, not
the security boundary -- the request carries no cookies/Clerk session,
so there's no credentialed-CORS risk, and the actual authorization
check is the server-side stored-origin comparison in
`lib/widget-auth.ts`, which runs regardless of what CORS would have
allowed.

The public response body is deliberately minimal: `{ conversationId,
answer, escalate }`. No `sourceChunkIds`, `usedContext`, or
`escalationReason` -- those remain dashboard-debugging-only fields
(`/dashboard/ai-test`, `/dashboard/leads-test`).

**Deliberately not built this phase:** lead-capture triggering from the
widget (`captureLeadFromConversation()` exists from Phase 10 but nothing
calls it from `/api/chat` -- no trigger point is specified by any phase
yet), a GET endpoint to resume/redisplay prior messages (Phase 12), key
rotation/multiple keys per business (deferred by D4 until needed), and
`rate_limit_counters` row cleanup (rows accumulate indefinitely; no
cron exists).

### Public chat widget UI (Phase 12)

`public/widget-loader.js` is the entire embed mechanism: a business
drops `<script src=".../widget-loader.js" data-widget-key="...">`
into their own site. It creates a fixed-position `<iframe>` pointed at
`/widget/embed?key=...`, a same-origin Next.js page rendering the
actual bubble/panel UI. No bundler, no new dependency -- the loader is
plain, framework-free JS served as a static asset.

**The loader, not the iframe, calls `/api/chat`.** This is the one
load-bearing correction from this phase's original prompt draft: the
iframe's document is same-origin with this app, not with whatever site
embeds the widget, so a `fetch` from inside it would always carry this
app's own `Origin` header, never the host page's real one --
`lib/widget-auth.ts`'s per-business origin check could then never pass
for a genuine cross-domain embed. The loader runs in the host page's
own JS context, so its `fetch("/api/chat")` carries the host page's
real `Origin`, which is what the check actually depends on. The iframe
is a pure rendering surface: it posts `{ type: "widget:send", requestId,
text }` up to `window.parent`, and the loader posts back `{ type:
"widget:response", ... }` or `{ type: "widget:error", ..., kind }`
once its own cross-origin fetch resolves. The loader also owns the
`conversationId` for the lifetime of the page (not the iframe), since
it is the thing making every request across the conversation. A
`{ type: "widget:resize" }` / `{ type: "widget:viewport" }` pair
handles sizing (collapsed bubble vs. open panel vs. full-screen on
narrow viewports) the same way, since a cross-origin iframe can't read
the parent's window dimensions directly. Every `postMessage` listener
on both sides validates `event.source`/`event.origin` before acting.

**Independent root layout.** `app/` now has two route groups --
`app/(dashboard)/` (the pre-existing app: `layout.tsx`, `page.tsx`,
`globals.css`, `dashboard/`, `onboarding/`, `session-tasks/`,
`sign-in/`, `sign-up/`, all moved here verbatim, same URLs, same
behavior) and `app/(widget)/` (`layout.tsx`, `widget.css`,
`widget/embed/`). Per Next.js 16's route-groups convention, any layout
with no `layout.js` above it is its own root layout, so the widget
route neither loads `ClerkProvider` nor renders any dashboard chrome --
a prospect must never see either. `app/api/**` is unaffected (route
handlers don't participate in the layout tree). `app/widget/embed/page.tsx`
sets `robots: { index: false, follow: false }` -- it carries live,
non-secret widget keys in its query string and has no reason to be
indexed.

No new table, column, env var, or npm dependency. The visual system
(indigo/neutral palette, Inter, `--widget-*` CSS tokens scoped to
`app/(widget)/widget.css` only) is documented in
`prompts/phase-12-chat-ui.md`'s "Visual interpretation" section, not
duplicated here.

## Dashboard shell and navigation (Phase 13a)

`app/(dashboard)/dashboard/layout.tsx` is a **nested** layout under the
existing `app/(dashboard)/layout.tsx` root layout, so dashboard chrome
(sidebar nav on desktop, off-canvas nav on mobile) wraps only `/dashboard/*`
pages -- `/onboarding`, `/sign-in`, `/sign-up`, and
`/session-tasks/choose-organization` stay outside it, unchanged. It calls
`requireBusinessContext()` once for nav-level data (business name); every
page under it still independently calls `requireBusinessContext()` too, per
this project's existing "defense in depth, not one layer" convention (see
Authentication above) -- a page never assumes the layout above it already
resolved a valid context.

Nav items are defined once in
`app/(dashboard)/dashboard/_components/nav-items.tsx` and consumed by both
`sidebar.tsx` (desktop, `usePathname`-driven active state) and
`mobile-nav.tsx` (off-canvas panel) so the two can't drift.

Visual identity: the dashboard borrows the widget's indigo primary color
(`#4f46e5`/`#4338ca`, matching `app/(widget)/widget.css` exactly) into its
own token block in `app/(dashboard)/globals.css` (`--dashboard-primary`
etc.) for one visible brand across both surfaces -- but keeps its own
Geist typography and plain Tailwind `zinc-*` neutrals rather than adopting
the widget's full token set, since the dashboard's dense, multi-page layout
is a different surface than the widget's single chat panel. No shared CSS
file between the two route groups, consistent with Phase 12's independent
per-route-group styling.

### Business profile fields and the AI boundary (Phase 13b)

`/dashboard/profile` (`app/(dashboard)/dashboard/profile/`) is the second
nav item, `org:admin`-only per the same `requireAuthContext({ role:
"org:admin" })` pattern Phase 4's onboarding admin check established. It
edits `businesses.name` plus four new nullable columns
(`description`/`contact_email`/`contact_phone`/`website`, migration
`20260813140000_add_business_profile_fields.sql`) through
`lib/business.ts`'s `updateBusinessProfile()`. Writability is gated the
same way `widget_allowed_origin` was in Phase 11: the existing
`businesses_update_own_org` RLS policy already permits row-level `UPDATE`
for an org-matched caller, so a column-level `GRANT` is the only thing
that changed -- `org:admin`-only is an application-layer check, not
something Postgres's `GRANT` can express.

**The four new fields are dashboard-display-only.** `lib/rag.ts`'s
`askSalesEmployee()` still sources business-profile context from `name`
alone, exactly as Phase 9's Decision 1 left it -- this phase deliberately
did not touch `lib/rag.ts` or extend what reaches the AI's system prompt.
Wiring `description`/`contact_email`/`contact_phone`/`website` into the AI
persona is a distinct, later decision (`prompts/phase-13b-business-profile-and-polish.md`'s
"Out of scope"), not something to assume from their existence in the
database.

### Conversations and leads dashboard views (Phase 13c)

`/dashboard/conversations` and `/dashboard/conversations/[id]` are the
first dashboard reads of `messages`/`conversations` -- `authenticated` has
had `SELECT` on both since Phase 11, whose own migration comment
anticipated this exact phase. No migration was needed; this phase only
adds new read queries against already-live RLS/grants.

`lib/conversations.ts`'s `listConversationsForBusiness()` gets each
conversation's message count via PostgREST's embedded-relationship count
(`.select('*, messages(count)')`) rather than a per-row query or a new
Postgres function -- applicable because `messages.conversation_id` is a
real FK, unlike this project's several app-enforced polymorphic
references (`knowledge_documents.source_id`, `leads.interest_id`).

`lib/leads.ts`'s new `getLeadForConversation()` deliberately does **not**
take a `supabase` client parameter, unlike `lib/conversations.ts`'s and
`lib/messages.ts`'s functions. This is intentional, not a missed
Phase-11-style client-injection gap: `lib/leads.ts` has no service-role
caller today (lead capture isn't wired from the widget path, Phase 11
Decision 16), so every function in that file -- old and new -- only ever
runs under a Clerk session, matching the file's existing internal-client
convention. If lead capture is ever wired to the widget path, this file
would need the same client-injection retrofit Phase 11 applied to
`lib/conversations.ts`/`lib/messages.ts`, at that time.

### Human handoff: control state and the AI-pause guard (Phase 15a)

`conversations` gained two columns: `control` (`'ai' | 'human'`, default
`'ai'`) and `needs_attention` (`boolean`, default `false`). `control` is
the explicit state distinguishing AI-handled from human-controlled
conversations that `docs/phases.md`'s Phase 15 entry calls for. It is
never set from AI output -- the only writer is
`lib/conversations.ts`'s `setConversationControl()`, called from a new
Clerk-authenticated Server Action
(`app/(dashboard)/dashboard/conversations/actions.ts`,
`setConversationControlAction`) driven by a "Take over this
conversation" / "Hand back to AI" toggle on the conversation detail
page. The `authenticated` role's grant is column-scoped to `control`
only -- there is no grant on `needs_attention` for that role at all.

`app/api/chat/route.ts`'s guard: the prospect's message is always
persisted first (so a human reviewing the conversation sees every
message, even while it's human-controlled), then, if
`conversation.control === "human"`, the request returns a static,
server-authored acknowledgment (`HUMAN_CONTROL_MESSAGE`) **without ever
calling `askSalesEmployee()` and without persisting that acknowledgment
as a message row**. This is the mechanism that makes it structurally
impossible for the AI and a human to both answer the same prospect
message -- not a convention the model is asked to follow, an app-layer
branch that never reaches the model at all when control is human. Not
persisting the canned acknowledgment is deliberate: it keeps this stage
from having to decide how a real staff reply is represented in
`messages` (a new role distinct from `user`/`assistant`) before that
representation is actually needed -- that decision belongs to the next
stage, which builds staff-reply delivery.

When the AI's own `escalate` signal is `true` on a turn, the route flags
the conversation via `flagConversationNeedsAttention()` (service-role
write, since only that path can touch `needs_attention`) -- but this
**does not** change `control`. Escalation raises a flag for a human to
claim; it does not silently switch the prospect from a working AI
answer to "someone will reply shortly" before any staff member is
actually watching, since the in-app alert UI that would make a human
aware of the flag doesn't exist until a later Phase 15 stage. This is a
confirmed, deliberate reinterpretation of `docs/phases.md`'s literal
Phase 15 exit-criterion wording ("an escalation trigger reliably moves a
live conversation to human control") -- see
`prompts/phase-15a-handoff-state-and-ai-pause.md`'s "Decisions and
assumptions" #1, and `STATE.md` §4's decision log for the formally
recorded version. The literal phrase is satisfied at the level of the
full Phase 15 flow (trigger → attention flag → a human's deliberate
take-over action → control genuinely moves to human), not by the
trigger alone.

Still explicitly out of scope as of this stage: any live/polling
delivery of a staff reply to the prospect, a dashboard UI for actually
sending a reply, any new `messages` role, and the visual
badge/sound alert for `needs_attention` -- all later Phase 15 stages,
not built yet.

### Phase 15b -- staff reply persistence and live polling

`messages.role` gained a third value, `human_agent`, distinct from
`assistant` (AI-authored) and `user` (prospect-authored). It is the
**first `authenticated`-role write into `messages` ever** -- every
prior write came from the service role. The write is gated by defense
in depth: a column-scoped `INSERT` grant (`business_id`,
`conversation_id`, `role`, `content` only) plus an RLS policy requiring
`role = 'human_agent'`, a business match, and the target conversation's
`control = 'human'` -- the same "no reply while AI-controlled"
invariant `app/api/chat/route.ts` already enforces for reads, now also
enforced at the DB layer for this new write path. The dashboard's
`sendHumanReplyAction` re-checks `control === "human"` at the
application layer before attempting the insert, independently of RLS.

**Polling is a one-way latch, not a toggle.** Both the widget and the
dashboard poll for updates, but neither gates *starting* to poll
strictly on `control === "human"`. The widget starts polling the first
time a response shows either `escalate: true` or `control === "human"`,
then keeps polling for the rest of that browser session even after a
hand-back to AI -- gating strictly on `control` learned only from the
prospect's own outgoing messages would miss a proactive staff take-over
that happens before the prospect sends anything else. The dashboard's
live conversation view polls unconditionally once mounted (it already
knows it's looking at a specific conversation someone chose to open).

**The widget's poll endpoint (`app/api/chat/poll/route.ts`) reuses
`lib/widget-auth.ts`'s `resolveBusinessFromWidgetKey()` unchanged** --
not a new auth mechanism. `public/widget-loader.js`, not the iframe, is
the only thing that calls it, for the same genuine-`Origin`-header
reason `handleSend` already lives there. It excludes `role: 'user'`
from its results (the widget already knows its own prospect-authored
messages from local state); the dashboard's `pollConversationAction`
returns every role, since staff need to see the prospect's next message
live. Both share one query function, `lib/messages.ts`'s
`listMessagesForConversationAfter()`.

`/api/chat`'s response gained two fields, `control` and `asOf`
(the `created_at` of whichever message was persisted last in that
request), on every success path. `asOf` is the polling cursor --
`control`/`asOf` are consumed entirely inside `public/widget-loader.js`
and never cross the postMessage boundary into the iframe; the iframe
only ever receives rendered message content via the new
`widget:poll_result` message type. `public/widget-loader.js`'s
hand-kept-in-sync duplication of `app/(widget)/widget/embed/_lib/post-message.ts`'s
type shapes (documented since Phase 12) now also covers
`widget:panel_open` (iframe → loader, sent on every panel open/close
change) and `widget:poll_result` (loader → iframe).

**Rate limiting for poll traffic is intentionally separate from Phase
11's message-send scopes.** Two new `rate_limit_counters` scopes,
`poll_ip` (300/5min) and `poll_conversation` (100/5min), sized around
the widget's actual 6-second poll interval -- reusing the existing
generic scope/identifier/window mechanism (D4's precedent), not a new
rate-limiting system. The dashboard's polling Server Action gets no new
rate limit at all: it is Clerk-authenticated and tenant-scoped via
`requireBusinessContext()`, and this codebase has never rate-limited a
Server Action -- Phase 11's limits exist specifically because that
endpoint is public and unauthenticated.

**Poll intervals differ by side, reasoned separately, not identical by
default:** the widget polls every 6 seconds (mid-band of a 5-8s target,
balancing responsiveness against genuinely unbounded anonymous
traffic); the dashboard polls every 3 seconds (a single authenticated
staff session actively waiting on the next prospect message, bounded
traffic). Both use a self-rescheduling `setTimeout`, not `setInterval`,
so a slow poll can never overlap with the next one. Both pause on
`document.visibilitychange` (tab hidden); the widget additionally
pauses while its panel is closed (`widget:panel_open`) and while a
message send is in flight, and both fire one immediate poll on
resume/reopen rather than waiting out a full interval. De-duplication
is by message `id` on both sides, layered on top of the `after`/`asOf`
cursor as defense in depth, not a substitute for it.

`lib/http/widget-cors.ts` extracts the CORS/origin/IP helpers
(`extractOrigin`, `extractIp`, `withCors`, `CORS_HEADERS`) that
`app/api/chat/route.ts` used to define locally, now shared with
`app/api/chat/poll/route.ts` -- a small, directly-justified refactor
(two real call sites), not scope creep.

## Error handling

`lib/errors.ts` defines `AppError` (a safe, user-facing message kept
separate from internal detail) and `logAndGetUserMessage` (logs the
internal detail server-side, returns only the safe message). Route
handlers and server actions should catch, log, and convert errors through
this convention rather than surfacing raw messages, stack traces, or
provider errors to the client. See `docs/security.md` §10.
