# PROJECT.md — AI Sales

**Generated from direct repository inspection on 2026-08-15.** This document cross-checks `STATE.md`, `PRODUCT.md`, `AGENTS.md`, `docs/architecture.md`, `docs/security.md`, `docs/phases.md`, the actual source tree, migrations, and route handlers. Where this file and `STATE.md` disagree, `STATE.md` is the project's own source of truth for phase status — this document exists as a snapshot/handoff view, not a replacement for it.

> Note: `STATE.md` is 700+ lines of granular, phase-by-phase history. This document distills the *current, resulting state* of the system for someone who wants to understand or run the app today, without reading the full change history. For "why was X built this way," `STATE.md` and `docs/architecture.md` remain the authoritative, more detailed sources.

---

## 1. Project overview

**AI Sales** is a multi-tenant SaaS product that gives each business an AI sales employee — a Gemini-powered chat agent, embedded on the business's own website, that answers prospects using only that business's approved knowledge, qualifies leads, and hands off to a human when needed.

**Problem solved:** small/mid businesses get inconsistent, slow, or unavailable coverage of repetitive pre-sales chat ("what does this cost," "do you offer X," "can someone call me"). AI Sales lets a business train an AI on its own product/service/FAQ data and let it handle that traffic, while cleanly escalating anything it can't or shouldn't answer.

**Target users:**
- **Business owners/members** (authenticated via Clerk, grouped into a Clerk Organization = one tenant) — configure the business, its products/services/FAQs/knowledge, review conversations and leads, take over conversations from the AI.
- **Prospects** (anonymous, unauthenticated) — chat with the AI via an embeddable widget on the business's own site.

**Core workflow** (`PRODUCT.md` §5, confirmed built end-to-end):
```
Owner signs up (Clerk) → onboarding creates a business record
  → adds products / services / FAQs
  → adds free-text knowledge documents
  → content is chunked, embedded (Gemini), stored in pgvector, scoped to business_id
Prospect opens the embedded chat widget on the business's site
  → widget key resolves server-side to a business_id (never client-supplied)
  → tenant-scoped retrieval over that business's chunks only
  → Gemini (via LangChain) generates a grounded answer, or the approved fallback if nothing is grounded
  → the AI can call tools: look up an exact product/service, look up an FAQ, or log a callback request
  → the AI flags conversations needing human attention; a human can take over at any time
  → the business reviews conversations, leads, and basic analytics in the dashboard
```

This is **not** a generic chatbot and **not** fine-tuning — "training the AI" means retrieval-augmented generation (RAG) over tenant-scoped stored content, not weight modification (`PRODUCT.md` §6).

---

## 2. Tech stack (verified against `package.json` and code)

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16.3.0 (App Router) | No `src/`; `app/` at repo root. Network boundary file is `proxy.ts`, **not** `middleware.ts` (Next 16 convention). |
| UI | React 19.2.8, Tailwind CSS 4 | No component library; hand-built components, colocated per route. |
| Auth | Clerk (`@clerk/nextjs` ^7.7.3) | Clerk **Organizations** = the tenant boundary. Clerk Auth only — Supabase Auth explicitly not used. |
| Database | Supabase PostgreSQL (`@supabase/supabase-js` ^2.112.3) | No ORM (Prisma/Drizzle forbidden by `AGENTS.md`). Imperative SQL migrations under `supabase/migrations/`. |
| Vector store | Supabase **pgvector** | `vector(1536)` column on `knowledge_chunks`, no separate vector DB. |
| AI orchestration | LangChain (`@langchain/core` ^1.2.5, `@langchain/google-genai` ^2.2.0) | `ChatGoogleGenerativeAI` for chat/tools/structured output. |
| Embeddings | `@google/genai` ^2.16.0 (direct SDK, not via LangChain — see §11) | `gemini-embedding-001`, truncated to 1536 dims, manually L2-normalized. |
| Chat model | Gemini `gemini-3.1-flash-lite` | Set via `GEMINI_CHAT_MODEL`. |
| Validation | Zod ^4.4.3 | Required at every runtime boundary (request bodies, AI structured output, env vars). |
| Charts | `recharts` ^3.10.1 | Analytics page only, added in the UI redesign pass. |
| Motion | `motion` ^13.1.0 | Scroll reveals, live-message transitions, gated by `useReducedMotion()`. |
| Testing | pgTAP, run via `scripts/run-pgtap-tests.mjs` (`npm test`) | Runs against the **live linked** Supabase project (no local Docker stack available), not `supabase test db`. |
| Deployment target | Vercel (implied by `maxDuration` route config, no `vercel.json` yet) | Not yet deployed per any doc found; no CI configured. |

**Explicitly not used** (per `AGENTS.md` §2, confirmed absent from `package.json`): Prisma/any ORM, MongoDB, Chroma/Pinecone/Weaviate, a separate backend service, Supabase Auth, Razorpay, WhatsApp SDKs.

---

## 3. System architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Prospect's website          │        │  Dashboard (Clerk-authed)     │
│  <script src=widget-loader.js│        │  app/(dashboard)/dashboard/*  │
│  data-widget-key="...">      │        │  Server Components + Actions  │
└───────────┬──────────────────┘        └──────────────┬────────────────┘
            │ same-origin fetch                          │ requireBusinessContext()
            │ (loader runs in host page's JS context)     │ (Clerk session)
            ▼                                              ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Next.js App Router — route handlers + Server Actions (the backend)     │
│  /api/chat, /api/chat/poll   — public, widget-key resolved, service-role│
│  Server Actions under dashboard/* — Clerk-session client, RLS-backed    │
└───────────────────────┬──────────────────────────────┬──────────────────┘
                         │                                │
                         ▼                                ▼
        ┌───────────────────────────┐      ┌───────────────────────────────┐
        │ lib/rag.ts — retrieval +  │      │ Supabase PostgreSQL             │
        │ generation pipeline        │◄────►│ businesses/products/services/  │
        │ (LangChain + Gemini)       │      │ faqs/knowledge_*/conversations/│
        │ tools: check_product_     │      │ messages/leads/rate_limit_*    │
        │ details, check_faq_topic, │      │ RLS + service-role dual model  │
        │ request_callback          │      │ pgvector on knowledge_chunks   │
        └───────────────────────────┘      └───────────────────────────────┘
```

**Two independent App Router route groups**, each its own root layout (`docs/architecture.md`):
- `app/(dashboard)/` — the authenticated dashboard, marketing homepage, sign-in/up, onboarding. Wrapped in `ClerkProvider`.
- `app/(widget)/` — only `/widget/embed`, the iframe the loader script mounts. No Clerk, no dashboard chrome — a prospect must never see either.

**Two Supabase client types** (`lib/supabase/server.ts` vs `lib/supabase/service.ts`):
- **Clerk-session client** — used by every dashboard Server Action/page. RLS-scoped to the caller's org via Clerk JWT claims wired into Supabase's third-party auth integration.
- **Service-role client** — used only by `/api/chat` and `/api/chat/poll` (the public widget endpoints, which have no Clerk session). RLS is bypassed entirely on this path; the application-layer `business_id` filter is the *only* tenant boundary there.

**Data flow for a widget message:** widget key + Origin header → `resolveBusinessFromWidgetKey()` → trusted `business_id` → rate limits (ip/key/conversation) → persist prospect message → if `control === "human"`, return canned ack (never call the model) → else retrieve tenant-scoped chunks → tool-calling loop (up to 2 iterations) → structured-output generation → persist AI message → flag `needs_attention` if escalated → response.

---

## 4. Feature inventory

Legend: ✅ Implemented & verified · 🟡 Partial/limited · ⛔ Planned, not built

| Feature | Status | Notes |
|---|---|---|
| Clerk sign-up/sign-in, Organizations as tenant | ✅ | Phase 2 |
| Business onboarding (org-admin only) | ✅ | Phase 4 |
| Products / Services / FAQs CRUD | ✅ | Phase 5, any org member can CRUD (decision D7) |
| Free-text knowledge documents | ✅ | Phase 6. File upload / URL / crawling explicitly **⛔ not built**, out of scope until scheduled |
| Chunking + Gemini embeddings + pgvector storage | ✅ | Phase 7, 1536-dim, L2-normalized |
| Tenant-scoped similarity search | ✅ | `match_knowledge_chunks()` Postgres function |
| RAG grounded chat generation with fallback | ✅ | Phase 8/9 — never fabricates when retrieval is empty (hard bypass, no model call) |
| Business-specific AI persona | ✅ | Phase 9 — name-only in system prompt (see §11 for what's *not* wired in) |
| AI tool: exact product/service lookup | ✅ | `check_product_details`, Phase 14a |
| AI tool: FAQ lookup | ✅ | `check_faq_topic`, Phase 14b |
| AI tool: callback request → lead write | ✅ | `request_callback`, Phase 14c — first write-capable tool, consent-gated |
| Lead capture from tool calls | ✅ | Only via `request_callback`; the old whole-transcript extractor is dead code, **removed** in Phase 19b |
| Public embeddable chat widget | ✅ | `public/widget-loader.js` + `/widget/embed` iframe, postMessage bridge |
| Rate limiting (IP/key/conversation, + poll scopes) | ✅ | Postgres counter table, atomic increment function |
| Origin allowlist per business | ✅ | Fails closed until an owner sets `widget_allowed_origin` |
| Human handoff: control state + AI-pause guard | ✅ | Phase 15a — `control` only changes via explicit dashboard action, never from AI output |
| Staff reply from dashboard, delivered to widget | ✅ | Phase 15b — polling-based (widget 6s, dashboard 3s), not WebSocket/SSE |
| In-app attention badge + sound alert | ✅ | Phase 15c — Web Audio synthesized chime, no audio asset |
| Dashboard: Overview/KPIs, Business Profile, Products, Services, FAQs, Knowledge, Conversations, Leads, Widget Settings, Analytics | ✅ | 9 dashboard nav sections, all tenant-scoped |
| In-app analytics (conversation/message/lead counts, breakdowns) | ✅ | Phase 18, read-only queries, no third-party analytics tool |
| Structured server-side event logging | ✅ | Phase 18, `lib/logger.ts`, closed metadata type (no free text/PII) |
| Security headers, startup env validation, ILIKE escaping, pgTAP wired to live DB | ✅ | Phase 19 (audit + remediation) |
| Marketing homepage | ✅ | Added in the 2026-08-15 UI redesign, replacing the Phase-0 placeholder |
| WhatsApp channel | ⛔ | Phase 16, explicitly deferred by user decision (not cancelled) |
| Razorpay billing | ⛔ | Phase 17, explicitly deferred by user decision (not cancelled) |
| File upload / URL / web-crawling knowledge ingestion | ⛔ | Explicitly out of scope for v1 (`PRODUCT.md` §10) |
| Role model beyond org-admin/any-member | 🟡 | No fine-grained roles; CRUD is any-member, onboarding/profile edits are org-admin-only |
| CI pipeline | ⛔ | None found; `npm test` requires an interactively-authenticated `supabase` CLI, not CI-portable yet (documented gap) |
| Vector index (HNSW) on `knowledge_chunks` | ⛔ (deliberately) | Deferred until data volume justifies it; live check in Phase 19 found only 5 rows for one business, nowhere near the threshold |

---

## 5. Application / module structure

### Routes (`app/`)

```
app/
├─ api/
│  ├─ health/route.ts              GET, permanent health check
│  └─ chat/
│     ├─ route.ts                  POST — the public widget chat endpoint
│     └─ poll/route.ts             POST — public widget polling endpoint
├─ (dashboard)/                    root layout: ClerkProvider, marketing/dashboard chrome
│  ├─ page.tsx                     public marketing homepage
│  ├─ layout.tsx, globals.css
│  ├─ _components/                 site-header (3 header variants by path), homepage sections
│  ├─ sign-in/[[...sign-in]], sign-up/[[...sign-up]]/   Clerk-hosted UI (custom dark theme)
│  ├─ session-tasks/choose-organization/                Clerk org-selection task
│  ├─ onboarding/                  business-creation flow (org-admin only)
│  └─ dashboard/                   nested layout (sidebar/mobile nav), 9 sections:
│     ├─ page.tsx                  Overview: KPIs, recent activity, pipeline, quick actions
│     ├─ profile/                  Business Profile (org-admin only)
│     ├─ products/, services/, faqs/    CRUD + [id]/edit
│     ├─ knowledge/                list + inline create + [id]/edit
│     ├─ conversations/            list + [id] detail (live-polling, control toggle, replies)
│     ├─ leads/                    list, status updates
│     ├─ widget-settings/          widget key display, origin config
│     ├─ analytics/                stat tiles + breakdown charts
│     └─ actions.ts, _components/  shared Server Actions, AttentionProvider, nav
└─ (widget)/                       independent root layout — no ClerkProvider, no dashboard chrome
   ├─ layout.tsx, widget.css
   └─ widget/embed/                iframe page: panel, composer, message list/bubble, escalation banner
```

### Backend logic (`lib/`, all `server-only`)

| Module | Responsibility |
|---|---|
| `lib/auth.ts` | Clerk identity (`requireAuthContext()`), role checks |
| `lib/business-context.ts`, `lib/business.ts` | `{ userId, businessId }` resolution (`requireBusinessContext()`), business profile CRUD |
| `lib/products.ts`, `lib/services.ts`, `lib/faqs.ts` | Structured-knowledge CRUD, each syncing a generated `knowledge_documents` row |
| `lib/knowledge.ts`, `lib/knowledge-sync.ts`, `lib/chunking.ts` | Manual knowledge CRUD, product/service/FAQ → document sync, deterministic text chunking |
| `lib/embeddings.ts` | `TruncatedGeminiEmbeddings` — Gemini embedding calls + L2 normalization |
| `lib/retrieval.ts` | `searchKnowledgeChunks()` — tenant-scoped similarity search |
| `lib/rag.ts` | `askSalesEmployee()` — the full retrieval → tool-calling → generation pipeline |
| `lib/tools/*.ts` | `check-product-details.ts`, `check-faq-topic.ts`, `request-callback.ts` — AI tool executors |
| `lib/conversations.ts`, `lib/messages.ts` | Conversation/message CRUD, control-state transitions, attention flag |
| `lib/leads.ts` | Lead CRUD, status updates |
| `lib/widget-auth.ts` | `resolveBusinessFromWidgetKey()` — the widget's entire trust boundary |
| `lib/rate-limit.ts` | `checkAndIncrementRateLimit()` wrapping the Postgres counter function |
| `lib/http/widget-cors.ts` | CORS headers, Origin/IP extraction, shared by both public routes |
| `lib/analytics.ts` | Read-only count queries for the Analytics page |
| `lib/logger.ts` | `logEvent()` — structured, PII-safe event logging |
| `lib/env.ts`, `instrumentation.ts` | Startup env-var validation (fails fast on boot) |
| `lib/sql-escape.ts` | `escapeLikePattern()` — `ILIKE` wildcard injection guard |
| `lib/errors.ts`, `lib/api-response.ts` | `AppError`/`logAndGetUserMessage`, shared JSON envelope |
| `lib/supabase/server.ts`, `lib/supabase/service.ts`, `lib/supabase/types.ts` | The two client constructors + hand-written row types |
| `lib/schemas/*.ts` | Zod schemas colocated by domain (`lead.ts`, `business.ts`, `catalog.ts`, `knowledge.ts`) |
| `lib/clerk-appearance.ts` | Shared dark-theme `appearance` object for Clerk-hosted components |

### Public static assets
- `public/widget-loader.js` — the entire embed mechanism, framework-free vanilla JS. Creates the iframe, owns the widget-side fetch/poll calls (for genuine `Origin` header propagation), and the postMessage bridge.
- `public/test-widget.html` — a pre-existing fixture host page used for manual/automated widget testing.

---

## 6. Database

No ORM; Supabase Postgres, 29 migrations applied in order under `supabase/migrations/`. RLS is enabled **and forced** on every business-owned table (decision D2: defense in depth — RLS *and* app-layer `business_id` filtering, not either alone).

### Tables

| Table | Key columns | Tenant link | Notable constraints |
|---|---|---|---|
| `businesses` | `id`, `clerk_org_id` (unique), `name`, `description`/`contact_email`/`contact_phone`/`website` (display-only, not read by the AI), `widget_key` (unique uuid, auto-generated), `widget_allowed_origin` | *is* the tenant | RLS: select/insert (org-match) + column-scoped update |
| `products` | `id`, `business_id`, `name`, `description`, `price` | fk → businesses | 4 RLS policies (CRUD), any org member |
| `services` | same shape as `products` | fk → businesses | " |
| `faqs` | `id`, `business_id`, `question`, `answer` | fk → businesses | " |
| `knowledge_documents` | `id`, `business_id`, `source_type` (`manual`/`product`/`service`/`faq`), `source_id` (no FK — polymorphic, app-enforced), `title`, `content` | fk → businesses | unique `(business_id, source_type, source_id)` |
| `knowledge_chunks` | `id`, `business_id`, `document_id`, `chunk_index`, `content`, `embedding vector(1536)` (nullable) | fk → businesses, documents | select/insert/delete only — never updated in place |
| `conversations` | `id`, `business_id`, `source`, `control` (`ai`/`human`, default `ai`), `needs_attention` (bool) | fk → businesses | partial index on `needs_attention = true`; `control` is `authenticated`-writable, `needs_attention` is service-role-write-only |
| `messages` | `id`, `business_id`, `conversation_id`, `role` (`user`/`assistant`/`human_agent`), `content` | fk → businesses, conversations | `authenticated` may only `INSERT` `human_agent` rows, and only when the conversation's `control = 'human'` (RLS-enforced, first authenticated write into this table) |
| `leads` | `id`, `business_id`, `conversation_id` (unique), `contact_name/email/phone`, `interest_type`/`interest_id` (no FK — polymorphic), `notes`, `qualification` (`hot`/`warm`/`cold` + reason, **AI-generated, display-only, untrusted**), `status` (`new`→`contacted`→`converted`/`lost`), `source`, `requested_callback` | fk → businesses, conversations | `leads_contact_required` check (email or phone required); `leads_conversation_id_unique` (one lead per conversation) |
| `rate_limit_counters` | `scope` (`ip`/`key`/`conversation`/`poll_ip`/`poll_conversation`), `identifier`, `window_start`, `request_count` | not business-owned | zero grants to `anon`/`authenticated`; only the service role writes, via a `security invoker` function |

### Functions
- `match_knowledge_chunks(p_business_id, p_query_embedding, p_match_count)` — tenant-scoped similarity search, `security invoker`, `EXECUTE` granted only to `authenticated` (explicitly revoked from `anon`/`PUBLIC` after an initial gap — see `docs/architecture.md` for the full incident writeup).
- `increment_rate_limit_counter(p_scope, p_identifier, p_window_seconds)` — atomic upsert-increment, `EXECUTE` granted only to `service_role`.

### Relationships
`businesses` (1) → `products`/`services`/`faqs`/`knowledge_documents`/`conversations`/`leads` (many, cascade delete) → `knowledge_documents` → `knowledge_chunks` (cascade) → `conversations` → `messages` (cascade), `leads` (one-to-one via unique `conversation_id`).

### Known DB-level debt (from `STATE.md` §8, unresolved)
- A schema-wide `ALTER DEFAULT PRIVILEGES ... FOR ROLE supabase_admin` fix for functions is **structurally impossible** through a normal Supabase migration connection (permission denied — `supabase_admin` membership isn't available). Standing mitigation: every new function must get its own explicit revoke, verified live — there is no schema-wide safety net for functions the way there is for tables.
- Whether the table-level default-privileges fix has the same two-owning-roles gap has never been independently re-verified against `pg_default_acl`.

---

## 7. API surface

Only two genuinely public endpoints exist; everything else is Server Actions behind Clerk auth (not REST endpoints — no separate documented API surface for dashboard operations).

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/health` | GET | none | Permanent health check, Zod-validated `verbose` query param |
| `/api/chat` | POST, OPTIONS | **widget key + origin check** (not Clerk) | Send a prospect message; resolves `business_id` server-side, rate-limited (ip/key/conversation), runs the RAG+tools pipeline or returns a canned ack if human-controlled. Response: `{ conversationId, answer, escalate, control, asOf }`. `maxDuration = 60` (covers up to ~4 sequential Gemini calls). |
| `/api/chat/poll` | POST, OPTIONS | **widget key + origin check** | Polls for new non-`user`-role messages after a cursor timestamp. Rate-limited separately (`poll_ip`/`poll_conversation`, sized for a 6s interval). |

**Everything else is Server Actions**, not route handlers — e.g. `app/(dashboard)/dashboard/conversations/actions.ts` (`setConversationControlAction`, `sendHumanReplyAction`, `pollConversationAction`, `dismissAttentionAction`), `app/(dashboard)/dashboard/actions.ts` (`pollAttentionCountAction`), and per-resource `actions.ts` files for products/services/faqs/knowledge/leads/widget-settings/profile/onboarding. Each independently calls `requireBusinessContext()` (or `requireAuthContext({ role: "org:admin" })` where applicable) — middleware (`proxy.ts`) establishes the Clerk context only, it does **not** gate routes; every protected resource re-checks itself (`docs/security.md` §2, confirmed in `docs/architecture.md`).

Both public routes share `lib/widget-auth.ts`'s `resolveBusinessFromWidgetKey(key, origin)` — the widget key is a *publishable* identifier (same trust class as a Stripe publishable key), resolved server-side against a per-business allowed-origin column; a request body never carries `business_id` at all (there's no such field in the schema).

---

## 8. User guide

### For a business owner
1. **Sign up / sign in** via Clerk at `/sign-in` or `/sign-up`.
2. **Onboarding** (`/onboarding`, org-admin only): create the business record (name). This is required before anything else works.
3. **Configure knowledge**: add Products, Services, and FAQs (`/dashboard/products`, `/services`, `/faqs`) — any org member can CRUD these. Add free-text knowledge under `/dashboard/knowledge`. Every structured record and manual document is automatically chunked and embedded.
4. **Set up the widget** (`/dashboard/widget-settings`): copy the widget key and embed snippet, and set the allowed origin (the widget refuses to answer from any other domain until this is set).
5. **Embed on your site**: drop `<script src=".../widget-loader.js" data-widget-key="...">` on the business's own website.
6. **Watch conversations** (`/dashboard/conversations`): see prospect chats, "Needs attention" pills, take over a conversation ("Take over" toggle), or hand it back to the AI. While you hold control, prospect messages keep arriving and the AI stays silent — your dashboard replies are what the prospect sees.
7. **Review leads** (`/dashboard/leads`): each lead shows contact info, an AI-assessed qualification (hot/warm/cold, explicitly labeled as an AI signal, not verified truth), and a status you can move through new → contacted → converted/lost.
8. **Check analytics** (`/dashboard/analytics`): conversation/message volume, conversion rate, and qualification/status/role breakdowns.
9. **Business Profile** (`/dashboard/profile`, org-admin only): name, description, contact info, website — **display-only, not fed to the AI's prompt** (see §11).

### For a prospect
Opens the business's website, sees a chat launcher (bottom-corner bubble), chats with the AI. If the AI escalates or a staff member takes over, new replies from the human arrive via polling within ~6 seconds, shown with a distinct "team member replied" treatment and a calm, non-alarming banner — the prospect never sees an app crash or dead-end on an API failure.

---

## 9. Developer guide

### Setup
```bash
npm install
cp .env.example .env.local   # fill in real values, see table below
npm run dev                  # http://localhost:3000
```

### Commands
| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Run a production build |
| `npm run lint` | ESLint (`eslint.config.mjs` ignores `.agents/**`/`.claude/**`) |
| `npx tsc --noEmit` | Typecheck (no dedicated script; run directly) |
| `npm test` | Runs `scripts/run-pgtap-tests.mjs` — executes all 11 pgTAP files in `supabase/tests/database/` against the **live linked Supabase project** via `supabase db query --linked --file`. Requires `supabase login` + `supabase link` already done; **not CI-portable yet** (no `SUPABASE_ACCESS_TOKEN` setup exists). |

### Environment variables (all currently required; see `.env.example` for the full annotated set)

| Variable | Client-safe? | Required since |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | Phase 2 |
| `CLERK_SECRET_KEY` | **no** | Phase 2 |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Phase 3 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Phase 3 |
| `SUPABASE_SECRET_KEY` | **no — bypasses RLS** | Phase 11 (widget path only) |
| `GEMINI_API_KEY` | **no** | Phase 7 |
| `GEMINI_EMBEDDING_MODEL` (`gemini-embedding-001`) | config | Phase 7 |
| `GEMINI_EMBEDDING_DIMENSION` (`1536`) | config | Phase 7 |
| `GEMINI_CHAT_MODEL` (`gemini-3.1-flash-lite`) | config | Phase 8 |

Validated at server boot by `lib/env.ts` via `instrumentation.ts`'s `register()` hook — a missing/invalid variable fails fast with every offending variable named (never its value), before the server accepts requests.

### Database
- Schema source of truth: `supabase/migrations/*.sql` (imperative, hand-authored — `supabase migration new <name>` then edit).
- Apply: `npx supabase db push --linked` (requires `supabase link` to the target project first).
- Ad hoc verification: `npx supabase db query --linked` (works even when the Dashboard SQL editor is down — used throughout this project's history).
- Clerk must be configured as a Supabase third-party auth provider (`supabase/config.toml`'s `[auth.third_party.clerk]`), so RLS policies can read `auth.jwt()` claims.

### Project conventions worth knowing before contributing
- No `src/`; `@/*` path alias resolves to repo root.
- Zod schemas are colocated with the boundary they validate (route handler, Server Action, or `lib/schemas/<domain>.ts` if shared).
- Every `lib/` module not safe for client import starts with `import "server-only";`.
- Route handlers stay thin — validate, delegate to `lib/`, shape the response via `jsonSuccess`/`jsonError`.
- Every function that queries a business-owned table takes the Supabase client as an explicit parameter (not constructed internally) so both the Clerk-session and service-role paths share one implementation — a real bug (`42501` on every widget request) was caused by missing this once (`lib/retrieval.ts`, Phase 11 fix) and is now a standing convention.

---

## 10. Authentication, authorization, and multi-tenancy

- **Identity provider:** Clerk. **Tenant boundary:** Clerk Organizations (decision D1) — one business = one org, a user may belong to more than one.
- **Network boundary:** `proxy.ts` runs bare `clerkMiddleware()` only — it does **not** perform path-based route protection (Clerk's `createRouteMatcher` is deprecated and unused). Every protected resource calls `auth.protect()` (directly, or via `lib/auth.ts`'s `requireAuthContext()`) itself. Behavior differs by request type: document requests (pages) redirect to sign-in; non-document requests (route handlers, Server Actions) return `404` for an unauthenticated caller.
- **Business context resolution:** `lib/business-context.ts`'s `requireBusinessContext()` is the single `{ userId, businessId }` helper every dashboard data-access call goes through — never re-derived ad hoc, never taken from client input.
- **Authorization granularity:** CRUD on products/services/FAQs/knowledge is any authenticated org member (decision D7 — a deliberate choice, not a gap: `PRODUCT.md` has no owner/member distinction for this yet). Onboarding and Business Profile edits are `org:admin`-only.
- **Tenant isolation strategy (decision D2): defense in depth.** RLS enabled and forced on every business-owned table, keyed off `(select auth.jwt()) -> 'o' ->> 'id'` for the caller's org, **plus** application-layer `business_id` filtering on every query — neither layer alone is trusted. Every phase that added a table also added a pgTAP isolation test proving Business A cannot read/write Business B's rows.
- **The one unauthenticated path** — the public widget (`/api/chat`, `/api/chat/poll`) — resolves `business_id` from a widget key + origin check, never trusts any `business_id` in the request body (there isn't one in the schema), and runs on a service-role client where RLS is bypassed by design; the app-layer filter is the *sole* boundary there.
- **Verified, not assumed:** cross-tenant isolation has been proven at multiple points via real two-business manual tests (a second "Ghost Test Co." business) and via pgTAP run against the live database — see `STATE.md` §1/§2/§6 for the specific evidence per table.

---

## 11. AI architecture

### Models
- **Chat/generation:** `gemini-3.1-flash-lite` via `ChatGoogleGenerativeAI` (`@langchain/google-genai`).
- **Embeddings:** `gemini-embedding-001` via a custom `TruncatedGeminiEmbeddings` class (`lib/embeddings.ts`) that extends `@langchain/core`'s `Embeddings` base but calls the `@google/genai` SDK directly underneath — `@langchain/google-genai`'s embedding class was found to have no dimension-control option at all, so it contributes nothing here and was removed as a dependency (documented investigation in `docs/architecture.md`).
- **Dimension:** truncated from the model's 3072 default to **1536** (decision D3) — matches full-3072 MTEB quality via Google's MRL truncation, fits under pgvector's HNSW 2000-dim limit without `halfvec`, halves storage. **Manually L2-normalized** — this model does *not* auto-normalize truncated output, a documented Google behavior that would otherwise silently distort similarity rankings.

### Retrieval / RAG pipeline (`lib/rag.ts`)
1. `KnowledgeRetriever` (a `BaseRetriever`) fixed to one `businessId` at construction — every retrieval it performs is structurally tenant-scoped, backed by `match_knowledge_chunks()`.
2. **Zero-knowledge hard bypass:** if retrieval returns zero chunks, `askSalesEmployee()` returns a fixed fallback message immediately — **no Gemini call is made at all**. This is the concrete mechanism enforcing `AGENTS.md` rule 4 ("no fabricated business facts") — there's no code path where the model can invent an answer with nothing to ground it in.
3. **Tool-calling stage (if chunks exist):** a tools-bound Gemini call (`bindTools([...])`) may return `tool_calls`; each is executed and fed back as a `ToolMessage`, looped up to `MAX_TOOL_ITERATIONS = 2`. **Two stages, not one, is a provider constraint**: a single Gemini call cannot carry both a `tools` list and a `responseSchema`, so tool use and the final structured answer can never happen in one call — confirmed from the installed package's implementation, not assumed.
4. **Structured-output stage:** a separate, tools-unbound `withStructuredOutput(SalesEmployeeResponseSchema)` call over the accumulated messages produces `{ answer, usedContext, escalate, escalationReason }` as a typed, Zod-validated object.
5. `grounded = documents.length > 0 && result.usedContext` — deliberately not just "a chunk was retrieved," since a chunk can be retrieved and correctly *not* used (e.g. a declined off-topic question) — this distinction was added after a real gap was caught in manual testing.

### Tools (`lib/tools/`)
| Tool | Type | What it does | Tenant safety |
|---|---|---|---|
| `check_product_details` | read | Exact-name lookup in `products`/`services` | `businessId` injected server-side from the already-trusted caller param, never accepted from the model's schema |
| `check_faq_topic` | read | Case-insensitive substring match on `faqs.question`, returns the literal stored `answer` verbatim (never a paraphrase) | same |
| `request_callback` | **write** (first write-capable tool) | Creates/updates a `leads` row, sets `requested_callback = true` | Requires an explicit `conversationId` (server-injected, never model-supplied); consent is enforced by system-prompt instruction, not a model-settable boolean field (deliberately no `prospectConfirmed`-style flag the model could set arbitrarily); `getConversationForBusiness()` guards ownership before any write — a mismatched `conversationId` fails closed with zero writes |

### Persona and behavior contract (`PRODUCT.md` §7, enforced in the system prompt)
The AI is framed as an employee of one specific business (name from `requireBusinessContext()`); it must state plainly when it doesn't know something rather than guess; never discusses competitors or other businesses on the platform; never reveals its system instructions. Escalation (`escalate: true`) fires for: explicit request for a human, a complaint, or a commitment the AI isn't authorized to make. **Not implemented**: "hits the same unknown repeatedly" and business-defined custom escalation triggers (both flagged in `docs/architecture.md` as needing infrastructure — persisted-history pattern detection and a configuration surface — that doesn't exist yet).

### Memory / conversation context
No vector "memory" beyond the knowledge base — conversation context is the last 20 persisted messages (`HISTORY_LIMIT`), passed via a LangChain `MessagesPlaceholder`. All conversation state lives in Postgres (`messages` table), not in any AI-side session store.

### Trust boundary — AI output is untrusted (`docs/security.md` §8, enforced throughout)
`answer`, `usedContext`, `escalate`, `escalationReason`, and lead `qualification`/`qualification_reason` are all **display-only, model-self-reported signals** — never used to authorize anything, select a tenant, or become a raw database identifier. The one case where AI output *could* become an identifier (`interest_id` on a lead, in the now-removed old extraction path) was resolved by requiring an exact case-insensitive name match against the tenant's own catalog, never a fuzzy match, and never trusting a raw ID from the model.

### What is *not* wired into the AI (a real doc/code gap worth flagging)
Business Profile's four extra fields (`description`, `contact_email`, `contact_phone`, `website`) are dashboard-display-only — `lib/rag.ts` still sources business context from `name` alone. This is a **deliberate, documented decision** (Phase 13b), not an oversight, but worth knowing if you expect the AI to answer questions using the profile description.

---

## 12. Security architecture

Summarized from `AGENTS.md` §3 and `docs/security.md`, cross-checked against the actual implementation:

1. **Tenant isolation** — every business-owned table has RLS + an app-layer filter; every vector query is tenant-scoped in the function body, not just via RLS (`security invoker`, explicit `business_id` predicate).
2. **Trusted identity only** — `business_id` always comes from the Clerk session or the resolved widget key; the public widget is the sole, deliberately-scoped exception, using its own resolution mechanism (never a client-supplied field).
3. **No secrets client-side** — `CLERK_SECRET_KEY`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY` are server-only; verified never referenced in a client component; no `NEXT_PUBLIC_*` secret exists.
4. **No fabricated business facts** — the zero-chunk hard bypass (§11) is the concrete enforcement mechanism.
5. **AI output is untrusted** — no tool executes arbitrary SQL/JS; every tool has a narrow Zod schema and server-injected tenant scope; nothing the model outputs is ever used for authorization.

**Additional protections found in code:**
- Startup env validation (`lib/env.ts` + `instrumentation.ts`) — fails fast at boot, not at first use.
- Security headers (`next.config.ts`): `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` everywhere; `X-Frame-Options: DENY` on an explicit non-widget allowlist only — `/widget/embed` is deliberately excluded (it must be iframeable cross-origin by design) and this exclusion is called out as load-bearing, not incidental.
- `ILIKE` wildcard escaping (`lib/sql-escape.ts`) on both tool lookups, preventing a prospect message like `%` from becoming an unintended wildcard match.
- Origin allowlisting per business for the widget, checked before the key is treated as valid; the widget fails closed (no default-open origin) until an owner explicitly configures one.
- Postgres-level rate limiting (not a per-instance in-memory limiter — correct on serverless/multi-instance), separate scopes for message-send vs. poll traffic.
- Structured logging with a closed metadata type that structurally excludes free text/PII (`lib/logger.ts`) — enforced at the type level, not just by convention.
- A per-function least-privilege discipline for Postgres functions (since the schema-wide default-privileges fix was found impossible on managed Supabase for functions specifically — see §6).

**Known accepted residual risk:** 7 pgTAP functions in the `extensions` schema remain `EXECUTE`-able by `anon`/`authenticated` at the Postgres role level (the existing default-privileges revoke migration only scopes to `public`). Assessed low-risk because `supabase/config.toml`'s Data API only exposes `public`/`graphql_public` schemas — recorded as an accepted, not silently dropped, gap.

---

## 13. Deployment architecture

**No evidence of an actual deployment** was found in the repository (no `vercel.json`, no CI config, no deployment scripts). The stack is chosen for Vercel (`AGENTS.md` §2) and `app/api/chat/route.ts` sets `export const maxDuration = 60` — a Next.js route-segment config specifically justified against Vercel's serverless function timeout — but this is *preparation* for Vercel deployment, not evidence it has happened.

Production-readiness work completed in Phase 19 (security headers, env validation, rate limiting, indexes, RLS/grant discipline) is real and verified, but "a working dev server is not production readiness" is `docs/phases.md`'s own stated Phase 19 framing, and no live-production smoke test is recorded in `STATE.md`.

---

## 14. Current status

### Completed (per `STATE.md`, cross-checked against code)
Phases 0–15 (foundation → Clerk auth → Supabase/RLS foundation → onboarding → products/services/FAQs → knowledge ingestion → embeddings/pgvector → LangChain RAG → Gemini sales persona → lead model → chat API → chat UI → dashboard → AI tools → human handoff) are all implemented and verified with real manual/automated evidence recorded per-phase. Phase 18 (analytics/monitoring) and Phase 19 (production hardening, audit + remediation) are also complete. A cross-cutting, presentation-layer-only UI/UX redesign was applied across the whole app on 2026-08-15 (no logic changed).

### Explicitly deferred, not cancelled
- **Phase 16 — WhatsApp.** No code, no dependency installed.
- **Phase 17 — Razorpay.** No code, no dependency installed.

### Known limitations / technical debt (verified present, not just documented)
- **No CI pipeline.** `npm test` needs an interactively-authenticated, linked `supabase` CLI session — cannot run headlessly without a `SUPABASE_ACCESS_TOKEN` setup that doesn't exist yet.
- **Function-level default-privileges:** a schema-wide fix is structurally impossible on managed Supabase (permission boundary, not a bug); mitigated by a per-function discipline instead, but this must be manually checked on every new function — there is no safety net.
- **pgTAP functions in the `extensions` schema** remain broader-than-`public`-schema-privileged at the role level (accepted low-risk gap, see §12).
- **`docs/phases.md`'s Phase 15 exit-criterion wording** still describes the pre-D9 model ("an escalation trigger reliably moves a live conversation to human control") — the actual implemented behavior is the D9 reinterpretation (escalation only flags attention; a human's deliberate take-over is what moves control). Flagged repeatedly in `STATE.md` as worth a small doc fix, never applied.
- **Business Profile's extra fields are not fed to the AI** (§11) — a real product-behavior gap if a user expects the "About/Contact" fields to be answerable by the chat.
- **No vector index** on `knowledge_chunks` — deliberate, confirmed still appropriate at current data volume (5 rows for the one business checked), but will need revisiting as data grows.
- **`rate_limit_counters` rows accumulate indefinitely** — no cleanup cron exists.
- **No role model beyond org-admin vs. any-member** — flagged in `docs/architecture.md` as revisitable if a stricter model is ever wanted.
- **One uncommitted change at time of writing:** `app/(dashboard)/dashboard/conversations/_components/message-bubble.tsx` is modified in the working tree per `git status` — not reflected in `STATE.md`'s "Last updated" entry; verify before assuming a clean baseline.

---

## 15. Important architectural decisions and constraints (from `STATE.md` §4)

| Decision | Outcome |
|---|---|
| **D1** — Tenancy model | Clerk Organizations (multi-member businesses were already in scope; retrofitting later would be expensive) |
| **D2** — RLS strategy | Defense in depth: RLS + app-layer filtering, never either alone |
| **D3** — Embedding model/dimension | `gemini-embedding-001`, truncated to 1536, manually L2-normalized |
| **D4** — Widget identity mechanism | One widget key + one allowed origin per business, columns on `businesses`, no key rotation in v1; Postgres counter table for rate limiting, not Redis |
| **D5** — v1 knowledge sources | Pasted/typed text + structured records only; no file upload/URL/crawling |
| **D6** — Lead field spec | Full 13-field spec in `PRODUCT.md` §8; `qualification` always AI-generated/display-only/never sole gate |
| **D7** — CRUD authorization | Any authenticated org member (not admin-only) for products/services/FAQs |
| **D8** — Human handoff mechanism | Polling, not WebSocket/SSE (no long-running server process to support either) |
| **D9** — Escalation vs. control | Escalation only sets `needs_attention`; `control` changes only via explicit human take-over (see the Phase 15 doc-wording gap above) |
| **D10** — Widget poll trigger | A one-way latch: starts on `escalate: true` OR `control === "human"`, never turns off again for the session |
| **D11** — Phase ordering / process | Phase 16/17 reordered after Phase 15 (deferred, not cancelled); each phase from 18 onward implemented as one prompt, not staged sub-prompts, unless flagged and approved otherwise |

**Standing engineering rules** (`AGENTS.md` §3, verified enforced throughout the codebase): tenant isolation, trusted identity only, no client-side secrets, no fabricated business facts, AI output is always untrusted input. These cannot be overridden by a feature request — confirmed as the actual operating discipline behind every phase's design choices above, not just aspirational text.

---

## 16. Future roadmap / obvious next steps

Per `docs/phases.md`'s ordering and `STATE.md`'s open items:

1. **Phase 16 — WhatsApp** (deferred; reuse existing conversation/AI/lead services, do not build a second AI system).
2. **Phase 17 — Razorpay** (deferred; plans, subscription state, webhook signature verification, never trust client-supplied payment status).
3. Fix `docs/phases.md`'s stale Phase 15 exit-criterion wording to reflect the D9 reinterpretation (small, flagged, never actioned).
4. Decide whether Business Profile's `description`/`contact_email`/`contact_phone`/`website` should ever be wired into the AI's system prompt (currently a deliberate non-goal, not a bug).
5. Set up CI (a `SUPABASE_ACCESS_TOKEN`-based non-interactive path for `npm test`) before this project has multiple contributors relying on green-checks-before-merge.
6. A real production deployment + smoke test pass — nothing in the repo indicates this has happened yet.
7. Re-verify whether the table-level default-privileges fix has the same `supabase_admin`-vs-current-role gap the function-level fix turned out to have (flagged, never independently checked).
8. Consider a `rate_limit_counters` cleanup job before it becomes a real storage concern.
9. Revisit the any-member CRUD authorization model if a stricter owner/member distinction is ever wanted (currently a confirmed, not accidental, choice).

---

*This document was generated by direct inspection of the repository (migrations, route handlers, `lib/` modules, `docs/`, `STATE.md`, `PRODUCT.md`, `AGENTS.md`) on 2026-08-15. It summarizes and cross-checks — it does not supersede — `STATE.md`, which remains the authoritative, continuously-updated source of truth per `AGENTS.md` §0.*
