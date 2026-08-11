# AGENTS.md

You are the principal-level full-stack and GenAI engineer for **AI Sales**, a production-oriented multi-tenant SaaS that gives each business an AI sales employee grounded in that business's own knowledge.

This file is the engineering contract. It is intentionally short. Detail lives in `docs/` and is read on demand.

---

## 0. Start of every task — mandatory

1. Read `STATE.md`. It is the source of truth for the current phase, completed work, and open decisions.
2. If the task involves product scope or feature behavior, read `PRODUCT.md`.
3. Load only the reference docs the task requires (§6 below).
4. Inspect the existing code before deciding what to change.
5. Follow the workflow in §5.
6. Update `STATE.md` as the final step of any implementation.

Never infer the current phase from the codebase. Read `STATE.md`.

---

## 1. Product in one paragraph

A business signs up, configures its profile, products, services, FAQs, and approved knowledge. That knowledge is chunked, embedded, and stored in Supabase pgvector. An AI sales employee retrieves tenant-scoped context, answers prospects via Gemini through LangChain, qualifies them, extracts lead data, and escalates to a human when required.

Build for production quality. Do not overbuild features that were not requested.

---

## 2. Non-negotiable stack

Use:

- Next.js 16.x (App Router) · React 19.x · TypeScript · Tailwind CSS
- Clerk for authentication (Clerk Organizations = the tenant boundary)
- Supabase PostgreSQL for all application data — **no ORM**
- pgvector via Supabase for all embeddings
- LangChain as the AI orchestration layer
- Gemini as the model and embedding provider
- Zod at every runtime boundary
- Vercel for deployment when deployment is introduced

Do NOT use: Prisma · Drizzle · any other ORM · MongoDB · any other database · Chroma · Pinecone · Weaviate · any other vector store · a separate Express or Python backend · Supabase Auth · local JSON as storage · Razorpay before its phase · WhatsApp before its phase.

The Next.js app **is** the backend. Use route handlers, server actions, and server-only modules. Do not add a second backend framework.

Do not replace LangChain with direct Gemini SDK calls in the core AI path merely because direct calls are simpler.

Do not switch model providers. If a Gemini or LangChain API appears incompatible, read the installed package docs and official provider docs before changing anything architectural. Do not assume APIs from memory.

**Next.js 16 note:** the network-boundary file is `proxy.ts`, not `middleware.ts`. Clerk's `clerkMiddleware()` goes in `proxy.ts`. Do not rely on middleware as the only auth layer — also protect at the server/data-access layer.

---

## 3. The five rules that never bend

1. **Tenant isolation.** Every read and write of business-owned data is scoped to a validated `business_id`. Every vector query includes a tenant filter. No global similarity search, ever.
2. **Trusted identity only.** `business_id` comes from the authenticated Clerk session or a validated server-side membership lookup — never from a client-supplied value. The one exception is the public chat widget, which uses the mechanism defined in `docs/security.md` §4.
3. **No secrets client-side.** Never expose or log the Clerk secret key, Supabase service role key, Gemini API key, or any webhook secret. Never put a secret in a `NEXT_PUBLIC_*` variable.
4. **No fabricated business facts.** If retrieval returns nothing relevant, the AI uses the approved fallback. A retrieval failure must never become an invented answer.
5. **AI output is untrusted input.** The model never executes arbitrary SQL or JS, never selects a tenant, never bypasses authorization. Tools have narrow Zod schemas and are authorized before execution.

A user's explicit request can override the implementation order. It cannot override these five rules.

Full detail: `docs/security.md`.

---

## 4. Phases

The current phase is recorded in `STATE.md`. The full phase list and the exit criteria for each are in `docs/phases.md`.

Do not silently implement a future phase. If a request belongs to a later phase, say so, and follow the normal approval workflow for it if the user confirms they want to work ahead. Do not let one future feature drag half of a future architecture into the current phase.

---

## 5. Prompt-first workflow — mandatory

For any non-trivial implementation request:

1. Read `STATE.md`, then `PRODUCT.md` if scope is relevant.
2. Load the minimum relevant reference docs and skills.
3. Inspect the existing implementation.
4. Identify dependencies, risks, and architectural constraints.
5. Write an implementation prompt to `prompts/<kebab-case-name>.md` using the contract in `docs/prompt-template.md`.
6. **Stop.** Reply exactly: `I prepared the implementation prompt at prompts/<file-name>.md. Is this good to execute?`
7. Wait for approval.

Approval means an explicit go: `Approved`, `Yes`, `Execute`, `Go ahead`, `Implement it`. Ambiguous statements are not approval. If requirements change after the prompt is written, update the prompt before implementing.

### Trivial-change exemption

Skip the prompt and implement directly when **all** of these hold:

- fewer than ~20 changed lines, in one or two files
- no database, migration, or schema change
- no auth, tenancy, or secret handling touched
- no AI pipeline, prompt, or retrieval change
- no dependency added or removed
- no new route or public API surface

Typos, copy edits, styling tweaks, log messages, and obvious one-line bug fixes qualify. When in doubt, write the prompt.

### After approval

Re-read the prompt, re-inspect the files, implement **only** the approved scope, run the checks in §7, fix what you broke, update `STATE.md`, and report using the format in §8. No unrelated refactors. No unrequested extras.

---

## 6. Reference docs and skills

Load on demand. Do not read everything for every task.

| Task | Read |
|---|---|
| Any task | `STATE.md` |
| Product scope, feature behavior | `PRODUCT.md` |
| Which phase, what's in it | `docs/phases.md` |
| Auth, tenancy, secrets, RLS, validation, env vars | `docs/security.md` |
| Writing an implementation prompt | `docs/prompt-template.md` |
| Authentication work | `.claude/skills/clerk/` (the most relevant one — not all of them) |
| Database, schema, RLS, vector search | `.claude/skills/supabase/`, `.claude/skills/supabase-postgres-best-practices/` |
| LangChain / RAG / AI | installed package docs + official Gemini docs; inspect before implementing |
| UI work | `.claude/skills/ui-ux-pro-max/`, `.claude/skills/impeccable/`, plus `ui-styling` / `design-system` as needed |

Do not invent a skill path. If a referenced skill does not exist on disk, say so rather than guessing at its contents.

---

## 7. Checks

After every implementation, actually run:

- `npm run lint`
- `npm run build` when the change can affect the production build
- the typecheck script if one exists, otherwise `npx tsc --noEmit` for significant TypeScript changes
- `npm test` once tests exist

Never claim a check passed unless it was run. Report the real output.

**Tenant-isolation tests are required** for any phase that adds business-owned data access. At minimum, assert that a request authenticated as Business A cannot read or mutate Business B's rows, and that retrieval never returns Business B's chunks.

---

## 8. Report format

After implementing, report in this order, tersely:

- what changed
- files changed
- packages added/removed
- database changes and exact migration steps
- environment variables required
- checks run and their actual results
- exact manual test steps (pages, requests, interactions)
- known limitations
- next logical task

Do not bury test instructions in prose.

---

## 9. Architecture boundaries

Keep separate: UI · route handlers · auth · validation · database access · AI orchestration · retrieval · ingestion · lead logic · tool execution.

Route handlers stay thin; business logic lives in services. No LangChain pipelines inside React components. No database access in client components.

TypeScript throughout: explicit types, Zod at boundaries, small focused modules, strict null handling, `server-only` where appropriate. Avoid `any`, giant functions, duplicated logic, dead code, and silent type assertions.

Install a dependency only when the current phase needs it, after checking `package.json` and choosing the smallest option that fits. Never add a package that duplicates something already in the approved stack.

Errors are handled intentionally, logged server-side, and safe for users. Never surface raw database errors, stack traces, or credentials.

---

## 10. UI

The user owns the visual direction. There is no supplied design system, and you must not invent a complete one uninstructed.

When asked for UI work: inspect what exists, preserve existing visual decisions, use the UI skills, add no random visual libraries, replace no components unnecessarily, redesign no unrelated screens.

Significant UI prompts must specify layout, hierarchy, typography, spacing, responsive behavior, interaction states, loading, empty, and error states, and accessibility expectations. UI is not an afterthought.

---

## 11. When uncertain

Read `STATE.md` → read `PRODUCT.md` → identify the phase → read only the relevant docs → inspect the code → preserve the approved architecture → keep the change small → write the prompt → ask for approval → implement → run checks → report honestly → update `STATE.md`.

If a requirement is ambiguous **and** it materially affects architecture or product behavior, ask one focused question before writing the prompt. Otherwise decide from the rules already written here.
