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
- WhatsApp, Instagram DM, and Razorpay are deliberately late-stage.

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
| `score` | AI-generated, defaults `0` | the raw numeric point total `qualification`'s bucket is derived from (Phase 27 follow-up) — same untrusted, display-only signal as `qualification`, just finer-grained; used to sort the Leads page more precisely than three tiers allow |
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

**Lead tagging / segmentation** (Phase 27, user-requested): a business can define its own free-form tag catalog (`lead_tags` — name + one of Badge's 5 existing tones, no new color system) and apply tags to a lead or to a conversation directly (before it necessarily becomes a lead), any authenticated business member at `org:sales_agent` or above — the same authorization tier as every other lead-mutating action, not the older any-member precedent D7 set before this app's RBAC tiers (Phase 24) existed. The Leads page filters by tag (any-of, composed with the existing status filter) alongside a "Manage tags" catalog editor. The AI can *suggest* tags on demand from a conversation's own transcript (`lib/tag-suggestions.ts`, mirroring the on-demand AI-summary pattern) — a suggestion is display-only and never applied without an explicit staff click, the same untrusted-AI-output discipline as `qualification` below.

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

---

## 13. Customer Intelligence (Phase 28)

The product is moving toward **Capture → Understand → Prioritize → Automate → Assist → Measure**. Customer Intelligence is the "Understand" layer, sitting on top of the existing conversations/leads/appointments data — not a second, disconnected CRM.

**Customer identity.** A business-scoped `customers` record aggregates a prospect's conversations, leads, and appointments across channels (website/WhatsApp/Instagram). Matching is **deterministic and conservative only** — exact normalized email or phone equality, the same rule the dashboard's pre-existing "possibly the same prospect" hint already used. There is no fuzzy or AI-assisted identity merging: if a new lead or appointment's contact info doesn't exactly match an existing customer for that business, a new, separate customer profile is created rather than guessed at. A customer only ever gets a `display_name` correction from staff; its identity keys (email/phone) are never directly editable, to avoid staff accidentally merging two different people's data.

**Tags** (Phase 27) are unchanged — a business-scoped catalog applied to leads and/or conversations. A customer's tags are simply the union of its own leads'/conversations' tags; there is no separate customer-level tag-assignment table.

**Lead score** (`lib/lead-scoring.ts`) stays a deterministic function of real, already-captured signals (appointment booked, callback requested, both email and phone given, flagged for human follow-up, a specific product/service named) — never an AI-invented number. Every score now carries an itemized, timestamped breakdown (`lead_score_history`), so a business can see exactly why a lead's score is what it is and how it changed, not just the final number. This is a display-only, deterministic signal, distinct from `qualification_reason`'s free-text explanation.

**Segments** are a business's own saved, declarative rules over customer attributes (score, status, qualification, channel, tag presence/absence, appointment status, contact-info presence, activity recency, needs-attention/human-controlled state) — one top-level AND/OR over a flat condition list, deliberately not a nested rule-builder. A segment is evaluated live against current data every time it's viewed; it does not store static membership.

**Customer profile.** `/dashboard/customers/[id]` shows a customer's contact info, latest lead score/qualification/reasons and score history, tags, and every linked conversation/lead/appointment — each linking back into the existing Conversations/Leads/Appointments pages rather than duplicating them.

Segments and customer identity are designed so a later Campaigns/Broadcasts feature (explicitly not built yet) can consume "segment + customer profile + tags" as its audience-definition layer, without requiring a schema change to this layer.

---

## 14. Automation & Workflow Engine (Phase 29)

A business can define its own **trigger → conditions → steps** workflows over events this product already produces (a lead created, a lead's status or score changing, a tag added/removed, an appointment's status changing, a conversation needing attention or changing hands between AI and a human, or a customer going quiet for a configurable number of hours). Conditions reuse the exact same declarative rule shape as Customer Intelligence's segments — one condition language for the whole product, not two.

A step is either a real action or a delay (wait N minutes/hours/days) — steps run in order, and a wait genuinely pauses the workflow (durably, surviving a restart or deployment) rather than blocking a request. Actions are limited to what this app can already, genuinely do: add/remove a tag, update a lead's status, flag a conversation for attention, assign it to a team member, create an internal sales task, draft (never send) an AI follow-up message, or send an internal or email notification. **Campaigns/Broadcasts sending is explicitly not an action here, and will not be added to this engine without a separate, explicit product decision.**

Every workflow run is logged — which workflow, which trigger, which lead/conversation/customer, its current step, and its status (queued/running/completed/failed/skipped/cancelled) — so a business can always answer "why did (or didn't) this run."

Workflow creation/editing is admin-only; any authenticated business member can view a workflow's definition and its execution history.

---

## 15. AI Sales Copilot (Phase 30)

A "what should I do today?" view (`/dashboard/copilot`) that prioritizes leads/conversations using deterministic, stored signals — lead score, needs-attention state, a pending or imminent appointment, days of silence on an open lead — never an AI's own arbitrary ranking. Each prioritized item carries one recommended next action (never a list of options), and an on-demand, AI-generated sales brief: a short narrative grounded strictly in that customer's own conversation transcript and notes, prefixed by a deterministic (never AI-generated) header of real stored facts.

The Copilot never sends a message, books an appointment, or changes a record on its own — every recommendation and every drafted message is something a staff member reviews and acts on elsewhere. This mirrors the same AI-drafts/human-sends boundary already established for `request_callback`/`book_appointment` and the stalled-lead follow-up draft.

---

## 16. Revenue & Conversion Intelligence (Phase 31)

The Analytics page's funnel (conversations → leads → qualified → appointments → completed → converted) and channel-performance breakdown (website/WhatsApp/Instagram) are calculated entirely from data this app already reliably stores. "Converted" is the same staff-set `leads.status = 'converted'` field the Leads page has always had — a human judgment call, not an automatically inferred event, because no reliable automatic signal for "became a paying customer" exists in this schema. Source-page attribution shows each page's actual lead-conversion rate, not just how many chats it started. Drop-off between funnel stages and period-over-period comparisons (7-day/30-day vs. the prior equivalent period) are both computed only from these same real, stored counts.

Sales-team performance (a leaderboard by team member) is explicitly not built: while conversations can be round-robin assigned to a team member, nothing in this schema links a lead's or appointment's eventual outcome back to whoever was assigned — building one now would imply an accuracy this data doesn't support. This is a recorded future dependency, not an oversight.
