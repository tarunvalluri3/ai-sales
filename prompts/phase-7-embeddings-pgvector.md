# Phase 7 — Embeddings + pgvector

## Goal

After this is implemented, every knowledge chunk (manual or generated from a product/service/FAQ) gets a 1536-dimension embedding stored alongside it in Supabase pgvector at creation/regeneration time, and a tenant-scoped similarity search function exists and is proven — by a pgTAP test, not inspection — to return relevant chunks for the correct business and nothing for a business with no matching knowledge. Today `knowledge_chunks` stores only raw text; there is no vector column, no embedding generation, and no similarity search path at all.

## Current phase

Phase 7 — Embeddings + pgvector. Confirmed from `STATE.md` §1 (Phase 6 implemented, migrations applied by the user during testing, one post-launch index-fix migration pending; not yet formally closed — writing this prompt does not itself violate the "don't advance to Phase 7 implementation" gate, since no Phase 7 code is written until approved).

## User request

"D3 resolved: embedding model is `gemini-embedding-001` via `@langchain/google-genai` (`GoogleGenerativeAIEmbeddings`), output dimension pinned at 1536 [...]. Chat generation model is Gemini 3.1 Flash-Lite. Update STATE.md [...] Now write the Phase 7 — Embeddings + pgvector implementation prompt per `docs/phases.md`. It must create the vector column as `vector(1536)`, not the model's raw 3072-dimension default — confirm the LangChain embeddings client is configured with `outputDimensionality: 1536` so what's generated actually matches the column type."

## Skills and docs read

- `STATE.md` — current phase, D3's full resolved reasoning (just written), env vars.
- `AGENTS.md` — stack, five non-negotiable rules, "do not assume APIs from memory — read installed package docs and official provider docs before changing anything architectural."
- `docs/phases.md` — Phase 7's exact scope and exit criterion; Phase 7 explicitly says "create the vector index when the data volume justifies it, not reflexively."
- `docs/security.md` — §3 (RLS strategy, service-role tradeoffs), §5 (env vars), §9 (retrieval isolation — the exact tenant-scoped query shape required), §10 (error handling).
- `docs/architecture.md` — "Knowledge ingestion (Phase 6)" section (the chunk-regeneration pipeline this phase extends), "Database" section (extension/grant conventions).
- No LangChain/RAG skill exists in `.claude/skills/` to read (checked — not present). Per `AGENTS.md` §6 this is handled by "installed package docs + official Gemini docs; inspect before implementing," which is exactly what this prompt's research and Implementation Requirement 1 do.
- Live provider/package research performed for this prompt (not from memory, per `AGENTS.md`): `ai.google.dev/gemini-api/docs/embeddings` (confirmed `gemini-embedding-001`'s `output_dimensionality` parameter, recommended truncation sizes 768/1536/3072, and — new finding, not in the user's original framing — that non-3072 outputs from `gemini-embedding-001` are **not** auto-normalized and must be manually L2-normalized by the caller, unlike the newer `gemini-embedding-2-preview`); `ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite` (confirmed the exact model string `gemini-3.1-flash-lite`, launched 2026-03-03); pgvector HNSW dimension-limit research (confirmed the 2000-dimension limit for the standard `vector` type, `halfvec` as the workaround above that — corroborates the user's stated reasoning for choosing 1536 over 3072). **Could not conclusively confirm** whether `@langchain/google-genai`'s TypeScript `GoogleGenerativeAIEmbeddings` class exposes `outputDimensionality` as a constructor option (the Python `langchain_google_genai` package requires passing `output_dimensionality` per-call, not at construction, and a LangChain forum thread titled "Add ability to set outputDimensionality for Gemini embeddings" suggests this may still be a gap in the JS client specifically) — flagged as Implementation Requirement 1 below rather than guessed at.

## Existing code inspected

- `lib/knowledge.ts` — `regenerateChunksForDocument(businessId, documentId, content)`: deletes existing chunks, calls `chunkText()`, inserts fresh rows. This is the exact function this phase extends to also compute and store embeddings — no new orchestration entry point needed.
- `lib/knowledge-sync.ts` — calls `regenerateChunksForDocument` after every generated-document upsert; unaffected structurally, benefits automatically once the shared function gains embedding generation.
- `lib/chunking.ts` — confirms chunk content is plain UTF-8 text with no existing token/length accounting beyond `char_count`; nothing here needs to change.
- `lib/supabase/server.ts` — the only existing Supabase client factory (`createServerSupabaseClient()`, per-request, Clerk-authenticated, RLS-enforced). Still the right client to use for embedding writes, per the same "synchronous, inside the authenticated user's own request" reasoning Phase 6 used to avoid a service-role client (`docs/architecture.md`'s "Knowledge ingestion (Phase 6)" section).
- `supabase/migrations/20260812134819_create_knowledge_documents_table.sql` / `20260812134821_create_knowledge_chunks_table.sql` — confirms `knowledge_chunks` has no `embedding` column yet, and confirms the RLS/grant pattern (join through `businesses`, explicit `grant` required — new tables/columns get zero default privileges).
- `supabase/config.toml` — confirms `pgvector` is not yet enabled (no `create extension vector` anywhere in `supabase/migrations/`); `extra_search_path = ["public", "extensions"]` is already set, which is where Supabase convention installs `vector`.
- `package.json` — confirms no LangChain package is installed yet. This is the first phase that adds one.
- `.env.example` — has placeholder lines for `GOOGLE_API_KEY`, `GEMINI_CHAT_MODEL`, `GEMINI_EMBEDDING_MODEL` under a "Phase 7" heading already, but no `GEMINI_EMBEDDING_DIMENSION` line yet.

## Relevant existing architecture

- Every business-owned table/column addition needs RLS (already present on `knowledge_chunks`) plus an explicit grant for the new column's access pattern — adding a column doesn't need a new grant (grants are table-level), but confirm this is actually true for Postgres column-level vs. table-level grants during migration review.
- `docs/security.md` §9's required retrieval shape: `retrieve relevant chunks WHERE business_id = <trusted business_id> ORDER BY vector similarity` — never a global similarity search.
- Phase 6 established: ingestion (here, embedding generation) runs synchronously inside the authenticated caller's own Server Action, using the existing per-request Clerk-authenticated client, not a service-role client. This phase continues that pattern for embedding writes.
- `docs/phases.md` explicitly discourages a reflexive vector index: "Create the vector index when the data volume justifies it, not reflexively."

## Decisions and assumptions

1. **`embedding` column is nullable `vector(1536)`, not `not null`.** Existing `knowledge_chunks` rows created during Phase 6 testing (before this phase) have no embedding and won't get one until their parent document is re-saved (same "re-save to fix" pattern already used for the Phase 6 index bug). A `not null` constraint would either block those rows retroactively or require a backfill script this phase doesn't build. **Flagging for confirmation** — if a one-time backfill of all existing chunks is wanted instead of relying on re-saves, say so and this prompt will add it; the current plan treats backfill as out of scope (see below).

2. **No HNSW (or any) vector index this phase.** `docs/phases.md` explicitly says not to add one reflexively, and this project's actual data volume (a handful of test businesses) doesn't justify one yet — a sequential scan over `knowledge_chunks` filtered by `business_id` is fast enough at this scale. The migration comment documents the exact command to add one later (`create index ... using hnsw (embedding vector_cosine_ops)`) so it's a known follow-up, not a forgotten one.

3. **Similarity search is a Postgres function (`match_knowledge_chunks`), `SECURITY INVOKER` (the default), not `SECURITY DEFINER`.** A definer function would run with the function owner's privileges and bypass the caller's RLS context, which is exactly the "no global similarity search" failure mode `docs/security.md` §1/§9 warns against. Staying invoker means the function only ever sees what the calling `authenticated` session's RLS policies already allow — and the function *also* takes an explicit `p_business_id` parameter and filters on it in the query body, as defense-in-depth matching every other table in this project (RLS is never the only tenant filter). `p_business_id` is resolved server-side via `requireBusinessContext()` before the RPC call, exactly like every other Phase 5/6 data-access call — never accepted from the client.

4. **Embedding generation happens synchronously inside `regenerateChunksForDocument`, not a background job.** Same reasoning as Phase 6's ingestion decision: every embedding-triggering event (creating/editing a knowledge document, or a product/service/FAQ that syncs one) already happens inside the authenticated business member's own Server Action. Adding a queue/background-job system is real new infrastructure this project doesn't have yet and Phase 7 doesn't call for. The tradeoff is added latency per save (one Gemini API round-trip per chunk, or one batched call if the client supports batching) — acceptable for v1's expected content volume, revisit if it becomes a real UX problem.

5. **L2-normalization is mandatory and implemented explicitly, not assumed.** `gemini-embedding-001` does not auto-normalize truncated (non-3072-dimension) output — this is documented Google behavior, not an assumption — so every 1536-dimension embedding this phase generates must be manually normalized (divide by its L2 norm) before being stored. Skipping this would silently corrupt similarity rankings (cosine distance depends on direction; without normalization, magnitude differences between un-normalized truncated vectors would distort results) without ever throwing an error — exactly the kind of silent-correctness bug `AGENTS.md`'s "no fabricated business facts" spirit warns against one level up (a retrieval system returning subtly wrong "closest" chunks is worse than one that visibly fails). `lib/embeddings.ts` implements this as an explicit, tested pure function.

6. **`GEMINI_EMBEDDING_DIMENSION=1536` is a real env var, not a hardcoded literal in application code**, even though only one value is supported today — the migration's `vector(1536)` column type is necessarily hardcoded (Postgres requires a literal), but `lib/embeddings.ts` reads the dimension from the env var and asserts it matches what it actually requests from the API, so a future dimension change is a one-place config change plus a new migration, not a silent mismatch.

## Open decisions this depends on

D3 (embedding model and vector dimension) — resolved this session, see `STATE.md` §4. No other open decision (D4, D6) gates Phase 7.

## Dependencies / packages required

- `@langchain/google-genai` — the Gemini embeddings client, per `AGENTS.md`'s non-negotiable stack ("LangChain as the AI orchestration layer... Gemini as the model and embedding provider"). Not in `package.json` yet — confirmed.
- `@langchain/core` — required peer dependency of `@langchain/google-genai` (the `Embeddings` base class this phase's fallback implementation, if needed, extends — see Implementation Requirement 1). Not in `package.json` yet — confirmed.
- `@google/generative-ai` — **conditional**, only installed if Implementation Requirement 1's inspection step finds the LangChain wrapper does not expose an output-dimension control and the fallback path is actually needed. Do not add it speculatively; add it only at the point the fallback is confirmed necessary, and record in `docs/architecture.md`'s new Phase 7 section which path was taken either way (LangChain-native, or this fallback), per the user's explicit instruction.

No other new dependency. `pgvector` is a Postgres extension, enabled via migration, not an npm package.

## Files likely to change

**Created:**
- `supabase/migrations/<ts>_enable_pgvector_extension.sql` — `create extension if not exists vector with schema extensions;`
- `supabase/migrations/<ts>_add_embedding_to_knowledge_chunks.sql` — adds `embedding vector(1536)` (nullable, per Decision 1) to `knowledge_chunks`; no new grant needed (table-level grants already cover the new column) — confirm this during review, note it explicitly either way.
- `supabase/migrations/<ts>_create_match_knowledge_chunks_function.sql` — the `match_knowledge_chunks(p_business_id uuid, p_query_embedding vector(1536), p_match_count int)` function (Decision 3).
- `supabase/tests/database/008_match_knowledge_chunks_tenant_isolation.sql` — pgTAP test proving the exit criterion: correct-business results for a matching query, empty results for a business with no matching knowledge.
- `lib/embeddings.ts` — `embedText(text: string): Promise<number[]>` (single) and `embedTexts(texts: string[]): Promise<number[][]>` (batch, used by chunk regeneration), plus the internal `l2Normalize()` pure function. Wraps `@langchain/google-genai`'s client per Implementation Requirement 1's confirmed mechanism.
- `lib/retrieval.ts` — `searchKnowledgeChunks(businessId: string, queryText: string, limit?: number)`: embeds the query text via `lib/embeddings.ts`, calls the `match_knowledge_chunks` RPC via `createServerSupabaseClient()`, returns typed results. This is the only consumer of the new RPC in this phase — no chat/RAG logic yet (Phase 8).

**Modified:**
- `lib/knowledge.ts` — `regenerateChunksForDocument` calls `embedTexts()` on the chunk contents and includes `embedding` in each inserted row.
- `lib/supabase/types.ts` — `KnowledgeChunk` gains `embedding: number[] | null`.
- `.env.example` — add `GEMINI_EMBEDDING_DIMENSION=`; fill in the `GOOGLE_API_KEY`/`GEMINI_CHAT_MODEL`/`GEMINI_EMBEDDING_MODEL` comments with the resolved D3 values as documentation (not real secrets).
- `docs/architecture.md` — new "Embeddings + pgvector (Phase 7)" section: the extension/column/function pattern, the L2-normalization requirement, the "no index yet" decision and its follow-up command, and whatever Implementation Requirement 1 concludes about the LangChain client's actual dimension-control mechanism.
- `STATE.md` — final step, per `AGENTS.md` §0.6.

## Database changes

**Enable the extension** (Supabase convention: install into the `extensions` schema, already on `search_path` per `supabase/config.toml`):
```sql
create extension if not exists vector with schema extensions;
```

**Add the column:**
```sql
alter table public.knowledge_chunks
  add column embedding extensions.vector(1536);
```

**Similarity search function** (exact shape subject to minor syntax correction during implementation, but this is the contract):
```sql
create or replace function public.match_knowledge_chunks(
  p_business_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    knowledge_chunks.id,
    knowledge_chunks.document_id,
    knowledge_chunks.content,
    1 - (knowledge_chunks.embedding <=> p_query_embedding) as similarity
  from public.knowledge_chunks
  where knowledge_chunks.business_id = p_business_id
    and knowledge_chunks.embedding is not null
  order by knowledge_chunks.embedding <=> p_query_embedding
  limit p_match_count;
$$;

grant execute on function public.match_knowledge_chunks(uuid, extensions.vector(1536), int) to authenticated;
```
Cosine distance (`<=>`) is the correct operator for normalized embeddings (Decision 5) — with unit-length vectors, cosine distance and the alternative operators (`<->` Euclidean, `<#>` inner product) rank identically, but `<=>` is the semantically correct choice to keep in case normalization is ever revisited.

**No vector index this migration** (Decision 2) — the migration file's comment documents the follow-up command (`create index knowledge_chunks_embedding_idx on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);`) for whoever adds it once data volume justifies it.

**Exact migration commands:** `supabase migration new enable_pgvector_extension`, `supabase migration new add_embedding_to_knowledge_chunks`, `supabase migration new create_match_knowledge_chunks_function`, hand-author each, then the user runs `supabase link` + `supabase db push` and verifies grants — the standard workflow every prior phase has used, including confirming `execute` privilege on the new function actually reaches `authenticated` (function grants are easy to forget relative to table grants, and this project has already been bitten once by an unverified-grant assumption in Phase 3).

## Server / client boundaries

`lib/embeddings.ts` and `lib/retrieval.ts` are both `server-only`. `GOOGLE_API_KEY` is a secret, read only in `lib/embeddings.ts`, never exposed to a client component, never logged. The embedding vector itself is not secret, but it's also never sent to the client in this phase — no UI consumes it yet (Phase 8/9's job).

## Implementation requirements

1. **Before writing any embedding-generation code**, inspect the actual installed `@langchain/google-genai` package's TypeScript type definitions (`node_modules/@langchain/google-genai/dist/embeddings.d.ts` or equivalent) to determine how output dimension is actually controlled in the current published version. Two possible outcomes, both planned for:
   - **If `GoogleGenerativeAIEmbeddings` exposes an `outputDimensionality` (or equivalently named) constructor option or a documented per-call parameter on `embedQuery`/`embedDocuments`:** use it directly, set to `1536` (read from `GEMINI_EMBEDDING_DIMENSION`).
   - **If it does not expose any dimension-control mechanism:** implement a small class in `lib/embeddings.ts` that extends `@langchain/core`'s `Embeddings` base class (preserving the LangChain interface for Phase 8's future retriever/vector-store code to consume) but internally calls the underlying `@google/generative-ai` SDK's `embedContent`/`batchEmbedContents` directly with `outputDimensionality: 1536` in the request — this SDK-level parameter is confirmed from live Gemini API docs regardless of what the LangChain wrapper exposes. Document whichever path was actually taken in `docs/architecture.md`'s new Phase 7 section, since this could not be confirmed in advance from documentation alone.
   - If genuinely neither path works once actually tried, stop and report back rather than shipping an un-truncated 3072-dimension embedding into a `vector(1536)` column (which would simply fail to insert, not silently corrupt data — but still stop and report).
2. `lib/embeddings.ts`'s `l2Normalize(vector: number[]): number[]` divides each component by the vector's L2 norm. Applied to every embedding before it's returned from `embedText`/`embedTexts`, per Decision 5. Pure function, unit-testable (input `[3, 4]` → output `[0.6, 0.8]`).
3. `embedTexts(texts: string[])` batches the underlying API calls where the client supports it; if only single-text calls are available, run them concurrently (`Promise.all`), not sequentially, to bound latency added to a chunk-heavy document save.
4. `lib/knowledge.ts`'s `regenerateChunksForDocument` calls `embedTexts(chunks.map(c => c.content))` after computing chunks and before inserting, zipping each chunk with its embedding in the insert payload.
5. `lib/retrieval.ts`'s `searchKnowledgeChunks(businessId, queryText, limit = 5)`: resolves nothing itself (caller must have already resolved `businessId` via `requireBusinessContext()`), embeds `queryText` via `embedText`, calls `.rpc("match_knowledge_chunks", { p_business_id: businessId, p_query_embedding: embedding, p_match_count: limit })` on `createServerSupabaseClient()`, returns the typed rows or throws `AppError` on failure — same error convention as every other `lib/` data-access module.
6. `GEMINI_EMBEDDING_DIMENSION` is read once, parsed as an integer, and asserted to equal `1536` at the point `lib/embeddings.ts` is first used (not a separate startup-validation system — this project doesn't have one yet, consistent with how every other env var is currently just read via `process.env.X!`) — if it doesn't match, throw immediately rather than silently generating a mismatched vector.

## Security requirements

- `docs/security.md` §9: `match_knowledge_chunks` filters on `p_business_id` in its own query body — RLS is not the only tenant filter, matching this project's established defense-in-depth pattern everywhere else.
- §9 also requires: "A retrieval failure must surface as the approved fallback behavior. It must never silently become a fabricated business answer." Not fully applicable yet — no AI generation exists until Phase 8/9 — but `searchKnowledgeChunks` returning an empty array for a business with no matching knowledge is the correct, expected, non-error outcome this phase's test proves, not something to paper over.
- §6: `GOOGLE_API_KEY` never logged, never reaches a client component. `lib/embeddings.ts` is `server-only`-guarded.
- §11 review checklist: the new `embedding` column is on an already-tenant-scoped table (no new FK needed); the new function is tenant-scoped by explicit parameter, not just RLS; a test proves cross-tenant isolation for the new retrieval path; no new `NEXT_PUBLIC_*` variable; no secret in logs; `GEMINI_EMBEDDING_DIMENSION`/`GOOGLE_API_KEY`/`GEMINI_EMBEDDING_MODEL` land in `.env.example` and `STATE.md` §5.

## Error handling

- Gemini API failures (rate limit, network, invalid key) during `embedText`/`embedTexts` → thrown as `AppError` with a safe message ("Something went wrong updating this content's knowledge embeddings. Please try again."), internal detail logged, propagating up through `regenerateChunksForDocument` exactly like a Supabase failure does today — the whole save is reported as failed, no silently-unembedded chunk is left behind (same "no silent inconsistency" principle the Phase 6 bugfix conversation just established).
- A dimension mismatch between what the API actually returns and `GEMINI_EMBEDDING_DIMENSION` → thrown immediately (Implementation Requirement 6), never inserted.
- `match_knowledge_chunks` RPC failure (bad params, function not found because the migration wasn't applied yet, etc.) → `AppError` from `searchKnowledgeChunks`, same convention.

## Acceptance criteria

- [ ] `vector` extension enabled; `knowledge_chunks.embedding` column exists as `vector(1536)`, nullable.
- [ ] `match_knowledge_chunks` function exists, `security invoker`, `execute` granted to `authenticated`.
- [ ] Creating or editing a knowledge document (manual, or via a product/service/FAQ) generates a normalized 1536-dimension embedding for each of its chunks and stores it.
- [ ] Each stored embedding has L2 norm equal to 1 (within floating-point tolerance).
- [ ] `searchKnowledgeChunks(businessId, queryText)` returns chunks belonging only to `businessId`, ranked by similarity.
- [ ] A business with no knowledge chunks (or none matching) gets an empty result, not an error.
- [ ] Business A's query cannot return Business B's chunks under any circumstance, proven by the pgTAP test.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `supabase test db` (runs `008_match_knowledge_chunks_tenant_isolation.sql` plus every prior test file) — attempted; if this environment still has no Docker/Supabase CLI project access, written and reviewed but not executed, reported honestly, exactly as every prior phase. The user's manual SQL-editor cross-tenant check is the fallback verification path.

## Manual testing steps

1. Apply the three new migrations, verify the `vector` extension is enabled, verify `knowledge_chunks.embedding` exists as `vector(1536)`, and verify `execute` on `match_knowledge_chunks` actually reached `authenticated` (not just assumed from the migration's `grant` line — same "verify actual grants" discipline as every prior table-creating phase, extended here to a function grant).
2. Create or edit a knowledge document with distinct, topically different paragraphs (e.g., one about pricing, one about support hours). In the Supabase SQL editor, confirm each resulting chunk has a non-null `embedding` and that `select vector_norm(embedding) from knowledge_chunks where id = '<some id>'` (or equivalent) is `1` (within floating-point tolerance) — this directly verifies Decision 5/Implementation Requirement 2, not just that *some* vector got stored.
3. Call `searchKnowledgeChunks` (via a throwaway script, a temporary debug route, or directly in the SQL editor via `select * from match_knowledge_chunks(p_business_id => '<id>', p_query_embedding => '<a real embedded query vector>', p_match_count => 3);`) with a query semantically close to the pricing paragraph. Confirm the pricing chunk ranks above the support-hours chunk.
4. **Negative/cross-tenant case:** call `match_knowledge_chunks` with Business A's `p_business_id` but a query embedding you know is close to Business B's content. Confirm it returns nothing from Business B — the `p_business_id` filter, not embedding similarity, is what should exclude it. Then, as a second check, call the function with a real `p_business_id` belonging to a business with zero knowledge chunks and confirm an empty result, not an error — this is the literal Phase 7 exit criterion from `docs/phases.md`.
5. Confirm the earlier Phase 6 sync-integration regression concern doesn't reappear here too: save a product/service/FAQ and confirm the save itself still succeeds (not just that its generated document's chunks now also carry embeddings) — this phase adds a second network call (Gemini) into the same synchronous path Phase 6 already extended once, so it's worth re-confirming the whole chain still completes successfully end-to-end, not just checking the new column in isolation.

## Out of scope

- Backfilling embeddings for `knowledge_chunks` rows created before this phase (Decision 1) — they get embeddings the next time their parent document is saved, same as the Phase 6 index-bug's fix path. A dedicated backfill script can be a small separate follow-up if the user wants existing test data fixed immediately rather than via re-save.
- The HNSW (or any) vector index (Decision 2) — explicit follow-up, not built reflexively.
- Any LangChain retriever, prompt template, or RAG pipeline — Phase 8.
- Any chat/generation use of `GEMINI_CHAT_MODEL` — Phase 9. It's pinned in `STATE.md`/`.env.example` this phase only as a recorded decision, not wired into any code path yet.
- Surfacing similarity search or embeddings in any dashboard UI — no phase has called for this yet; `searchKnowledgeChunks` is a `lib/` function with no consumer beyond its own test until Phase 8.
