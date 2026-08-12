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
before use — so `{ answer, escalate, escalationReason }` comes back as a
typed, Zod-validated object rather than parsed from free text.

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

## Error handling

`lib/errors.ts` defines `AppError` (a safe, user-facing message kept
separate from internal detail) and `logAndGetUserMessage` (logs the
internal detail server-side, returns only the safe message). Route
handlers and server actions should catch, log, and convert errors through
this convention rather than surfacing raw messages, stack traces, or
provider errors to the client. See `docs/security.md` §10.
