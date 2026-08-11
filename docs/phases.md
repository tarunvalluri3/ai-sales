# Implementation phases

Read this when you need to know what belongs in a phase or whether a request is future scope. The **currently active phase is in `STATE.md`** — not here, and never inferred from the codebase.

Build in this order unless the user explicitly overrides it. An override changes the order, not the security rules in `docs/security.md`.

Each phase lists an **exit criterion**. A phase is complete only when the user confirms it, and completion must be recorded in `STATE.md`.

---

## Phase 0 — Project foundation

Verify the Next.js 16 / React 19 / TypeScript / Tailwind setup and scripts. Establish folder architecture, environment-variable structure, server/client boundaries, shared validation and error conventions, and the `prompts/` workflow.

No product features.

**Exit:** `npm run lint` and `npm run build` pass on a clean checkout, `.env.example` exists, and the folder conventions are documented.

## Phase 1 — Next.js application architecture

App Router structure, route organization, reusable server/client patterns, `server-only` utilities, route handler conventions, error handling, validation conventions, loading and error boundaries where needed.

Keep it simple. No speculative abstraction.

**Exit:** a request can flow through a route handler with validated input, typed result, and controlled error response, with no product logic yet.

## Phase 2 — Clerk authentication

Clerk installation and configuration, sign-in, sign-up, protected application areas, authenticated server-side access, user identity handling.

Resolve decision **D1** (Clerk Organizations vs. one business per user) before starting. Remember: the middleware file is `proxy.ts` in Next.js 16, and middleware alone is not sufficient protection — enforce at the data-access layer too.

Do not build business onboarding here beyond what authentication requires.

**Exit:** an unauthenticated visitor cannot reach a protected route by any path, verified manually, and server code can reliably obtain the authenticated identity.

## Phase 3 — Supabase + PostgreSQL foundation

Supabase connection, server/client Supabase utilities, initial migrations, database conventions, the tenant/business foundation, indexes, constraints, secure access patterns.

Resolve decision **D2** (RLS strategy) before writing migrations.

Use explicit relational schemas, foreign keys, indexes, constraints, timestamps, and uniqueness rules. UUIDs unless there is a strong reason otherwise. Create schema progressively — no tables "for later."

**Exit:** migrations apply cleanly from scratch, the business table and membership link exist, and a tenant-isolation test proves Business A cannot read Business B's rows.

## Phase 4 — Business onboarding

The flow through which an authenticated owner establishes their business profile. Must create the business record and correctly associate the authenticated user as its owner.

Exact fields are decided in this phase's prompt.

**Exit:** a new user can go from sign-up to an owned business record with no manual database work.

## Phase 5 — Products / Services / FAQs

Business-owned structured knowledge: products, services, FAQs, relevant metadata, CRUD, validation, tenant isolation.

These records are part of the AI's knowledge and must be reachable by retrieval later.

**Exit:** full CRUD works for each type, all queries are tenant-scoped, and isolation tests cover every new table.

## Phase 6 — Knowledge ingestion

The first ingestion pipeline: approved knowledge → documents → chunks.

Supported knowledge types must be explicitly defined before implementation — see decision **D5**. For v1 this is pasted/typed text plus the structured records from Phase 5. No arbitrary web crawling or file types without a product requirement.

**Exit:** a business can add knowledge and see it correctly chunked and stored against its own `business_id`.

## Phase 7 — Embeddings + pgvector

Embedding generation, chunk embeddings, pgvector storage, tenant-aware metadata, similarity search, indexes, safe retrieval functions.

Resolve decision **D3** first: confirm the current Gemini embedding model and its exact output dimension from live provider documentation, pin both, then write the migration. **Never guess a dimension.** Create the vector index when the data volume justifies it, not reflexively.

All vector logic stays server-side.

**Exit:** similarity search returns relevant chunks for the correct business and returns nothing for a business with no matching knowledge — proven by a test, not by inspection.

## Phase 8 — LangChain RAG

Document retrieval, tenant-scoped retriever, LangChain prompt templates, context construction, the retrieval pipeline, grounded generation, source metadata where required, validation and error handling.

The model must answer from retrieved business context when the question is business-specific, and must not fabricate when context is missing.

**Exit:** a question with no supporting knowledge produces the fallback behavior from `PRODUCT.md` §7, not an invented answer.

## Phase 9 — Gemini AI Sales Employee

System instructions, business context, retrieved knowledge, conversation context, sales-oriented behavior, qualification behavior, business-specific communication, safe fallback, structured outputs where needed.

The AI behaves as an employee of one specific tenant, not a generic assistant.

**Exit:** the same question asked against two different businesses yields two correctly-grounded, non-overlapping answers.

## Phase 10 — Lead extraction and creation

Lead extraction, structured validation, persistence, conversation-to-lead association, tenant isolation, lead status, dashboard-readable data.

Resolve decision **D6** — the lead field specification must be written into `PRODUCT.md` §8 first. Do not invent fields.

**Exit:** a realistic conversation produces a correctly-attributed, validated lead row.

## Phase 11 — Chat API

The backend chat contract: business context resolution, conversation creation, message handling, LangChain invocation, Gemini response, persistence, errors, and rate/abuse protection appropriate to the stage. Streaming only if explicitly approved.

Resolve decision **D4** — the public widget identity mechanism (`docs/security.md` §4) — before exposing any unauthenticated endpoint.

Route handlers stay thin; logic lives in services.

**Exit:** the endpoint is exercised end-to-end with a widget key, is rate limited, and rejects a forged or mismatched `business_id`.

## Phase 12 — Chat UI

Only after the chat backend is stable. Consumes the established API contract. Message display, input, loading/typing state, errors, empty state, mobile responsiveness, accessible interactions.

No AI business logic in the UI.

**Exit:** a prospect can hold a full conversation on mobile and desktop, including through an API failure, without a broken state.

## Phase 13 — Business dashboard

The business-facing dashboard, limited to the approved scope. Candidate areas: overview, business profile, products/services/FAQs, knowledge, conversations, leads, AI configuration.

Build only areas the user approves.

**Exit:** each built area is tenant-scoped and verified against a second test business.

## Phase 14 — AI tools / actions

Only after core RAG and chat are stable. Tools need clear Zod input schemas, authorization, tenant validation, safe execution, explicit success/failure results, and logging.

The model never executes arbitrary code or queries.

**Exit:** a tool invoked with a forged tenant or malformed input fails closed, with a test proving it.

## Phase 15 — Human handoff

Escalation from AI to a human representative. Mechanism is product-defined. The AI must recognize when to stop answering and hand over.

**Exit:** an escalation trigger reliably moves a live conversation to human control and the prospect sees a coherent transition.

## Phase 16 — WhatsApp

Deliberately late-stage. Do not install or implement anything WhatsApp-related earlier unless the user explicitly overrides the plan.

When built, reuse the same conversation, AI, and lead services. Do not create a second AI system.

## Phase 17 — Razorpay

Deliberately late-stage. Plans, subscription state, payment handling, webhook signature verification, entitlement checks, tenant-aware billing state.

Never trust client-supplied payment or subscription status.

## Phase 18 — Analytics / monitoring

Production observability after the core product works. Approved tools only. Track meaningful events without logging secrets or unnecessary personal data.

## Phase 19 — Production hardening

Security review · tenant-isolation review · auth review · server/client secret review · validation review · error handling · rate limiting and abuse · database indexes · vector query performance · build checks · deployment configuration · environment validation · logging · responsive UI checks · accessibility checks · production smoke tests.

A working dev server is not production readiness.
