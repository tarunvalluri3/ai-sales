# Phase 6 — Knowledge ingestion

## Goal

After this is implemented, a business can (1) paste/type free-form "approved knowledge" text through the dashboard and have it stored, chunked, and tenant-scoped, and (2) have its existing products, services, and FAQs automatically kept in sync as retrievable knowledge documents and chunks — all without embeddings yet (Phase 7's job). Today neither exists: Phase 5 only stores products/services/FAQs as relational rows with no path into anything retrieval-shaped.

## Current phase

Phase 6 — Knowledge ingestion. Confirmed from `STATE.md` §1 (Phase 5 closed 2026-08-12; migrations applied, grants verified, cross-tenant RLS verified by user).

## User request

"We're starting Phase 6 — Knowledge ingestion. Write the implementation prompt per `docs/phases.md`, then stop for my approval as usual."

## Skills and docs read

- `STATE.md` — current phase, resolved/open decisions, database state.
- `AGENTS.md` — stack, five non-negotiable rules, prompt-first workflow.
- `PRODUCT.md` §6 (knowledge model), §7 (AI behavior contract, for context on what retrieval eventually feeds), §10 (out of scope).
- `docs/phases.md` — Phase 6 and Phase 5/7 boundaries.
- `docs/prompt-template.md` — this template.
- `docs/security.md` — §1 (multi-tenancy), §2 (authentication / business-context helper), §3 (RLS strategy), §7 (untrusted input), §9 (retrieval isolation, for forward context), §10 (error handling), §11 (review checklist).
- `docs/architecture.md` — folder layout, validation convention, route handler conventions, "Business-owned child tables (Phase 5)" section (the RLS/grant pattern this phase reuses).
- No skill was read for LangChain/RAG — not needed. Phase 6 is text ingestion/chunking, not model orchestration; `.claude/skills/supabase/` and `.claude/skills/supabase-postgres-best-practices/` were consulted implicitly via `docs/architecture.md` and `docs/security.md`, which already encode their guidance for this project.

## Existing code inspected

- `lib/business-context.ts` — `requireBusinessContext()`, the `{ userId, orgId, businessId }` resolver every Phase 5 page/action uses. Reused as-is.
- `lib/products.ts` (and by extension the identical `lib/services.ts`, `lib/faqs.ts`) — CRUD data-access pattern: `business_id`-scoped queries, `AppError` on failure, boolean return from update/delete distinguishing nothing about "not found" vs "cross-tenant."
- `lib/schemas/catalog.ts` — shared Zod fields for products/services, colocated pattern per `docs/architecture.md`'s Validation convention.
- `lib/supabase/types.ts` — hand-written types per table (`Business`, `Product`, `Service`, `Faq`).
- `lib/supabase/server.ts` — `createServerSupabaseClient()`, per-request, Clerk-session-authenticated, RLS-enforced. **No service-role client exists in this codebase yet.**
- `lib/errors.ts` — `AppError` / `logAndGetUserMessage` convention.
- `app/dashboard/products/{page.tsx,actions.ts,product-form.tsx}` and `[id]/edit/page.tsx`, plus `app/dashboard/_components/delete-button.tsx` — the exact minimal-CRUD-page shape this phase's new `app/dashboard/knowledge/` will mirror.
- `supabase/migrations/20260811170015_create_products_table.sql` and `..._create_faqs_table.sql` — the table/RLS/grant shape (four policies, `business_id in (select id from businesses where clerk_org_id = ...)`, explicit `grant ... to authenticated`) this phase's two new tables reuse exactly.
- `supabase/tests/database/003_products_tenant_isolation.sql` — the pgTAP pattern (fixture as `postgres`, session simulated via `set_config('request.jwt.claims', ...)`, `results_eq`/`lives_ok`/`throws_ok`) this phase's new tests reuse.
- `package.json` — confirms no LangChain package is installed yet (first appears in Phase 8 per `docs/phases.md`), and no service-role env var (`SUPABASE_SECRET_KEY`) is wired anywhere yet.

## Relevant existing architecture

- `business_id`-scoped RLS + app-layer filtering, defense in depth (resolved decision D2).
- Every business-owned mutation resolves `businessId` through `requireBusinessContext()`, never from client input.
- New tables start with zero default grants (`ALTER DEFAULT PRIVILEGES` migration from Phase 3) — each table's own migration must explicitly `grant` what it needs.
- Minimal, un-navigated CRUD pages under `app/dashboard/<area>` is the established Phase 5 pattern; dashboard chrome/nav integration is Phase 13's job, not this phase's.
- Zod schemas colocated with the boundary they validate; a schema shared across boundaries moves to a named `lib/schemas/*.ts` file.
- `docs/security.md` §3 mentions the service-role key is "reserved for narrow, deliberate operations like ingestion jobs" — considered and deliberately **not** adopted this phase; see Decision 3 below.

## Decisions and assumptions

1. **Two new tables, not one.** `knowledge_documents` (the retrievable unit: either a manually pasted/typed document, or one auto-generated per product/service/FAQ row) and `knowledge_chunks` (the split pieces of a document's content, no embedding column yet — that's Phase 7). Mirrors `PRODUCT.md` §6's explicit two-stage model: "documents → chunks → embed → store vectors."

2. **Structured records become knowledge documents automatically, via application-layer sync, not a DB trigger.** `PRODUCT.md` §6 requires products/services/FAQs to be "also converted into knowledge documents so they are retrievable," and Phase 5's own description says these records "must be reachable by retrieval later." A new `lib/knowledge-sync.ts` exposes `syncGeneratedDocument(businessId, sourceType, sourceId, title, content)` and `deleteGeneratedDocument(businessId, sourceType, sourceId)`. `lib/products.ts`, `lib/services.ts`, `lib/faqs.ts` call these after every successful create/update/delete. Kept in application code (not a Postgres trigger) to match this project's existing "no DB triggers beyond the one generic `set_updated_at()`" convention and to keep chunking logic in one place, testable in TypeScript.

3. **No service-role Supabase client introduced this phase.** `docs/security.md` §3 flags the service-role key as appropriate for "ingestion jobs," but every ingestion event in this phase happens synchronously inside the authenticated business member's own Server Action (they're editing their own knowledge, or their own product/service/FAQ) — the existing per-request Clerk-authenticated client already has exactly the access it needs, scoped by RLS to their own business. Introducing `SUPABASE_SECRET_KEY` now would add an unused-until-needed secret and a bypass-RLS code path with nothing yet driving it (no background job, no cron). Deferred to whichever future phase first needs a decoupled/background ingestion path (e.g., a Phase 7 embedding backfill job). **Flagging for confirmation** — this reads `docs/security.md` §3 as descriptive of a future need, not a mandate for this phase; say so if that's wrong.

4. **Chunking is hand-rolled, not LangChain.** `AGENTS.md` §2 names LangChain as "the AI orchestration layer" and Phase 8 is explicitly where LangChain enters (`docs/phases.md`: "Phase 8 — LangChain RAG"). Phase 6 is pure deterministic text splitting with no model call involved. `AGENTS.md` §9's "install a dependency only when the current phase needs it" argues against pulling in `@langchain/textsplitters` now for what is a self-contained, testable, ~40-line recursive splitter. `lib/chunking.ts` exports a pure `chunkText(text, options?)` function: prefers splitting on paragraph breaks, falls back to sentence breaks, falls back to a hard character cutoff, with a configurable target size and overlap. **Flagging for confirmation** — if the project would rather standardize on LangChain's splitter from the start (e.g., to match Phase 8's chunk boundaries exactly), say so and this prompt will be revised before implementation.

5. **Chunk size default: target 1000 characters, 150-character overlap.** No product spec exists for this (reasonable given D3 — the embedding model/token budget — is still open, deadline Phase 7). Character-based, not token-based, since no tokenizer is wired in yet. Revisit once D3 is resolved in Phase 7 if the embedding model's context window makes a different target more sensible.

6. **Manual knowledge document content is capped at 20,000 characters**, validated by Zod. No product-specified limit exists; this is a sane upper bound to keep chunking bounded and pages responsive, not a hard architectural constraint — easy to raise later.

7. **Regeneration strategy: delete-and-reinsert, not incremental diff.** On any document content change, all existing chunks for that `document_id` are deleted and freshly chunked content is reinserted. Simpler and correct; nothing yet depends on stable chunk IDs across edits (no embeddings, no chunk-level references) so there's no cost to this simplicity yet. Revisit if Phase 7 embedding costs make re-embedding unchanged chunks worth avoiding.

8. **Generated-document content format:**
   - Product/service → `"{name}\n\n{description}"` optionally followed by `"\n\nPrice: {price}"` when present; blank `description`/`price` fields are omitted rather than rendered as empty lines.
   - FAQ → `"Q: {question}\n\nA: {answer}"`.
   These are the only two structured shapes and are deliberately minimal — no product spec constrains their exact wording.

9. **No polymorphic foreign key for `knowledge_documents.source_id`.** It references one of three different tables (`products`, `services`, `faqs`) depending on `source_type`, which Postgres can't express as a single FK constraint. `source_id` is a plain nullable `uuid` with no FK — integrity for generated documents is maintained entirely by the application layer (`lib/knowledge-sync.ts` is the only writer of non-`null` `source_id` rows), consistent with `docs/security.md`'s existing acceptance that some invariants are app-enforced, not DB-enforced (e.g. Phase 4's `org:admin` check). A partial unique index on `(business_id, source_type, source_id)` (excluding `source_type = 'manual'`) prevents duplicate generated documents per record.

10. **No chunk-level UI beyond a read-only preview on the manual knowledge document's edit page** ("N chunks generated," each chunk's text and character count, read-only). Products/services/FAQs pages do not surface their generated chunks — that's dashboard polish belonging to Phase 13, and the Phase 6 exit criterion ("a business can add knowledge and see it correctly chunked") is about the knowledge-document flow specifically. Structured-record chunking is verified via the manual testing steps below (SQL inspection), not a UI element.

## Open decisions this depends on

None of `STATE.md` §4's open decisions (D3, D4, D6) gate Phase 6 — D5 (approved knowledge source types for v1) was the one that did, and it was formally resolved and closed this session (pasted/typed text + structured records only, per `PRODUCT.md` §6).

## Dependencies / packages required

None. No new package needed — confirmed against `package.json` (Decision 4 above explains why LangChain isn't added yet).

## Files likely to change

**Created:**
- `supabase/migrations/<ts>_create_knowledge_documents_table.sql`
- `supabase/migrations/<ts>_create_knowledge_chunks_table.sql`
- `supabase/tests/database/006_knowledge_documents_tenant_isolation.sql`
- `supabase/tests/database/007_knowledge_chunks_tenant_isolation.sql`
- `lib/chunking.ts` — pure `chunkText()` splitter, unit-testable, no I/O.
- `lib/knowledge.ts` — manual-document CRUD (`getKnowledgeDocument`, `listKnowledgeDocumentsForBusiness`, `createKnowledgeDocument`, `updateKnowledgeDocument`, `deleteKnowledgeDocument`) plus the internal `regenerateChunksForDocument(businessId, documentId, content)` both this file and `lib/knowledge-sync.ts` call.
- `lib/knowledge-sync.ts` — `syncGeneratedDocument()` / `deleteGeneratedDocument()`, called from products/services/faqs data-access modules.
- `lib/schemas/knowledge.ts` — Zod fields for manual document title/content.
- `app/dashboard/knowledge/page.tsx`, `actions.ts`, `knowledge-form.tsx`, `[id]/edit/page.tsx` — mirrors the Phase 5 products page shape exactly, plus the chunk-preview section (Decision 10) on the edit page.

**Modified:**
- `lib/products.ts`, `lib/services.ts`, `lib/faqs.ts` — call `syncGeneratedDocument`/`deleteGeneratedDocument` after successful create/update/delete.
- `lib/supabase/types.ts` — add `KnowledgeDocument`, `KnowledgeChunk` types.
- `docs/architecture.md` — document the ingestion pattern, the chunking decision, and the "no service-role client yet" note under a new "Knowledge ingestion (Phase 6)" section, following the existing "Business-owned child tables (Phase 5)" style.
- `STATE.md` — final step, per `AGENTS.md` §0.6.

## Database changes

Two migrations, same RLS/grant shape as `products`/`services`/`faqs` (join through `businesses`, four policies each, explicit grant to `authenticated`, zero default grants inherited).

**`knowledge_documents`:**
```sql
create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  source_type text not null check (source_type in ('manual', 'product', 'service', 'faq')),
  source_id uuid,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_documents_business_id_idx on public.knowledge_documents (business_id);

create unique index knowledge_documents_generated_source_idx
  on public.knowledge_documents (business_id, source_type, source_id)
  where source_type <> 'manual';
```
Plus the standard `updated_at` trigger, `enable row level security` + `force row level security`, `grant select, insert, update, delete on public.knowledge_documents to authenticated;`, and four policies scoped via `business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id'))` — identical shape to `products`.

**`knowledge_chunks`:**
```sql
create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  document_id uuid not null references public.knowledge_documents (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  char_count integer not null,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index knowledge_chunks_business_id_idx on public.knowledge_chunks (business_id);
create index knowledge_chunks_document_id_idx on public.knowledge_chunks (document_id);
```
Same RLS/grant shape (no `updated_at` — chunks are deleted and reinserted, never updated in place, per Decision 7). No `update` policy/grant needed on this table; only `select`/`insert`/`delete`.

**Exact migration commands** (matching the Phase 3/4/5 workflow): `supabase migration new create_knowledge_documents_table`, hand-author the SQL above, `supabase migration new create_knowledge_chunks_table`, hand-author, then the user runs `supabase link` + `supabase db push` against the live project and verifies grants (per `docs/architecture.md`'s standing rule), exactly as done for Phase 5.

## Server / client boundaries

Everything server-only: `lib/chunking.ts`, `lib/knowledge.ts`, `lib/knowledge-sync.ts` all start with `import "server-only";`. The dashboard knowledge pages/forms follow the identical server-component + `"use server"` Server Action + client `DeleteButton`/form split already established in `app/dashboard/products/`. No new secrets — `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are the only Supabase credentials touched, matching Phase 5 (no `SUPABASE_SECRET_KEY`, per Decision 3).

## Implementation requirements

1. `lib/chunking.ts` exports `chunkText(text: string, options?: { targetSize?: number; overlap?: number }): { content: string; index: number; charCount: number }[]`. Default `targetSize = 1000`, `overlap = 150`. Splits preferring paragraph boundaries (`\n\n`), falling back to sentence boundaries, falling back to a hard cut at `targetSize`. Never returns an empty chunk. Deterministic — same input always produces the same output.
2. `lib/knowledge.ts` provides manual-document CRUD following `lib/products.ts`'s exact contract shape (`business_id`-scoped queries, `AppError` on Supabase error, boolean-returning update/delete). `createKnowledgeDocument` and `updateKnowledgeDocument` call `regenerateChunksForDocument` after a successful write, in the same function (delete existing chunks for that `document_id`, insert freshly chunked rows from `chunkText(content)`).
3. `lib/knowledge-sync.ts`'s `syncGeneratedDocument(businessId, sourceType, sourceId, title, content)` upserts (by the `(business_id, source_type, source_id)` unique index) the generated `knowledge_documents` row and regenerates its chunks the same way. `deleteGeneratedDocument(businessId, sourceType, sourceId)` deletes the generated document (cascade removes its chunks).
4. `lib/products.ts`'s `createProduct`/`updateProduct` call `syncGeneratedDocument(businessId, "product", product.id, product.name, <formatted content per Decision 8>)` after a successful write; `deleteProduct` calls `deleteGeneratedDocument(businessId, "product", id)` after a successful delete. Same pattern for `lib/services.ts` (`"service"`) and `lib/faqs.ts` (`"faq"`, content from question/answer).
5. `app/dashboard/knowledge/` mirrors `app/dashboard/products/` exactly: list page with create form, `[id]/edit` page with update form + delete button, `actions.ts` with Zod-validated `createKnowledgeDocumentAction`/`updateKnowledgeDocumentAction`/`deleteKnowledgeDocumentAction`, all resolving `businessId` via `requireBusinessContext()`.
6. The edit page additionally renders a read-only chunk preview: chunk count, and each chunk's `chunk_index`, `char_count`, and content (truncated in the UI if very long, full content not hidden — just visually collapsed/scrollable, not literally cut).
7. `lib/schemas/knowledge.ts`: `knowledgeTitleSchema` (trimmed, 1–200 chars) and `knowledgeContentSchema` (trimmed, 1–20,000 chars, per Decision 6).
8. `lib/supabase/types.ts` gains `KnowledgeDocument` and `KnowledgeChunk` types matching the migrations exactly.

## Security requirements

- `docs/security.md` §1: every new table (`knowledge_documents`, `knowledge_chunks`) carries `business_id`, resolved server-side only, never from client input.
- §2/§3: RLS enabled + forced on both tables, application-layer `business_id` filter in every query as defense in depth, same as Phase 5.
- §7: manual knowledge content is untrusted external input — validated with Zod (`lib/schemas/knowledge.ts`) at the Server Action boundary before it ever reaches `chunkText()` or the database.
- §11 review checklist applies: new tables have `business_id` + FK ✓, tenant-scoped queries ✓, cross-tenant test required ✓ (see Automated checks), no new `NEXT_PUBLIC_*` secret ✓, no secret in logs ✓, Zod validation on new input ✓.
- Note for later phases, not this one: chunk *content* itself is not yet treated as retrieval input (no retrieval exists until Phase 7/8) — §9's retrieval-isolation and §8's prompt-injection-treatment rules apply once chunks are actually queried by the AI, not to storage here.

## Error handling

- Supabase write/read failures on either new table → `AppError` with a safe user message ("Something went wrong saving your knowledge document. Please try again."), internal detail logged via `logAndGetUserMessage`, matching `lib/products.ts`'s existing convention exactly.
- A knowledge document `id` in an edit/delete request that doesn't exist or belongs to another business → `updateKnowledgeDocument`/`deleteKnowledgeDocument` return `false` (no rows affected), and the Server Action returns `{ error: "This knowledge document no longer exists." }` — same non-distinguishing contract as products/services/faqs.
- If `syncGeneratedDocument`/`deleteGeneratedDocument` throws inside a product/service/FAQ mutation, that throw propagates and the whole mutation is reported as failed to the user (via the existing `logAndGetUserMessage` catch in each action) — a structured record is never left silently out of sync with its generated knowledge document without the user seeing an error. This means a knowledge-sync failure blocks the product/service/FAQ save itself; accepted as correct for v1 (partial, silently-inconsistent state is worse), not flagged as a decision needing confirmation since it follows directly from the existing error-handling convention.

## Acceptance criteria

- [ ] `knowledge_documents` and `knowledge_chunks` tables exist, RLS enabled + forced, four (resp. three) policies each, grants match the products/services/faqs pattern.
- [ ] A business member can create a manual knowledge document with pasted/typed text through `/dashboard/knowledge` and see it saved.
- [ ] That document's content is chunked and the chunks are stored in `knowledge_chunks` with the correct `business_id` and `document_id`.
- [ ] Editing a manual knowledge document's content regenerates its chunks (old chunks gone, new chunks reflect the new content).
- [ ] Deleting a manual knowledge document deletes its chunks (cascade).
- [ ] Creating/updating a product, service, or FAQ automatically creates/updates a corresponding generated `knowledge_documents` row and its chunks.
- [ ] Deleting a product, service, or FAQ deletes its corresponding generated knowledge document and chunks.
- [ ] Business A cannot read, update, or delete Business B's knowledge documents or chunks (verified by pgTAP and/or manual SQL-editor cross-tenant check).
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `supabase test db` (runs `006_knowledge_documents_tenant_isolation.sql`, `007_knowledge_chunks_tenant_isolation.sql`, plus all prior test files) — attempted; if this implementation environment still has no Docker/Supabase CLI project access (the standing gap through every prior phase), the tests will be written and reviewed but not executed, and that will be reported honestly, exactly as every prior phase's entry in `STATE.md` §2 does. The user's manual SQL-editor cross-tenant check (see below) is the fallback verification path, as it has been every phase so far.

## Manual testing steps

1. Apply the two migrations (`supabase link` + `supabase db push`), then verify grants on both new tables (Dashboard table permissions view, or the `information_schema.role_table_grants` query `docs/architecture.md` documents).
2. Sign in as a business member, go to `/dashboard/knowledge`, submit a knowledge document with a few paragraphs of text (long enough to produce at least 2 chunks at the 1000-char/150-overlap default). Confirm it appears in the list and the edit page shows the expected chunk count and chunk previews.
3. Edit that document's content to something shorter. Confirm the chunk preview updates (old chunks replaced, not accumulated).
4. Delete the document. Confirm it disappears from the list; spot-check in the Supabase SQL editor that its chunk rows are also gone.
5. Go to `/dashboard/products`, create a product with a name/description/price. In the Supabase SQL editor, confirm a `knowledge_documents` row exists with `source_type = 'product'`, `source_id` = that product's id, and content matching the formatted template (Decision 8), and that its chunks exist.
6. Edit that product's description. Confirm the generated document's content and chunks update to match.
7. Delete that product. Confirm its generated knowledge document and chunks are gone.
8. Repeat steps 5–7 briefly for a service and a FAQ (formatted content differs per Decision 8).
9. **Negative/cross-tenant case:** as an `authenticated` session scoped to Business A (same technique as the Phase 5 SQL-editor spot-check), attempt to `select`/`update`/`delete` a `knowledge_documents` or `knowledge_chunks` row belonging to Business B. Confirm zero rows are visible/affected, and that a forged `insert` claiming Business B's `business_id` is rejected by RLS (`42501`), not silently accepted.

## Out of scope

- Embeddings, pgvector storage, similarity search — Phase 7.
- Any LangChain usage — Phase 8.
- File upload or URL ingestion as knowledge sources — explicitly out of v1 per `PRODUCT.md` §10 and resolved decision D5.
- Surfacing generated chunks in the products/services/faqs dashboard pages — deferred to Phase 13 dashboard polish (Decision 10).
- A service-role/background ingestion path — deferred until an actual decoupled job needs one (Decision 3).
- Re-chunking existing documents if the chunking algorithm's defaults (target size/overlap) change later — no migration/backfill mechanism is built for that in this phase.
