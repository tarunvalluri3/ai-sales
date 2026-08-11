# STATE.md

**Read this file first, at the start of every task.** It is the source of truth for where the project stands. Never infer the current phase from the codebase.

Last updated: _(set on first update)_

---

## 1. Current phase

**Phase 0 — Project foundation**

Nothing has been implemented yet. No product features exist.

Goal of this phase: a clean, running Next.js 16 + TypeScript + Tailwind app with the folder architecture, environment-variable structure, server/client boundaries, validation and error conventions, and the `prompts/` workflow in place. No product features.

Exit criteria are in `docs/phases.md`.

---

## 2. Completed phases

_None yet._

<!--
Append one entry per completed phase, newest last. Keep entries short.

### Phase 0 — Project foundation — completed YYYY-MM-DD
- What exists now: ...
- Key files: ...
- Migrations applied: ...
- Env vars added: ...
- Known gaps carried forward: ...
-->

---

## 3. Next up

Phase 1 — Next.js application architecture.

Do not start it until Phase 0 is approved as complete by the user.

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

_None yet — added during Phase 0._

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
| _none yet_ | | |

Status values: `draft` · `approved` · `implemented` · `superseded`

---

## 8. Known limitations / debt

_None recorded yet._

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
