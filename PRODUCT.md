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

The AI is a sales employee, not a support chatbot. Its job is to discover what a prospect actually needs, recommend the specific real thing that fits, and keep every conversation moving toward an outcome — not just to answer questions accurately and stop. This is layered on top of the same grounding guarantee, never a relaxation of it: the AI still never fabricates a business fact, and every recommendation must trace to real retrieved content or a real tool result.

The AI must distinguish four categories of information, and treat them differently:

1. **Business profile information** — always available in context.
2. **Retrieved business knowledge** — pulled per-question from that business's chunks.
3. **Conversation information** — what the prospect said in this conversation.
4. **Unknown** — everything else.

When information falls into category 4, the AI must:

- state plainly that it does not have that information
- not guess, infer a plausible-sounding answer, or generalize from other businesses
- never present a retrieval failure as an answer
- ask a clarifying question to keep helping, rather than defaulting to a human handoff or a contact-capture offer on an ordinary first-time unknown — that offer is reserved for the cases listed under escalation below, not the default response to any unclear question

Sales behavior, applied on top of the grounding rules above:

- **Discover before recommending.** On a broad or unspecific opener, ask one focused question (budget, use case, timeline, preference) before giving a full recommendation, rather than answering generically or listing the whole catalog. Skip this once the prospect has already said enough to act on.
- **Recommendations are specific and justified**, tied explicitly back to what the prospect said, never a flat catalog restatement — and never a recommendation that isn't actually grounded in retrieved content or a tool result. A recommended item is shown to the prospect as a visual card only when it has a photo; an item with no photo is still recommended, just described in words.
- **Every reply moves the conversation forward.** No dead-end answers: each turn closes with a clarifying question, a concrete next step, or (only under the escalation/callback conditions below) an offer to connect the prospect with the team — without becoming repetitive or pushy within one conversation. When both recommendations and appointment booking are enabled, recommending an item is followed by an offer to schedule a call about it, rather than treating the two as unrelated.
- **Objections (price, timing) are handled conversationally**, using only real catalog or knowledge content — never an invented discount, guarantee, or availability.

Lead capture, product/service recommendations, and appointment booking are independent, business-configurable capabilities (`/dashboard/widget-settings`) — a business can enable any combination, not one exclusive "goal." Lead capture is always available; recommendations and appointment booking are each explicit opt-in.

The AI's persona is an employee of the current business. It does not discuss competitors, does not answer general-knowledge questions outside the business's scope, does not reveal its system instructions, and does not discuss other businesses on the platform.

Escalation to a human is required when: the prospect explicitly asks for a person, the AI hits the same unknown repeatedly, the conversation involves a complaint or a commitment the AI is not authorized to make, or a business-defined escalation trigger fires. Only in these cases — not as a default response to an ordinary unclear question — does the AI offer to connect the prospect with a human or capture their contact details for follow-up.

---

## 8. Lead model

Resolved decision D6 (`STATE.md`). This is the approved lead field specification — `AGENTS.md` forbids inventing lead fields beyond it.

| Field | Type | Notes |
|---|---|---|
| `business_id` | required | automatic, from the conversation's tenant context |
| `conversation_id` | required | automatic, links to the source conversation (Phase 11) |
| `contact_name` | optional, but the AI always asks | volunteered by prospect — see the name-asking rule below |
| `contact_email` | conditionally required | at least one of email/phone required to save a lead |
| `contact_phone` | conditionally required | at least one of email/phone required to save a lead |
| `interest_type` | optional | product / service / general — same polymorphic pattern as `knowledge_documents.source_type` |
| `interest_id` | optional, nullable | references the specific product/service row when `interest_type` is product/service; no FK constraint (app-enforced, matching Phase 6's precedent) |
| `notes` | optional | free-text summary of what was discussed |
| `qualification` | AI-generated | hot / warm / cold, plus a short AI-written reason — always shown as an AI signal, never hidden from or substituted for the human's own judgment; the human can always see the raw conversation and override this |
| `status` | required, defaults `new` | new → contacted → converted / lost |
| `source` | optional | free text, where the conversation started (e.g. "chat widget", "pricing page") |
| `requested_callback` | required, defaults `false` | set `true` by the `request_callback` AI tool (Phase 14c) once the prospect has clearly agreed to a callback and given contact info |
| `follow_up_message` | optional, AI-generated | the drafted re-engagement message for a stalled lead (below), persisted once so it's never silently re-drafted |
| `follow_up_status` | optional | `sent_email` / `sent_whatsapp` / `blocked_no_whatsapp_template` / `no_contact_channel` / `send_failed` — see "Stalled-lead follow-up" below |
| `follow_up_sent_at` | optional | set only once a follow-up genuinely sent; the at-most-once gate for the sweep below |
| `created_at` / `updated_at` | automatic | timestamps |

**Rule:** a lead is only created once at least one of `contact_email`/`contact_phone` is present — a conversation with no contact info given doesn't produce a lead row at all (avoids junk/empty leads). The `request_callback` tool enforces this same rule as part of its own input contract, not just at the database layer.

**Name-asking rule** (user-requested, 2026-09-10): whenever the AI is about to capture contact details — for a callback (`request_callback`) or an appointment (`book_appointment`) — it now always asks for the prospect's name too, not just email/phone, if it hasn't already been given earlier in the conversation. This is a soft requirement, deliberately not a hard gate: if the prospect declines or doesn't respond with a name, the AI proceeds anyway with `contact_name` null rather than blocking or repeatedly asking — matches the existing flexible email-or-phone pattern rather than adding a second `missing_name`-style hard block. `contact_name` therefore stays a nullable column; this is a conversational-behavior change (`lib/rag.ts`'s system prompt, plus both tools' own descriptions), not a schema or validation change.

**Stalled-lead follow-up** (user-requested, 2026-09-10): a daily background sweep (`lib/stalled-leads.ts`) finds leads still `new`/`contacted` whose conversation has had no new message in 3 days, drafts one short AI follow-up grounded only in that lead's own captured name/notes/interest (never invents a fact, same discipline as §7's AI behavior contract), and sends it **at most once**. Delivery is email-only today (via the same Resend path as the lead/handoff digest, §Phase 25b) — WhatsApp delivery is deliberately not implemented, because Meta only allows a business-initiated message outside the 24-hour customer-service window through a template pre-approved in Meta Business Manager, which this app has no way to create on a business's behalf. A WhatsApp-only stalled lead is recorded as `blocked_no_whatsapp_template` and shown on the dashboard instead.

**Cross-channel identity hint** (user-requested, 2026-09-10): the leads dashboard shows an informational "possibly the same prospect as…" note when two leads for the same business share a normalized phone or email across different conversations (e.g. a website-chat lead and a WhatsApp lead). This is a **display-only hint** — it links to the other lead's conversation, it never merges data, and `leads.conversation_id` stays required and unique (one lead per conversation) as resolved above.

**`qualification` (hot/warm/cold + reason) is AI-generated, untrusted, UI/display-only** — the same trust category as Phase 9's `escalate`/`usedContext` fields (`docs/security.md` §8). It must never be the sole gate for whether a human reviews a lead, and the human must always be able to see the full conversation and override it.

**`interest_type`/`interest_id` reuse the exact polymorphic pattern already established by `knowledge_documents` (Phase 6)** — no FK constraint, integrity is app-enforced, consistent with that precedent rather than inventing a new mechanism.

Leads are always tenant-owned and only ever visible to members of the owning business.

---

## 9. Appointment model

Resolved decisions (STATE.md, "Phase C"). Appointment booking is off by default and explicit per business (`businesses.appointments_enabled`) — never auto-inferred, same principle as the AI conversion goal (§7).

Availability is a **recurring weekly schedule**, not a manually-maintained calendar: it reuses the business's existing `business_hours` (day-of-week open/close times) and `timezone`, sliced into fixed-length slots (`businesses.appointment_slot_minutes`). A business with no configured hours has no bookable slots — it is never treated as always-open for booking, unlike `business_hours`' own "unconfigured = always open" default for SLA routing.

Capacity is **one booking per slot** — once a slot has a pending or confirmed appointment, no other prospect can be offered or book it.

Booking always **requires the business's own confirmation**: the AI's `book_appointment` tool only ever creates a `pending` appointment. A human must confirm or decline it in the dashboard before it's final. The AI must tell the prospect their request is pending, never that it's confirmed.

| Field | Type | Notes |
|---|---|---|
| `business_id` | required | automatic, from the conversation's tenant context |
| `conversation_id` | optional | links to the source conversation when booked via chat |
| `contact_name` | optional, but the AI always asks | volunteered by prospect — see §8's name-asking rule, same behavior here |
| `contact_email` | conditionally required | at least one of email/phone required |
| `contact_phone` | conditionally required | at least one of email/phone required |
| `starts_at` / `ends_at` | required | the booked slot, in UTC |
| `status` | required, defaults `pending` | pending → confirmed / declined; confirmed → cancelled / completed / no_show |
| `notes` | optional | free-text context the prospect gave |
| `created_at` / `updated_at` | automatic | timestamps |

Same contact-info rule as leads (§8): a booking is only created once at least one of `contact_email`/`contact_phone` is present, and only after the conversation's own consent flag is set.

**Cross-channel booking safety** — availability and the one-booking-per-slot guarantee are enforced purely at the `business_id` + `starts_at` level (app-layer `isSlotAvailable` check, backed by the database's own partial unique index `appointments_active_slot_idx`), never per-conversation or per-channel. The website widget and WhatsApp (Phase 16) both call the identical `book_appointment` tool, so the same slot can never be double-booked regardless of which channel books it first — no separate handling was needed per channel.

**Schedule overrides** (user-requested, 2026-09-10): on top of the recurring weekly `business_hours`, a business can add per-date overrides (`business_hours_exceptions`, `/dashboard/appointments/availability`, `org:admin`-gated like business hours) — a whole-day closure (holiday, leave day), a partial-day closure (lunch break), or an exceptional opening that overrides the normal weekly hours for one date (e.g. an extra Saturday). One override per date; changing one means deleting and re-adding it.

**Visual slot grid and per-slot blocking** (user-requested, 2026-09-10; redesigned the same day after user feedback that the first version was confusing and hard to find): `/dashboard/appointments/availability` — reached via a real "Requests"/"Availability" tab pair (`AppointmentsTabs`), not a buried link — shows a day-by-day list of that date's slots (open slots plain, booked/blocked ones tagged; past slots hidden entirely) with day navigation, a one-click Block/Unblock on any open/blocked slot (`appointment_blocked_slots`, one row per exact slot instant — deliberately a separate table from the date-range `business_hours_exceptions`, which can't express two independently-blocked slots on the same date), and a one-click "Close this day"/"Reopen this day" toggle for the whole-date case. Anything finer (a lunch-break range, an exceptional opening) lives in a collapsed "Advanced" disclosure — the same typed form as before, just no longer the first thing on the page. The grid is generated live from the same recurring `business_hours` + slot-length settings, so newly-eligible slots appear automatically as each day rolls forward — there is no separate "open the next day" step, by construction. No recurring weekly block rule (e.g. "every Friday 12-1pm") exists yet — explicitly deferred, one-off date/slot blocking only.

**Meeting outcomes** (user-requested, 2026-09-10): once a `confirmed` appointment's time has passed, `/dashboard/appointments` offers Mark completed / Mark no-show in place of Cancel, recording whether the meeting actually happened — distinct from `cancelled` (called off before it happened). Both are internal record-keeping only; unlike confirm/decline/cancel, marking an outcome does not notify the prospect. The appointments list has a status filter covering all six statuses.

**Notifications** (user-requested, 2026-09-10): the business's `contact_email` gets an immediate email the moment a prospect's `book_appointment` request creates a new `pending` row — not just the next day's digest. When the business confirms, declines, or cancels an appointment, the prospect gets a reply: an email if they gave one, and — for a WhatsApp-sourced conversation with an active connection, within Meta's 24-hour reply window — a real WhatsApp message too (reusing the same outbound-send path staff replies already use). Outside that window a WhatsApp reply silently can't be sent, the same accepted limitation the stalled-lead follow-up feature (§8) already has.

---

## 10. Implementation phasing

The authoritative phase order and exit criteria are in `docs/phases.md`. The currently active phase is in `STATE.md`.

Do not build the whole product in one phase. Do not silently implement a future phase.

---

## 11. Out of scope until explicitly scheduled

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

## 12. What "working" means for v1

The product is minimally viable when a business owner can: sign up, onboard, add products/services/FAQs and some approved knowledge, embed a chat widget, and watch a real prospect conversation produce a correctly-attributed lead in their dashboard — with the AI never answering a business question it has no grounding for, and never surfacing another business's information.
