# STATE.md

**Read this file first, at the start of every task.** It is the source of truth for where the project stands. Never infer the current phase from the codebase.

Last updated: 2026-08-11

---

## 1. Current phase

**Phase 1 — Next.js application architecture**

Phase 0 is complete — all exit criteria in `docs/phases.md` confirmed met, see §2. No product features exist yet.

Exit criteria for Phase 1 are in `docs/phases.md`.

---

## 2. Completed phases

### Phase 0 — Project foundation — completed 2026-08-11
- What exists now: `create-next-app` boilerplate replaced (metadata, home page); `.env.example` documenting the full planned core env var set (no real values); `docs/architecture.md` documenting the no-`src/` layout, `lib/` server-only convention, validation convention (deferred), and error-handling convention; `lib/errors.ts` (`AppError` + `logAndGetUserMessage`), server-only-guarded.
- Key files: `app/layout.tsx`, `app/page.tsx`, `.env.example`, `docs/architecture.md`, `lib/errors.ts`.
- Migrations applied: none.
- Env vars added: none actually wired — `.env.example` documents the planned set only; still none required by any implemented phase.
- Decisions made this phase: kept top-level `app/` (no `src/`); deferred installing Zod to Phase 1 (no runtime boundary exists yet — see `prompts/phase-0-foundation.md` "Decisions and assumptions" for full reasoning); added `server-only` package now since it has an immediate use (`lib/errors.ts`) and directly serves the phase's server/client-boundary goal; `eslint.config.mjs` updated (trivial-change exemption) to ignore `.agents/**` and `.claude/**` so lint reflects application code only.
- Known gaps carried forward: none.

---

## 3. Next up

Phase 1 is now in progress (current phase, see §1). Zod will be installed as part of it (deferred from Phase 0 — see §2 above).

---

## 4. Open decisions

These must be resolved before the phase noted. **Do not implement past a decision's deadline phase while it is still open** — ask the user to decide first.

| # | Decision | Needed by | Status | Recommended default |
|---|---|---|---|---|
| D1 | Tenancy model: Clerk Organizations vs. one business per user | Phase 2 | **OPEN** | Clerk Organizations. `PRODUCT.md` requires multiple members per business, and retrofitting orgs after Phase 3 rewrites the schema and every auth call. |
| D2 | Tenant isolation enforcement: Postgres RLS vs. application-layer only | Phase 3 | **OPEN** | Defense in depth: RLS enabled on every business-owned table, plus a mandatory `business_id` filter in the data-access layer. Note that the Supabase service role key bypasses RLS, so if all server access uses it, RLS protects nothing on its own. |
| D3 | Embedding model and vector dimension | Phase 7 | **OPEN** | Confirm the current Gemini embedding model and its output dimension from live provider docs at the start of Phase 7. Pin both here and in `.env.example` before writing the migration. Never guess the dimension. |
| D4 | Public chat widget identity mechanism | Phase 11 | **OPEN** | Per-business public widget key, resolved server-side to `business_id`, with an origin allowlist and rate limiting. See `docs/security.md` §4. |
| D5 | Approved knowledge source types for v1 | Phase 6 | **OPEN** | Start with pasted/typed text and structured records (products, services, FAQs) only. Add file upload and URL ingestion as separate, explicitly scheduled work. |
| D6 | Lead field specification | Phase 10 | **OPEN** | Define the exact lead schema in `PRODUCT.md` before Phase 10. `AGENTS.md` forbids inventing lead fields, so this must exist. |

### Resolved decisions

_None yet._

<!--
| # | Decision | Resolved | Outcome |
|---|---|---|---|
-->

---

## 5. Environment variables in use

Only variables actually required by implemented phases. Keep in sync with `.env.example`.

_None yet._ Phase 0 added `.env.example` documenting the full planned core set below as placeholders (no real values) — no variable is actually required/read by the app yet.

Planned core set (see `docs/security.md` §5):
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`, `GEMINI_CHAT_MODEL`, `GEMINI_EMBEDDING_MODEL`

---

## 6. Database state

Migrations applied: _none_

Tables: _none_

---

## 7. Approved prompts

| Prompt file | Phase | Status |
|---|---|---|
| `prompts/phase-0-foundation.md` | 0 | implemented |

Status values: `draft` · `approved` · `implemented` · `superseded`

---

- `npm run build` and `npx tsc --noEmit` both pass cleanly.
- `npm run lint` previously reported 15 errors / 304 warnings, all inside `.agents/` and `.claude/` skill-package files (not application code). Fixed 2026-08-11 under the trivial-change exemption: `eslint.config.mjs` now ignores `.agents/**` and `.claude/**` (they are skill packages, not app code, and were never intended to be linted as part of this project). `npm run lint` now reports zero errors and zero warnings across the whole repo.

**Phase 0 exit criteria (docs/phases.md) — all met:**
- `npm run lint` passes on a clean checkout — confirmed, zero errors/warnings.
- `npm run build` passes — confirmed.
- `.env.example` exists — confirmed.
- Folder conventions are documented — confirmed, `docs/architecture.md`.

---

## How to update this file

At the end of every implementation, the agent must:

1. Move the phase entry into §2 if the phase is complete, and update §1 and §3.
2. Add any new env vars to §5 and migrations/tables to §6.
3. Update the prompt's status in §7.
4. Record any decision that got resolved, and any new decision that got deferred, in §4.
5. Add anything knowingly left unfinished to §8.
6. Update the "Last updated" date at the top.

If the agent implemented something but did not update this file, the work is not finished.
