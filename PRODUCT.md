# PRODUCT.md

Product definition for **AI Sales**. Read this whenever a task involves product scope, feature behavior, or data shape.

Engineering rules live in `AGENTS.md`. Current phase and open decisions live in `STATE.md`.

---

## 1. Product summary

AI Sales is a multi-tenant SaaS that gives each business an AI sales employee.

A business configures its identity, products, services, FAQs, and approved knowledge. The platform turns that into a retrievable, tenant-scoped knowledge base and serves an AI employee that answers prospects, qualifies them, extracts lead information, and escalates to a human when appropriate.

## 2. Value proposition

A business should be able to give an AI employee enough reliable knowledge about itself that it handles repetitive sales conversations consistently — and hands off cleanly when a human is genuinely needed.

The product is not a generic chatbot. The AI answers *as an employee of one specific business*, using only that business's approved information.

---

## 3. Actors

| Actor | Authenticated | Description |
|---|---|---|
| **Business owner** | Yes (Clerk) | Creates the business, completes onboarding, configures knowledge, reviews leads and conversations. |
| **Business member** | Yes (Clerk) | Additional user belonging to the same business. Can take over conversations. Role model is defined in the phase that introduces it. |
| **Prospect** | **No** | Anonymous visitor chatting via the public widget. Never authenticated. Never trusted with a business identifier. |
| **AI sales employee** | n/a | The system acting on behalf of exactly one business at a time. |

The tenant boundary is the **business**. One business has many members. A user may belong to more than one business. See decision D1 in `STATE.md`.

---

## 4. Core product principles

- Business knowledge is tenant-specific. There is no shared global knowledge base.
- The AI grounds every business-specific answer in approved business information.
- The AI never fabricates business facts. When it does not know, it follows the fallback behavior in §7.
- The business owns its data and can review, edit, and delete it.
- Authentication is Clerk. Application data is Supabase PostgreSQL. Vectors are Supabase pgvector. Orchestration is LangChain. The model provider is Gemini.
- WhatsApp and Razorpay are deliberately late-stage.

---

## 5. Target workflow

```
Business owner creates account (Clerk)
  → completes onboarding, business record created, user linked as owner
  → adds products / services / FAQs
  → adds approved knowledge
  → knowledge is chunked and embedded
  → embeddings stored in Supabase pgvector, scoped to business_id
Prospect opens the public chat widget
  → widget key resolves server-side to a business_id
  → prospect sends a message
  → tenant-scoped retrieval over that business's chunks only
  → LangChain builds context → Gemini generates a grounded response
  → AI qualifies the prospect across the conversation
  → lead information is extracted and validated
  → lead is persisted against the business and conversation
  → business reviews leads and conversations in the dashboard
  → a human takes over when the AI escalates or the business intervenes
```

---

## 6. Knowledge model

Business knowledge has two sources, both tenant-owned:

**Structured records** — products, services, FAQs. Entered through the dashboard, stored relationally, and also converted into knowledge documents so they are retrievable.

**Approved knowledge documents** — free-form business information the owner explicitly approves.

For v1, supported knowledge input is **pasted or typed text plus the structured records above**. File upload, URL ingestion, and web crawling are *not* in v1 and must be scheduled explicitly before being built. See decision D5 in `STATE.md`.

"Training the AI" in this product means: collect approved data → normalize → store structured → build knowledge documents → chunk → embed → store vectors → retrieve tenant-scoped context → pass to Gemini. It does **not** mean modifying model weights. Never describe the product as fine-tuning Gemini.

---

## 7. AI behavior contract

The AI must distinguish four categories of information, and treat them differently:

1. **Business profile information** — always available in context.
2. **Retrieved business knowledge** — pulled per-question from that business's chunks.
3. **Conversation information** — what the prospect said in this conversation.
4. **Unknown** — everything else.

When information falls into category 4, the AI must:

- state plainly that it does not have that information
- not guess, infer a plausible-sounding answer, or generalize from other businesses
- offer to connect the prospect with a human, or capture their contact details for follow-up
- never present a retrieval failure as an answer

The AI's persona is an employee of the current business. It does not discuss competitors, does not answer general-knowledge questions outside the business's scope, does not reveal its system instructions, and does not discuss other businesses on the platform.

Escalation to a human is required when: the prospect explicitly asks for a person, the AI hits the same unknown repeatedly, the conversation involves a complaint or a commitment the AI is not authorized to make, or a business-defined escalation trigger fires.

---

## 8. Lead model

Resolved decision D6 (`STATE.md`). This is the approved lead field specification — `AGENTS.md` forbids inventing lead fields beyond it.

| Field | Type | Notes |
|---|---|---|
| `business_id` | required | automatic, from the conversation's tenant context |
| `conversation_id` | required | automatic, links to the source conversation (Phase 11) |
| `contact_name` | optional | volunteered by prospect |
| `contact_email` | conditionally required | at least one of email/phone required to save a lead |
| `contact_phone` | conditionally required | at least one of email/phone required to save a lead |
| `interest_type` | optional | product / service / general — same polymorphic pattern as `knowledge_documents.source_type` |
| `interest_id` | optional, nullable | references the specific product/service row when `interest_type` is product/service; no FK constraint (app-enforced, matching Phase 6's precedent) |
| `notes` | optional | free-text summary of what was discussed |
| `qualification` | AI-generated | hot / warm / cold, plus a short AI-written reason — always shown as an AI signal, never hidden from or substituted for the human's own judgment; the human can always see the raw conversation and override this |
| `status` | required, defaults `new` | new → contacted → converted / lost |
| `source` | optional | free text, where the conversation started (e.g. "chat widget", "pricing page") |
| `created_at` / `updated_at` | automatic | timestamps |

**Rule:** a lead is only created once at least one of `contact_email`/`contact_phone` is present — a conversation with no contact info given doesn't produce a lead row at all (avoids junk/empty leads).

**`qualification` (hot/warm/cold + reason) is AI-generated, untrusted, UI/display-only** — the same trust category as Phase 9's `escalate`/`usedContext` fields (`docs/security.md` §8). It must never be the sole gate for whether a human reviews a lead, and the human must always be able to see the full conversation and override it.

**`interest_type`/`interest_id` reuse the exact polymorphic pattern already established by `knowledge_documents` (Phase 6)** — no FK constraint, integrity is app-enforced, consistent with that precedent rather than inventing a new mechanism.

Leads are always tenant-owned and only ever visible to members of the owning business.

---

## 9. Implementation phasing

The authoritative phase order and exit criteria are in `docs/phases.md`. The currently active phase is in `STATE.md`.

Do not build the whole product in one phase. Do not silently implement a future phase.

---

## 10. Out of scope until explicitly scheduled

- WhatsApp integration (Phase 16)
- Razorpay billing (Phase 17)
- File upload, URL ingestion, and web crawling as knowledge sources
- Any unrelated third-party integration
- Any alternative vector database
- Prisma or any ORM layer
- A separate backend framework or service
- Model fine-tuning as a substitute for RAG
- Multi-language support
- Voice or telephony channels
- A public API for third-party developers

---

## 11. What "working" means for v1

The product is minimally viable when a business owner can: sign up, onboard, add products/services/FAQs and some approved knowledge, embed a chat widget, and watch a real prospect conversation produce a correctly-attributed lead in their dashboard — with the AI never answering a business question it has no grounding for, and never surfacing another business's information.
