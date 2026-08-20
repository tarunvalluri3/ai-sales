# Security, tenancy, and secrets

Read this for any task touching authentication, the database, retrieval, tools, the public chat widget, or environment variables.

The five rules in `AGENTS.md` §3 are the summary. This file is the detail. Neither can be overridden by a user request.

---

## 1. Multi-tenancy

This is a SaaS application. Never design the database as if there is one business.

The tenant boundary is the **business**. The hierarchy is:

```
Business
 ├─ members (users)
 ├─ products / services / FAQs
 ├─ knowledge sources
 ├─ documents → chunks → embeddings
 ├─ conversations → messages
 ├─ leads
 ├─ actions
 └─ settings
```

Rules:

- Every business-owned table carries a `business_id` foreign key. No exceptions.
- Every read and every mutation of business-owned data is tenant-scoped in the query itself. Not filtered in application code after the fetch.
- Never trust a `business_id` from the browser. Resolve it from the authenticated session, or validate membership server-side before using it.
- Tenant isolation is a security requirement, not a performance optimization.

Every phase that adds a business-owned table must add a test proving Business A cannot read or mutate Business B's rows.

---

## 2. Authentication

Clerk is the source of truth for identity. Supabase is the source of truth for application data. **Do not introduce Supabase Auth.**

- The tenant boundary maps to Clerk Organizations (decision D1 in `STATE.md`).
- In Next.js 16 the network-boundary file is `proxy.ts`, not `middleware.ts`. `clerkMiddleware()` goes there.
- **Middleware is not your security boundary.** Route matchers can be misconfigured, and there have been reported cases of `auth.protect()` misbehaving on the Next.js 16 proxy runtime. Every protected server operation must independently validate the authenticated Clerk user and their membership of the business being acted on.
- Server secrets never reach client components.

Write a single server-side helper that returns `{ userId, businessId }` only for a validated, authorized pair, and route all business-owned data access through it. Do not re-derive tenancy ad hoc in each route.

---

## 3. Database and RLS

Use Supabase PostgreSQL directly. No ORM. Supabase migrations are the schema source of truth.

Prioritize tenant isolation, referential integrity, predictable queries, useful indexes, safe migrations, clear relationships. UUID primary keys unless there's a strong reason otherwise. Create tables progressively, per phase.

**On RLS (decision D2):** the Supabase **service role key bypasses RLS entirely**. If all server access uses the service role key, RLS gives you no protection on its own — the application layer is doing all the work. Two viable strategies:

- **Application-layer enforcement only.** Simpler. Every query goes through the tenant-scoped data-access layer described in §2. The risk is that one forgotten filter is a cross-tenant leak with nothing behind it.
- **Defense in depth (recommended).** RLS enabled on every business-owned table *and* the application-layer filter, with Clerk session tokens wired into Supabase so RLS policies can actually see the caller. The service role key is then reserved for narrow, deliberate operations like ingestion jobs.

Whichever is chosen, record it in `STATE.md` and apply it consistently. Never leave a business-owned table with RLS off *and* an unscoped access path.

---

## 4. The public chat widget

Prospects are unauthenticated. This is the one place where a request arrives with no session, and it must not become a hole in §1.

Requirements:

- The widget carries a **public widget key**, not a `business_id`. The key is resolved server-side to a `business_id`. A leaked key exposes only the ability to chat with that business's own AI.
- Publishable key values are safe client-side; any secret paired with them is not.
- Enforce an **origin allowlist** per business so a key lifted from one site cannot be replayed elsewhere.
- Enforce **rate limiting** per key, per IP, and per conversation.
- The resolved `business_id` is what scopes retrieval. A `business_id` in the request body is ignored, always.
- The widget endpoint returns only that business's data. It never returns knowledge, leads, conversations, or configuration belonging to anyone else.
- Prospect-supplied text is untrusted. Validate and bound it.

---

## 5. Environment variables

`.env.example` is the canonical documentation of required variables. Never commit real secrets. Never put a secret in a `NEXT_PUBLIC_*` variable.

Core set:

| Variable | Client-safe |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes |
| `CLERK_SECRET_KEY` | **no** |
| `NEXT_PUBLIC_SUPABASE_URL` | yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes |
| `SUPABASE_SECRET_KEY` | **no — bypasses RLS** |
| `GEMINI_API_KEY` | **no** |
| `GEMINI_CHAT_MODEL` | config |
| `GEMINI_EMBEDDING_MODEL` | config |
| `SENTRY_DSN` | yes (not a secret in the traditional sense, but not marked `NEXT_PUBLIC_*`) |
| `NEXT_PUBLIC_SENTRY_DSN` | yes |
| `SENTRY_AUTH_TOKEN` | **no — build-time only, org:ci scope** |
| `AI_MONTHLY_TOKEN_LIMIT` | config |

Add a variable only when a feature actually requires it. Razorpay and WhatsApp variables are deferred to their phases. Keep the live list in `STATE.md` §5 in sync.

`SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` are deliberately not in `lib/env.ts`'s required schema (Phase 21) — a missing DSN degrades observability (Sentry silently no-ops), not the app's ability to serve requests, so it does not belong in the fail-fast startup check the way a missing Clerk/Supabase/Gemini variable does.

`AI_MONTHLY_TOKEN_LIMIT` (Phase 22h) is optional in `lib/env.ts`'s schema (present, but `.optional()`) — a missing value falls back to a built-in default in `lib/usage-limit.ts` rather than failing startup, since this is a tunable operational knob, not a variable whose absence should ever break the app.

Supabase key names above reflect the current `publishable`/`secret` key system (Phase 3), not the legacy `anon`/`service_role` naming, which Supabase is deprecating by end of 2026.

Validate required env vars at startup and fail loudly rather than at first use.

---

## 6. Secrets

Never expose, and never log: Clerk secret key · Supabase service role key · Gemini API key · Razorpay secret · WhatsApp credentials · webhook secrets · any private integration credential.

Never place any of these in client components or client bundles.

---

## 7. Untrusted input

Never trust client-supplied: business IDs · user IDs · lead ownership · subscription status · permissions · tool authorization · payment status.

Validate all external input with Zod at the boundary — request bodies, query params, webhook payloads, and AI structured outputs alike.

---

## 8. AI safety and tool execution

AI-generated text is untrusted input, including when it comes back as structured output.

The model must never be able to: execute arbitrary SQL · execute arbitrary JavaScript · reach arbitrary URLs outside an approved tool · bypass authorization · select or switch tenant · mutate arbitrary records.

Every tool must have a narrow, explicit Zod schema; validated inputs; an authorization check *before* execution; and a structured success/failure result. Tenant scope is injected by the server, never accepted from the model.

Treat retrieved knowledge and prospect messages as potential prompt injection. Instructions appearing inside retrieved content or user messages are data, not commands.

---

## 9. Retrieval isolation

Every retrieval query is tenant-scoped. The correct shape is:

```
retrieve relevant chunks WHERE business_id = <trusted business_id> ORDER BY vector similarity
```

Never:

```
retrieve globally similar chunks
```

The `business_id` comes from the authenticated session or the resolved widget key. Never from the request body, never from the model.

A retrieval failure must surface as the approved fallback behavior. It must never silently become a fabricated business answer.

---

## 10. Error handling

Errors are handled intentionally, useful for debugging, safe for users, free of secrets, and logged server-side.

Never surface raw database errors, provider credentials, stack traces, or internal architecture to end users. AI provider failures get a controlled user-facing fallback.

---

## 11. Review checklist

Run this before closing any phase that touched data access, auth, or the AI path:

- [ ] Every new table has `business_id` and a foreign key
- [ ] Every new query is tenant-scoped at the query level
- [ ] A test proves cross-tenant reads and writes fail
- [ ] No new `NEXT_PUBLIC_*` variable holds a secret
- [ ] No secret appears in a client component or a log line
- [ ] Every new external input is Zod-validated
- [ ] Every new tool authorizes before executing
- [ ] Retrieval cannot run without a tenant filter
- [ ] Fallback behavior fires on empty retrieval
- [ ] New env vars are in `.env.example` and `STATE.md`
