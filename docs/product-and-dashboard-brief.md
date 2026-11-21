# Waves AI Pilot — Product & Customer Dashboard Brief

A complete, page-by-page description of the product and every screen in the customer dashboard, written so a designer (human or AI) can redesign the UI without access to the code. It describes **what exists today**: every page, component, field, action, status and state. It does not prescribe a visual style.

---

## Part 1 — The product

### 1.1 What it is

**Waves AI Pilot** (internal name "AI Sales") is a multi-tenant SaaS that gives any business its own **AI sales employee**.

A business signs up, tells the product about itself (profile, products, services, FAQs, documents, web pages), and the product turns that into a private knowledge base. The AI then talks to the business's prospects on three channels:

- **Website chat widget**: a chat bubble the business embeds on its own site.
- **WhatsApp**: through the business's WhatsApp Business number.
- **Instagram DMs**: through the business's Instagram professional account.

The AI is a **salesperson, not a support bot**. It:

- answers questions **only from that business's approved information**, and never invents prices, policies or availability
- asks discovery questions (budget, use case, timeline) before recommending
- recommends specific products or services, as photo cards with prices when the item has an image
- captures **leads** (name, email, phone, interest)
- books **appointments** into real open time slots (the business must confirm each one)
- **escalates to a human** when asked, when stuck, on complaints, or when a commitment is needed

Everything lands in the **dashboard**. There the team watches conversations live, takes over from the AI, works leads, confirms appointments, sees customer profiles, automates follow-ups, and measures results.

### 1.2 Who uses it

| Actor | Description |
|---|---|
| **Business owner / admin** | Sets up the business, knowledge, channels, billing. Full access. |
| **Team members** | Same business, different roles (below). Work conversations and leads. |
| **Prospect** | Anonymous visitor chatting on the website, WhatsApp or Instagram. Never logs in. |
| **AI sales employee** | Acts on behalf of exactly one business. |

**Roles** (highest to lowest). The UI must show disabled controls with a "you don't have permission" tooltip when a role can't do something; it does not hide pages.

1. **Admin**: everything, including billing, business profile, business hours, publishing, workflows, segments, availability, widget keys, channels.
2. **Member**: everything operational (conversations, leads, appointments, knowledge editing) but not admin-only settings.
3. **Sales agent**: can take over conversations, reply, change lead status, tag leads, edit customers.
4. **Analyst / viewer**: read-only.

A user can belong to several businesses and switches between them with an **organization switcher** in the top bar.

### 1.3 Core concepts the UI must express

- **Draft → Publish → Live.** Edits to the profile, products, services, FAQs, knowledge, persona, widget branding and AI capabilities are saved as a **draft**. Customers keep seeing the last published version until an admin clicks **Publish changes** in the top bar. This is the product's single most important mental model.
- **AI signals are not facts.** Lead qualification (hot/warm/cold), AI reasoning, AI summaries, sales briefs and suggested tags are always labeled as AI-generated and unverified. The human can always see the raw conversation.
- **AI vs human control.** Every conversation is either **AI-handled** or **Human-controlled**. When a human takes over, the AI stops replying in that conversation until it is handed back.
- **Needs attention.** A conversation is flagged when the AI escalates or the prospect asks for a person. This drives a red/amber badge in the sidebar, the notification bell and sorting.
- **Channels.** Website, WhatsApp, Instagram. One shared brain across all three.
- **Plans.** Free trial (no card), then Starter / Growth / Scale (prices in INR, GST-inclusive). Plans limit monthly AI replies, seats and which channels are available.

### 1.4 How a business gets started

1. Sign up (email/Google via Clerk) and create a business ("organization").
2. A **6-stage onboarding wizard**:
   1. **Your business**: "Tell us who you are"
   2. **Train your agent**: "Knowledge, products & FAQs" (three sub-steps)
   3. **Personality**: "How your agent sounds" (agent name, greeting, tone: Friendly / Professional / Concise)
   4. **Channels**: "Where prospects can chat" (Website widget, WhatsApp Business, Instagram; at least one)
   5. **Plan & billing**: "Free trial, no card"
   6. **Test & go live**: a sandbox chat to test the agent, a setup summary, then **Publish agent**
3. They land on the dashboard Overview with a **"Your AI sales employee is live"** launch card.

---

## Part 2 — The dashboard shell (on every page)

### 2.1 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Announcement banner(s)]   (platform-wide, dismissible)              │
│ [Subscription banner]      (only if paused / payment failed)         │
├──────────────────────────────────────────────────────────────────────┤
│ TOP BAR: Agent name · Live pill · [Publish changes (N)]              │
│                    theme toggle · 🔔 bell · org switcher · user menu  │
├──────────────┬───────────────────────────────────────────────────────┤
│ SIDEBAR      │ [Draft note] (only on editable knowledge pages)       │
│ (collapsible)│                                                       │
│              │                 PAGE CONTENT                          │
│              │                                                       │
└──────────────┴───────────────────────────────────────────────────────┘
```

### 2.2 Top bar

- **Agent / business name.**
- **Status pill**, one of:
  - `Not live`: never published.
  - `Live`: published, no pending edits.
  - `Live · Unpublished changes`: published, with saved drafts waiting.
- **Publish changes (N)**: shown only when there are unpublished changes; N is the count. Admin-only (disabled with tooltip for others). It opens a **Publish changes dialog**:
  - Title "Publish changes". Text: "These changes go live on your website widget, WhatsApp and Instagram. Until you publish, customers keep seeing the current live version."
  - Changes listed **grouped by area**: Business, Persona, Branding, AI capabilities, Products, Services, FAQs, Knowledge. Each change is a short line.
  - If publishing is blocked: an error plus a bulleted list of the blocking items, and "Your live agent is unchanged and keeps running on the last published version."
  - Buttons: Cancel / Publish ("Publishing…" while pending). On success a toast: "Changes are live".
- **Theme toggle** (light/dark).
- **Notification bell** with an unread-count badge (caps at "9+"). Clicking opens a dropdown panel:
  - Header "Notifications" with a **Mark all read** action.
  - Up to 50 rows. Each row has: an unread dot, a **category label** (Needs a human, Appointment, New lead, Missed SLA, Assigned, Workflow), the message, and a relative time ("5m ago"). Rows link to the relevant page and mark themselves read on click.
  - States: loading, error with retry, empty ("Nothing yet — new leads, handovers and appointment requests show up here.").
  - Footer link: **Notification settings**.
  - The count updates live (about every second); the list loads when the panel opens.
- **Organization switcher** (switch or create a business).
- **User menu** (profile, sign out).

### 2.3 Sidebar navigation

The sidebar has a **business initial avatar + business name** at the top and a **collapse/expand** toggle (icon-only rail when collapsed; remembered per browser). Items are grouped:

| Group | Items |
|---|---|
| *(none)* | Overview |
| **Engage** | Conversations *(badge: number needing attention, "9+" cap)* · Leads · Appointments · Customers |
| **Channels** | Widget Settings · WhatsApp · Instagram |
| **Automate** | Workflows |
| **Knowledge Base** | Products · Services · FAQs · Knowledge · Instant Answers |
| **Insights** | Analytics · Sales Copilot |
| **Settings** | Business Profile · Business Hours · Billing · Notifications · Webhooks · Audit Log |

The active item is highlighted, and sub-pages highlight their parent (e.g. editing a product highlights Products).

**Mobile:** the sidebar becomes a top strip with the business name and a hamburger that opens a slide-in drawer with the same groups and badge.

### 2.4 Global banners and gates

- **Announcement banner(s)**: platform messages with severity info / warning / critical. Each is individually dismissible.
- **Subscription banner**:
  - Agent paused: "Your agent is paused. Choose a plan to go live again." → **Choose a plan**.
  - Payment failed with grace period: "Payment failed — your agent stays live until {date}." → **Update payment method**.
  - Non-admins see "Ask an organisation admin to open Billing." instead of the button.
- **Draft note**: a thin strip on Profile, Products, Services, FAQs, Knowledge and Widget Settings: "Changes save as a draft. Customers see them after you publish."
- **Missing alert email gate**: a blocking modal on every page except Business Profile when the business has no contact email. Title "Add an alert email to continue". It explains that nobody is notified about handovers, appointments or leads. Button: **Add it on your business profile**.

### 2.5 Shared UI patterns

- **Data tables** with sortable columns (usually date), row links, and an expandable detail row where needed.
- **Badges / pills** in five tones: accent, success, warning, danger, muted. Tags use the same five tones.
- **Toasts** for success/error/info.
- **Empty states** (title + description + optional action), **inline empty states** (icon + one line), **error states** with retry, and a **permission notice** for roles that can't edit.
- **Confirm-in-place** for destructive actions (Delete → "Confirm delete / Cancel").
- **Loading skeletons** per page; a page-level error boundary.
- **Live polling** on Conversations. When polling fails three times in a row, a small "Updates paused — retrying…" status appears.

---

## Part 3 — Page-by-page

### 3.1 Overview (`/dashboard`)

The home page: a snapshot of performance and quick entry points.

**Top (conditional):**
- **Launch card** (only right after first publish): success-toned panel, "Your AI sales employee is live — Prospects can chat with it now. Here's what to do next." It has a Dismiss link and three numbered next-step tiles:
  1. Test it on your site
  2. Add more knowledge
  3. Watch conversations and leads

  Below the tiles: the **website embed code** in a code box with a Copy button and the hint "Paste this before your site's closing `</body>` tag."
- **Install widget banner** (until the widget has served its first real chat): "Your widget hasn't answered a visitor yet", a one-line instruction that depends on whether a widget key exists, and a **Install your widget** button.

**Header:** the business name as a large title. Summary line: "{N} conversations in the last 7 days · {N} leads total · {N} need attention now".

**KPI row (4 tiles, each clickable):**
| Tile | Value | Hint | Links to |
|---|---|---|---|
| Conversations | total | "{N} in the last 30 days" | Conversations |
| Leads | total | — | Leads |
| Conversion rate | % | "Leads / conversations" | Analytics |
| Needs attention | count | "Conversations awaiting a human" | Conversations |

**Row 2:**
- **Recent activity** (wide panel, two columns):
  - *Recent conversations*: 5 rows, "{channel} · {N} msgs" + time ago, plus View all.
  - *Recent leads*: 5 rows, name (or "Unnamed prospect") + status, plus View all.
  - Each column has its own empty state.
- **Lead pipeline**: horizontal bar chart of New / Contacted / Converted / Lost, plus View all.

**Row 3 (3 panels):**
- **Lead qualification**: donut chart of Hot / Warm / Cold.
- **Knowledge base**: counts for Products, Services, FAQs and Knowledge documents. Each row links to its page.
- **Quick actions**: buttons for Add product, Add service, Add FAQ, Add knowledge, Review leads, Widget settings.

---

### 3.2 Conversations (`/dashboard/conversations` and `/dashboard/conversations/[id]`)

The live inbox and the most important working screen. **Three panes:**

```
┌─────────────────┬──────────────────────────────┬──────────────────────┐
│ CONVERSATION    │ TRANSCRIPT                   │ PROSPECT CONTEXT     │
│ LIST            │ (control bar, messages,      │ (next best action,   │
│ (filters)       │  composer)                   │  AI summary, tags,   │
│                 │                              │  lead, appointment,  │
│                 │                              │  guardrails, details)│
└─────────────────┴──────────────────────────────┴──────────────────────┘
```

#### Left pane — conversation list ("Live inbox")
- Eyebrow "Live inbox", title "Conversations". The "Updates paused — retrying…" indicator appears here when polling fails.
- **Channel filter pills**: `All (N)` plus one pill per channel present (Website, WhatsApp, Instagram).
- **"Needs attention only (N)"** checkbox.
- **List rows**, sorted with needs-attention first, then newest. Each row has:
  - an initial avatar
  - **primary label**: the lead's name if captured, otherwise the channel name
  - a **needs-attention dot**
  - a **last-message preview**: "Prospect: …", "AI: …" or "Team member: …"
  - **channel · date**
  - badges: **Human** (human-controlled) and **Lead** (a lead was captured)
  - an accent left border on the active row
- Refreshes about every 1 s on the index page and every 4 s while a conversation is open. It pauses when the browser tab is hidden.
- Empty states: "No conversations yet" (conversations from your widget will appear here in real time) and "Nothing matches this filter".

#### Middle pane — transcript
- With no conversation selected: an empty state with an icon, "Select a conversation" and "Pick a conversation from the list to see the transcript and prospect details."
- **Header**: eyebrow "Active conversation", title = lead name or channel, subline = start date/time · channel.
- **Control bar**:
  - Badge **AI-handled** or **Human-controlled**.
  - Button **Take over this conversation** or **Hand back to AI**.
  - Helper text:
    - "AI replies are paused here. Hand it back anytime…"
    - "Taking over pauses AI replies and clears this conversation's alert…"
    - "Taking over pauses AI replies for this conversation…"
  - **Needs attention** marker with a **Dismiss** button.
- **Message list** with three message kinds, visually distinct:
  - **Prospect** (user)
  - **AI** (assistant)
  - **Team member** (human agent): its caption is emphasized
  - Each message has a caption "{Role} · {date time}". New messages animate in (respects reduced motion).
  - **Sources (N)** toggle under AI messages that used knowledge. It expands to show cited snippets (document title + excerpt). If the knowledge was edited or removed: "This source is no longer available — the underlying knowledge may have since been edited or removed."
  - Empty: "No messages yet."
- **Reply composer** (only while human-controlled):
  - A disabled **attach** button ("File attachments coming soon").
  - A textarea, placeholder "Type your reply to the prospect…", max 2,000 characters.
  - A **Send** icon button.
  - Inline error, or a notice (e.g. delivery caveats for WhatsApp/Instagram's 24-hour window).
- The pane polls every second for new messages, control changes and attention changes.

#### Right pane — prospect context
On mobile this pane is a toggle ("View prospect details" / "Back to chat").

- Header "Prospect context" · "Live details".
- **Next best action**: one recommended action computed from real signals (e.g. confirm the appointment, reply to the handover).
- **AI summary card**:
  - Title "AI summary" plus the generated time.
  - The summary text, with "AI-generated — may be inaccurate, not verified."
  - Before generation: "Generate a quick read on what this prospect is looking for."
  - Button: **Generate summary** / **Regenerate** / **Refresh (N new messages)** when the summary is stale.
- **Tags card**:
  - Applied tags as removable chips ("No tags yet.").
  - A **tag picker** to add from the catalog.
  - **Suggest tags** (AI). Suggestions appear as "AI-suggested — click to add:" chips (`+ name`). They are never applied automatically.
- **Lead card** (if a lead exists):
  - Title "Lead" + qualification badge (hot/warm/cold, tooltip "AI-assessed signal — not verified").
  - Name, email · phone.
  - Interest (type — item name).
  - "AI-written reason: …", Notes, Status.
  - Link **View customer profile**.
  - Otherwise: "No lead captured from this conversation yet."
- **Appointment card** (if one exists): status badge (pending/confirmed/declined/cancelled/completed/no-show/expired), date/time in the business timezone, notes, link **View in Appointments**.
- **Flagged by guardrails** (only if safety checks fired): a **Review** badge, a list of the flags, and "Check the transcript before replying."
- **Conversation details**: channel, started at, message count, needs-attention status.

---

### 3.3 Leads (`/dashboard/leads`)

Every prospect who left contact details.

- **Manage tags** (sales agent and above): a collapsible **tag manager** panel.
  - Existing tags, each shown as a colored badge with **Rename** (inline edit of name + color, Save/Cancel) and **Delete**. Delete confirms: "It'll be removed from every lead and conversation it's applied to."
  - New tag form: live preview badge, name (max 40), color (5 tones), **Add tag**.
- **Header**: "Leads", "{N} leads total", and the disclaimer "Qualification is an AI-generated signal, not verified truth — always confirm from the conversation itself."
- **Status tabs** with counts: All · New · Contacted · Converted · Lost (keyboard arrow navigation).
- **Tag filter** chips (multi-select, match any) + **Clear tag filter**.
- **Table**, sorted by score, then newest:
  | Column | Content |
  |---|---|
  | Prospect | name, qualification badge (hot/warm/cold), score "N/max", up to 2 tag badges + "+N" |
  | Contact | email / phone |
  | Interest | type — product/service name (or "no longer available") |
  | Status | inline **status select** (New / Contacted / Converted / Lost). Choosing "Lost" asks "Mark this lead as lost? Confirm lost / Cancel". After a change: "Changed to X · **Undo**" for 6 s |
  | Source | where the chat started (e.g. a page) |
  | Created | date (sortable) |
  | Actions | open conversation ↗, expand/collapse ⌄ |
- **Expanded row**:
  - Tags: removable chips + tag picker.
  - **AI reasoning** (long text collapses with Show more/less) and **Notes**.
  - **Possible duplicate hint**: "Possibly the same prospect as a lead from WhatsApp… Shown as a hint only — nothing here is merged."
  - **Follow-up status** with the drafted message: sent by email, sent via WhatsApp, blocked (no approved WhatsApp template / Instagram window closed / email suppressed), no contact channel, or delivery failed — will retry.
- Empty states: "No leads yet" (when a prospect shares contact details the AI captures them here), and a filtered empty state with **View all leads**.

---

### 3.4 Appointments (`/dashboard/appointments`)

Two tabs at the top: **Requests** | **Availability**.

#### Requests tab
- Title "Appointments" + tabs.
- Info line: "{N} appointments total · every AI-booked request needs your confirmation here before it's final · times shown in {timezone}. Turn booking on or off in Business Hours."
- **Status filter pills**: All, Pending, Confirmed, Completed, No-show, Declined, Cancelled, Expired.
- **Table**:
  | Column | Content |
  |---|---|
  | Date & time | e.g. "Tue, Nov 18, 2026, 3:00 PM" (sortable) + **View conversation** link |
  | Contact | name, email · phone |
  | Status | badge |
  | Notes | truncated, full text on hover |
  | Actions | depends on state (below) |
- **Actions by state**:
  - *Pending*: **Confirm** / **Decline**.
  - *Confirmed, time not yet passed*: **Cancel**.
  - *Confirmed, time passed*: **Mark completed** / **Mark no-show**.
  - *Final states*: no actions.
  - Each action shows a toast. Confirm, decline and cancel notify the prospect; outcomes don't.
- Empty: "No appointments" (once booking is enabled and a prospect books, requests show up here).

#### Availability tab (admin edits)
- **Day navigator**: ← Prev (hidden for today) · "Monday, November 17" · Next →.
- **Close this day / Reopen this day** toggle. If a partial override exists, a note instead: "Custom override active — see Advanced below".
- **Slot list** for the date, generated from business hours and slot length; past slots are hidden. Each slot shows its time label, a tag (**Booked** or **Blocked**) when not open, and **Block / Unblock** on open or blocked slots.
  - Empty: "No slots for this date — it falls outside your business hours, or is closed for this date."
- **Advanced** (collapsed disclosure): "lunch breaks, ranges, and exceptional openings".
  - Form: Date; "What changes" with three options:
    - Close part of the date (e.g. a lunch break)
    - Open extra/different hours on this date
    - Close the whole date (e.g. a holiday)
  - From / To times (when relevant), Reason (optional, staff-only, e.g. "Public holiday"), and **Add override**.
  - List of upcoming overrides ("Tue, Dec 25, 2026 · Closed all day" / "Closed 13:00–14:00" / "Open 10:00–14:00 (overrides normal hours)"), each with Delete. Empty: "No upcoming overrides."

---

### 3.5 Customers (`/dashboard/customers`)

A unified CRM view: one profile per real person across all channels, matched only on exact email/phone.

- **Header**: "Customers" — "Every prospect who's shared contact info, aggregated across channels, with their lead score, tags, and activity in one place."
- **Manage segments** (admin): a collapsible **segment manager**.
  - Existing segments (name, description) with **Edit** / **Delete**.
  - **New segment** form: name (max 60), description (optional), "Match **all/any** of the following conditions:" and a list of **condition rows** [field] [operator] [value] [✕], plus **Add condition**. Save/Create, Cancel.
  - **Fields**: Lead score, Lead status, Qualification, Channel, Has email, Has phone, Has a conversation, Has an appointment, Appointment status, Needs attention, Human-controlled, Has tag, Missing tag, Interest type, Hours since last activity, Hours since first seen.
  - **Operators**: is, is not, is greater than, is at least, is less than, is at most, exists, doesn't exist (only valid ones per field). The "has …" fields have no value input.
- **Segment chips**: All customers + one chip per saved segment (description on hover). Selecting a chip filters the table live.
- **Table** (rows link to the profile; sorted by score, then recent activity):
  | Column | Content |
  |---|---|
  | Customer | name (or "Unnamed prospect"), email/phone (or "No contact info") |
  | Score | qualification badge + "N/max", or "No lead yet" |
  | Channel | latest channel |
  | Activity | "Needs attention" / "Human-controlled" badge, or "{N} conversations, {N} appts" |
  | Tags | up to 3 + "+N" |
  | Last activity | relative time (sortable) |
- Empty: "No customers yet" (profiles appear automatically once a prospect leaves contact info).

#### Customer profile (`/dashboard/customers/[id]`)
- **← Customers** back link.
- **Name** as the title, **click to rename** (pencil). Contact identity (email/phone) is shown but never editable.
- Contact line, then "First seen {date} · Last activity {date}".
- Sections:
  - **Lead score**: qualification badge, "N/max", the AI reason + "(AI-assessed signal, not verified…)".
    - **Deterministic score history**: each entry shows score, qualification, date and itemized reasons ("+20 Appointment booked", "+10 Both email and phone given", …).
    - Or "No lead yet for this customer."
  - **Conversations (N)**: rows with channel, Needs attention / Human-controlled badges and date, linking to the conversation.
  - **Appointments (N)**: date + status badge.
  - **Tags**: removable chips + tag picker.
  - **Leads (N)**: qualification badge, status and date, linking to the conversation.

---

### 3.6 Widget Settings (`/dashboard/widget-settings`)

Set up and customize the website chat widget. **Layout: main column + a sticky status rail on the right.**

**Intro**: "Chat widget" plus an explanation. Widget keys identify the business; each key has its own allowed origins (the exact site(s) it may be embedded on); rotate by creating a new key, swapping the snippet, then revoking the old one.

**Main column:**

1. **Install your chat widget** (collapsible guide, Show/Hide): "No coding experience needed."
   - **Step 1 — Copy your snippet**: code block + **Copy snippet** (✓ when done). If there is no key: "Create a widget key below first…"
   - **Step 2 — Paste it into your website**: platform picker (**WordPress / Shopify / Wix / Other / custom site**) with numbered steps for each.
   - **Step 3 — Allow your site's address** (✓ when an origin exists).
   - **Step 4 — Publish** (✓ when live). If not published, it links to "Test & go live" in the wizard.
   - **Step 5 — Test it**.
2. **Widget keys**:
   - **Create a new widget key** form: Nickname (optional, e.g. "Marketing site"), Allowed origins (textarea, one per line, hint "Just the address itself… no page path or trailing slash"), **Create key**, "Key created."
   - **Key cards**, one per key:
     - name (or "Unnamed key"), status badge (**active** / **revoked**), **Copy snippet**
     - "Created {date} · Revoked {date} · Last used {date}" (or "Never used yet")
     - Warning if there are no origins: "No allowed origins yet — this key will reject every chat request…"
     - Editable nickname + origins, **Save**, **Revoke** (confirm: "Any site using this key will stop getting chat responses immediately.")
     - Revoked keys show "Origins at time of revocation: …"
   - Non-editors see a permission notice.
3. **Not published yet** callout (only before the first publish): "Readiness, testing and publishing now happen in the guided setup wizard" → **Go to Test & go live**.
4. **Customize the experience**: "Set how the widget looks, what it can do, and how visitors begin a conversation." Three collapsible forms:
   - **Branding & language** (all optional, blank = default):
     - Accent color (hex text + color picker)
     - Logo URL
     - Placement (Bottom right / Bottom left)
     - Language (dropdown of supported languages)
     - Your privacy policy URL (https). It is linked from the widget's consent checkbox and falls back to Waves AI Pilot's policy.
     - Chat bubble text (max 60, e.g. "Chat with us")
     - Welcome greeting (open hours) (max 280)
     - Welcome greeting (outside business hours) (max 280), with a link to Business Hours
     - **Save widget settings**, success "Widget settings updated."
   - **Prefilled questions**: clickable suggestion chips shown on the widget's greeting screen.
     - **Generate with AI** / **Regenerate with AI** (from products, services and FAQs).
     - An editable list; each row has ▲ ▼ reorder, a text input (max 120) and ✕ remove.
     - Empty: "No suggested questions yet".
     - **Save suggested questions**.
   - **AI capabilities**: "Turn on as many as apply — they work together."
     - ☐ **Recommend products/services with images and pricing**: shows matching catalog items in chat, filtered by budget; photo cards only for items with an image.
     - ☐ **Enable appointment booking**: offers real open times from Business Hours; every request needs confirmation. When on, it reveals **Slot length (minutes)** (5–240).
     - Note: "Lead capture is always on."
     - **Save AI capabilities**.

**Right rail (sticky):** "Widget status" with **Live** / **Draft**, "{N} active widget keys", and "Use the dashboard header to publish saved changes."

---

### 3.7 WhatsApp (`/dashboard/whatsapp`)

Connect a WhatsApp Business number so prospects can chat with the AI on WhatsApp.

- **Intro**: "Let prospects message your AI sales employee on WhatsApp, the same way they can on your website." Links to WhatsApp Manager.
- **Plan gating**: if the plan doesn't include WhatsApp, an **upgrade notice** + **See plans**. If a number is connected but the plan lapsed: "This number is still connected, but its messages are not being received or answered."
- **Not connected (admin):**
  - **Connect with Facebook** (primary, Meta Embedded Signup): "Log in with Facebook, choose or create your WhatsApp Business account, and add the phone number…"
    - Button states: Opening… → Finish in the Facebook window… → Setting up your number…
    - Results: success ("WhatsApp is connected. We've submitted your message templates to Meta for review."), cancelled ("Signup was closed {at step}. Nothing was connected."), error, or partial ("Almost there… Use Finish setup below").
  - Disclosure: **"Already have a system-user token? Connect manually instead"**. It contains a manual form with Phone number ID, WhatsApp Business Account ID, Phone number (display) and Access token (password). Each field has a hint linking to where to find it in Meta. **Connect**.
  - **Set up WhatsApp with Meta** guide (collapsible, ~10 min): Have a Meta Business account? → Step 1 Create a Meta app and add WhatsApp → Step 2 Find your phone number ID and account ID → Step 3 Generate a permanent access token → Step 4 Paste everything into the form (✓ when connected).
- **Connected card**:
  - Display number, status badge (**Connected / Pending / Error / Disconnected**), verified business name, "Connected {date}", "Token ending in ••••" (manual) or "Connected with Facebook (Embedded Signup)".
  - **Edit connection** (manual only: re-enter the token; other fields pre-filled) and **Disconnect** (inline confirm: "prospects won't reach your AI sales employee there until you reconnect").
  - A setup-failure alert with a **Finish setup** button, or a connection-error message.
- **Message templates panel** (when connected):
  - Explains that WhatsApp only allows messages outside the 24-hour window via Meta-approved templates. "{N} of {M} approved."
  - **Submit for approval** / **Refresh status** buttons.
  - Rows: Appointment confirmed, Appointment declined, Appointment cancelled, Appointment reminder, Booking request expired. Each shows its template name and a status badge (approved / pending / rejected / not submitted / submit failed), plus the rejection reason or error.
- Non-admins: a permission notice.

---

### 3.8 Instagram (`/dashboard/instagram`)

Connect an Instagram professional account for DMs.

- **Intro**: "Let prospects message your AI sales employee on Instagram, the same way they can on your website and WhatsApp."
- **OAuth result banner** after returning from Facebook:
  - Success: "Connected as @user."
  - One of ~18 specific error messages, e.g. "You cancelled…", "That connection link expired…", "Link your Instagram professional account to a Facebook Page…", "That Instagram account is already connected to another business…"
  - **Try again** and **Dismiss**.
- **Plan gating**: same pattern as WhatsApp.
- **Before you connect** guide (collapsible, "Four quick checks"):
  1. Use a Business or Creator account
  2. Link it to a Facebook Page
  3. Allow message access
  4. Connect (✓ when connected)

  Footer: replies happen within Instagram's 24-hour window.
- **Not connected**: a **Connect your Instagram account** card with three benefit tiles:
  - *Answers DMs automatically*
  - *One shared brain* (same knowledge as website/WhatsApp)
  - *You stay in control* (take over anytime)

  Then "We need access to read and reply to Instagram DMs for this business." and a **Connect Instagram** button.
- **Choose account** step (when several accounts were shared): "Choose the Instagram account for this business". Radio list of @username + Facebook Page name, **Connect this account**. If expired: "That account choice expired…"
- **Connected card**:
  - @username, status badge, "Through the Facebook Page {name}", "Connected {date}".
  - **Reconnect** / **Disconnect** (confirm: "This removes our access… Past conversations stay in your dashboard.").
  - Tip "Not getting DMs? Check message access."
  - A broken-connection alert with **Reconnect Instagram**.

---

### 3.9 Workflows (`/dashboard/workflows`)

No-code automation: **When [trigger] → And [conditions] → Then, in order: [steps]**.

- **Intro**: "Automate a repetitive step: trigger → conditions → actions, with an optional delay. Every run is logged below…"
- **Workflows list**: header + **New workflow** (admin). Each row has:
  - name
  - "{trigger} · {N} steps"
  - an **Enabled/Disabled** toggle (the badge itself is the toggle)
  - **Edit** and **Delete**

  Empty: "No workflows yet". The hint changes depending on whether tags exist.
- **Workflow editor** (inline form):
  - Name (max 80), Description (optional), ☐ Enabled.
  - **When** [trigger]:
    - Lead created
    - Lead status changed *(→ status)*
    - Lead score crosses a threshold *(score reaches N)*
    - Tag added / Tag removed *(→ any tag or a specific tag)*
    - Appointment status changed *(→ status)*
    - Conversation needs attention
    - Human takes over a conversation
    - Conversation handed back to AI
    - No activity for a number of hours *(after N hours of inactivity)*
  - **And all/any of these are also true (optional)**: condition rows. These use the **same field/operator list as Customer segments** (§3.5). **Add condition**.
  - **Then, in order**: step rows, each with a type select + its config + ✕. **Add step**. Step types:
    - **Wait** N minutes/hours/days
    - **Add tag** / **Remove tag** (tag select)
    - **Update lead status** (status select)
    - **Flag conversation for attention**
    - **Assign to a team member**
    - **Create a sales task** (task title)
    - **Draft an AI follow-up message** (drafts only, never sends)
    - **Send an in-app notification** (message)
    - **Send an email notification** (subject + message)
  - **Create workflow / Save workflow**, Cancel.
- **Execution history**: one row per run with the workflow name (or "Deleted workflow"), "{trigger event} · step X/Y · {date}", failure reason, a status badge (**queued / running / completed / failed / skipped / cancelled**), and **Cancel** while queued/running. Empty: "No runs yet".
- **Sales tasks** panel: a "New task" quick-add, then the task list. Each task has a title, "Created by a workflow" when applicable, and **Done** / **Dismiss**. Empty: "No tasks".
- **Notifications** panel: in-app notifications from workflow steps, each with message, date, optional link and **Mark read**. Empty: "No notifications".

---

### 3.10 Products (`/dashboard/products`) and Services (`/dashboard/services`)

The two pages are identical in structure; Services says "offer" instead of "sell".

- **Intro**: "What your AI sales employee can tell prospects you sell / offer."
- **Pending review** (only if the AI extracted items from an uploaded PDF catalog): cards with image thumbnail, name, description, "Extracted from: {document}", price, and **Approve** / **Reject**.
- **List table**: Name + description (sortable) · Price · Actions (**Edit** → `/products/[id]/edit`, **Delete** with confirm). Empty: "No products yet".
- **Add a product / Add a service** form (or a permission notice):
  - Name (required)
  - Description
  - Price (optional, display text, e.g. "19.99")
  - Category (optional, e.g. "Sofas" / "Web Design")
  - Numeric price (optional, "for budget matching")
  - Image URL (optional; enables photo cards in chat)
- **Edit page**: the same form, pre-filled.

---

### 3.11 FAQs (`/dashboard/faqs`)

- **Intro**: "Questions your AI sales employee has an approved answer for."
- **Pending review** (extracted from documents): question, answer, source, **Approve** / **Reject**.
- **Table**: Question (sortable, with a readiness pill **Ready / Processing / Needs more detail**) · Answer · Actions (Edit, Delete). Empty: "No FAQs yet".
- **Add an FAQ** form: Question, Answer. The edit page has the same form.

---

### 3.12 Knowledge (`/dashboard/knowledge`)

Free-form documents the AI may use.

- **Intro**: "This is what your AI sales employee is allowed to know. New documents start as drafts — approve one to include it in your agent, then use Publish changes…"
- **Summary line**: "{N} live and answering prospects · {N} not live · {N} need attention".
- **Search** ("Search title or content…") + **status filter tabs**: All · Approved · Draft · Needs attention.
- **Bulk bar** (editors):
  - Select all (N).
  - "{N} selected" with **Approve selected**, **Delete selected** (confirm) and **Clear selection**.
  - Result messages ("Approved N documents.").
- **Table**: checkbox · **Document** · **Source** · **Actions**.
  - *Document* contains:
    - a live indicator
    - the title
    - a **processing pill** (Processing queued / Processing / Ready / Failed)
    - an **approved/draft** badge
    - a content preview
    - for a failed document: "Couldn't process this document: {error}"
    - for a URL source: the URL + "Auto-refreshes every Nh"
  - *Source*: Manual / File / URL / Product / Service / FAQ.
  - *Actions*: a context-sensitive primary button — **Retry** if processing failed, **Approve** for a processed draft, otherwise **Edit** — plus a **⋯ menu**:
    - Edit
    - Unapprove (confirm: "Customers keep seeing it until you publish")
    - Refresh now (URL sources)
    - Extract products & services (approved documents)
    - Delete (confirm; approved documents warn "Customers keep seeing this until you publish the deletion")
- **Add knowledge** tabs: **Manual / File / URL**.
  - *Manual*: Title, Content (up to 20,000 chars), **Add knowledge**.
  - *File*: upload a `.txt`, `.md` or `.pdf`. Hint: a PDF catalog is extracted into structured products/services (with photos) for review on first publish. **Upload**.
  - *URL*: Title, Page URL, Auto-refresh hours (optional, 1–720), **Import**.
- Edit page: the same manual form, pre-filled.

---

### 3.13 Instant Answers (`/dashboard/answer-bank`)

Pre-computed answers served instantly (no AI wait) for greetings, suggested questions, the price/service list and close FAQ matches.

- **Intro** explains the above. Stored answers are rebuilt when content changes, "so an old price is never shown". Button **Refresh answers**.
- **Notice banner** after actions: saved and live / approved / regenerated / refreshed / regeneration failed / out of date / invalid input / missing / failed.
- If not published: "Your AI is not published yet. Stored answers are prepared when you publish…"
- "{N} of {M} answers are live."
- **Answer cards**, one per stored question:
  - the question text
  - a kind badge: **Price & service list** or **Suggested question**
  - an owner badge: **Edited by you** or **Approved**
  - a status badge with explanation:
    - *Live*
    - *Review needed*: content changed since you edited it, so it is not served until approved or regenerated
    - *Not stored*: no safe answer could be generated, so the AI answers live
    - *Updating*
  - the answer text, and a failure reason if any
  - Actions (editors):
    - **Edit answer / Write answer** (expands a textarea "Your answer (shown exactly as written)" → **Save and go live**)
    - **Approve**
    - **Regenerate**
- Empty: "No stored answers yet".

---

### 3.14 Analytics (`/dashboard/analytics`)

All metrics come from real stored data.

- **Header**: "Analytics", "How your AI sales employee is performing…", and an **Export leads (CSV)** button.
- **KPI grid** (all clickable):
  - Total conversations · Last 7 days · Last 30 days · Needs attention now
  - Conversion rate (leads/conversations)
  - Qualified-lead rate (hot+warm / conversations)
  - Answer-failure rate (AI replies with no grounded answer)
  - Handoff response time (min, "Avg. over last N handoff(s)" or "No handoffs with a staff reply yet")
  - Requested callback
- **Charts row**:
  - **Leads by qualification** (donut; "AI-assigned signal, not verified human truth.")
  - **Leads by status** (bars)
  - **Messages by role**: Prospect / AI / Staff reply (bars)
- **Period comparison**: **7-day leads** and **30-day leads** with % change vs the previous period.
- **Sales funnel**: Conversations → Leads → Qualified → Appointments → Completed → Converted. Each stage has a horizontal bar, count and % of first stage, plus a "Drop-off between stages" list (≥50% highlighted). Note: "Converted" is set by your team on the Leads page.
- **Channel performance** table: Channel · Conversations · Leads · Appointments (N done) · Conversion %.
- **Top unanswered questions**: ranked list with counts (×). The biggest knowledge gaps.
- **Top source pages**: ranked page URLs with conversations and **lead conversion %**.
- **AI performance (last 7 days)**: AI responses · Avg. response time (ms) · Avg. tokens/response, with links to the external monitoring tools.

---

### 3.15 Sales Copilot (`/dashboard/copilot`)

"What should I do today?" A prioritized to-do list built from real signals, never AI ranking.

- **Header**: "Sales Copilot" — "What deserves your attention, kept current automatically as things change."
- **Tabs**: **Today · Upcoming · Completed**.
- **Today**:
  - Summary: "{N} items worth a look today, ranked by real signals…"
  - **Priority cards**, each with:
    - **customer name** (link to the profile), channel · "Lead score N/max", qualification badge
    - **title** (what's happening)
    - **reason badges**: Conversation needs attention / Appointment awaiting confirmation / Appointment within 24 hours / High lead score / No recent activity / Currently human-controlled
    - **"Recommended: {one action}"**
    - **Generate brief / Regenerate brief**: an AI **sales brief** shows a header of real facts (Status, Interested in) and sections *Why this matters*, *What happened* (bullets), *Risk* and *Recommended next step*, plus "AI-generated — may be inaccurate, not verified."
    - Actions: **Open conversation**, **Mark as handled**, **Snooze ▾** (Later today / Tomorrow / Next week / Pick date/time…)
  - Empty: "All caught up".
- **Upcoming**: snoozed items with the customer, title, "snoozed until {time}", reason badges, and Open conversation / Mark as handled / **Snooze again**.
- **Completed**: handled items with the customer, title, time ago, "By {person}" or "Automatic", and reason badges. Plus a collapsible **Recently handled (N)** list with **Undo**.
- The Copilot never sends messages or changes records by itself.

---

### 3.16 Business Profile (`/dashboard/profile`)

"This is what your AI sales employee tells prospects about who you are." Admin-editable.

- **Profile details** form:
  - *Identity*:
    - Business name (required)
    - Business type: E-commerce / Online store, Professional services, Healthcare / Clinic, Education / Training, Real estate, Hospitality / Food & beverage, Finance / Insurance, Technology / SaaS, Retail (physical store), Manufacturing, Fitness / Gym / Wellness, Salon / Beauty, Other
    - Description (optional)
  - *Contact*:
    - Contact email. This is also **the alert/billing email**; see the global gate.
    - Contact phone
    - Website
  - Per-field validation errors, **Save changes**, "Profile updated."
- **Danger zone** (collapsible, admin):
  - **Export your data**: download everything (profile, catalog, knowledge, conversations, messages, leads, audit log) as JSON.
  - **Delete this business**: type the business name to confirm, then **Permanently delete this business**. Sign-in access is unaffected.

---

### 3.17 Business Hours (`/dashboard/business-hours`)

- **Intro**: team availability hours, and the SLA for re-routing escalated conversations. A day left off = closed; an unconfigured schedule = always open. These hours also drive appointment availability.
- A warning if never saved: appointment booking shows no times until you save.
- **Business timezone** select ("Times below are in this timezone.").
- **7 day rows** (Monday–Sunday): open toggle, start time "to" end time.
- **SLA (minutes before an escalated conversation is re-routed)**. Blank disables it.
- **Save** → "Saved."

---

### 3.18 Billing (`/dashboard/billing`)

Admin-only (others see "Only an organisation admin can see or change billing."). Currency is **INR**; all prices include **18% GST**.

- **Header**: "Your plan, what you have used this period, when you are next charged, and every invoice we have issued you."
- **Status callouts** (conditional): Payments are in **test mode**; Payments not set up on this deployment; **No billing email set** (→ Add a contact email).
- **Current plan card**:
  - "Current plan", plan name, status label, an **AI replies paused** badge if not serving.
  - Facts:
    - Replies this period (used / quota)
    - Trial ends / Access until / Next renewal (date)
    - Amount (₹ + GST breakdown "taxable + GST (18%) = total", or "Nothing due")
    - Payment method
  - **Update payment method** ("Authorise a card again and we retry the payment straight away.")
  - **Usage progress bar** "N% of this period's AI replies used".
  - A scheduled-change note: "Scheduled: moving to the X plan on {date}."
- **Choose / Change your plan**:
  - Explainer: upgrades are immediate with the difference charged; downgrades apply at the next renewal. A trial note if on trial.
  - **Billing period** toggle: **Monthly** / **Yearly — two months free**.
  - **Plan cards** (selectable; "Current" marker):
    | Plan | Monthly (incl. GST) | AI replies / month | Seats |
    |---|---|---|---|
    | Starter | ₹1,499 | 1,000 | 1 team member |
    | Growth | ₹3,999 | 3,000 | 3 team members |
    | Scale | ₹9,999 | 10,000 | 10 team members |

    Each card shows its price, GST breakdown, replies · seats, and **channels included** (which plans include WhatsApp/Instagram).
  - **Billing details fields** inline (see below).
  - **Starter downgrade warning** if it would drop connected channels, with a checkbox "I understand and still want Starter."
  - Primary button (subscribe/change). Payment opens a Razorpay card-only window. "Cards only. You are not charged until your trial ends."
  - Statuses: "Loading the payment window…", "Confirming your payment with our server…", and toasts for closed/failed/confirmed.
- **Cancel your plan** card: you keep everything until the end of the paid period; after that the AI stops and prospects are told a person will follow up; no refunds. **Cancel at period end** → type `CANCEL` → **Confirm cancellation** / **Keep my plan**.
- **Payment history**:
  - Holds: "Invoice waiting for your billing details" (amount, date, link to add details), or "N invoices are being prepared…"
  - Table: Date · Document (number, Tax invoice / Credit note, TEST badge) · Details · Amount · PDF (**Download**).
  - Empty: "No payments yet".
- **Billing details** card ("who your GST tax invoices are made out to"; changes apply to future invoices only):
  - Billing name (required)
  - State (required, Indian states; decides CGST+SGST vs IGST)
  - Billing address (required)
  - GSTIN (optional, validated against the state)
  - **Save billing details**. If an invoice is held: "Saving these will issue the invoice that is waiting on them."
- Footer: plan summary sentence + links to the Pricing page and the Cancellation & Refunds Policy.

---

### 3.19 Notifications (`/dashboard/notifications`)

"Choose what reaches you immediately, what waits for the daily summary, and what stays in the dashboard only."

- "Emails go to {email}. Change it". If there is no email: a warning card "No alert email set" + **Add an alert email**.
- **One row per event category**: title + description, a ☐ **Show in the dashboard** toggle, and an **email mode** radio group: **Email me now** (sent the moment it happens) · **Daily summary** (one email a day) · **No email** (dashboard only). Categories:
  - A conversation needs a human
  - New appointment request
  - Appointment confirmed, declined or cancelled
  - New lead
  - Missed response target (SLA)
  - Assigned to a team member
- **Save notification settings** (admin; others see "Only an admin can change these.").
- Footer: workflow email steps always run regardless of these settings.

---

### 3.20 Webhooks (`/dashboard/webhooks`)

For developers: notify an external system when a new qualified lead arrives.

- **Intro**: signed `POST` requests with an `X-Webhook-Signature` header (HMAC-SHA256); verify it before trusting the payload.
- **Add an endpoint**: URL input (e.g. `https://example.com/webhooks/ai-sales`) + **Add endpoint**.
- **Table**: Endpoint URL · Secret (masked •••, **Reveal/Hide**) · Created · **Delete**. Empty: "No webhook endpoints yet".

---

### 3.21 Audit Log (`/dashboard/audit-log`)

A read-only record of sensitive actions.

- **Intro**: "A record of sensitive actions taken by your team… Most recent N shown."
- **Entries** (newest first): the action label, timestamp, "By {user}", key: value metadata, and a **View conversation** link when the action concerns a conversation.
- About 60 action types, grouped by domain:
  - conversation control and attention
  - knowledge publish/unpublish/delete
  - widget keys, branding and suggested questions
  - business publish, business hours and AI capabilities
  - appointments (confirm/decline/cancel/completed/no-show, overrides, slot blocks)
  - WhatsApp/Instagram connect/disconnect
  - customers, segments and workflows
  - Copilot actions and notification settings
  - subscription events, invoices, credit notes and billing details
- Empty: "No audit entries yet".

---

## Part 4 — Related surfaces (outside the dashboard)

Useful context for a consistent design system:

- **Marketing site**: Home, Pricing, About, Contact, and legal pages (Privacy, Terms, Refunds, Shipping, Data deletion).
- **Auth**: Sign in / Sign up (Clerk), Choose organization.
- **Onboarding wizard** (§1.4): a stepper with a live **preview panel** of the agent. Stages: Business → Train (Knowledge, Products, FAQs) → Personality → Channels → Plan → Test & go live (sandbox chat, readiness checklist with *Required to publish* / *Recommended* items, **Publish agent**).
- **Suspended page**: shown when the platform has suspended a business.
- **Chat widget** (prospect-facing, embedded on the business's site):
  - launcher bubble (with optional CTA text)
  - panel header (logo, business name)
  - greeting + suggested-question chips
  - message list with typing indicator
  - product/service recommendation cards (image, name, price)
  - consent checkbox before saving contact details
  - escalation banner when handed to a human
  - recent chats list
  - composer
  - business accent color, left/right placement, multi-language, light/dark
- **Platform admin panel** (`/apache`, internal staff only, not customer-facing): tenants, users, conversations, AI usage, billing, jobs, integrations, feature flags, support/impersonation, announcements, audit log, analytics.

---

## Part 5 — Must-keep behaviors for any redesign

1. **Publish changes** stays a global top-bar control with a change count and a grouped review dialog.
2. AI-generated content is always labeled **AI-generated / not verified** (qualification, reasoning, summaries, briefs, suggested tags).
3. AI vs Human control and **Needs attention** are visible in the conversation list, the transcript header, the sidebar badge and the bell.
4. Permission-restricted controls are shown **disabled with a tooltip**, not hidden.
5. Every list has **empty, loading, error and filtered-empty** states. Every action has **pending, success and error** states.
6. Destructive actions confirm in place; high-risk ones require typing (business name, `CANCEL`).
7. Times for appointments are shown in the **business timezone**.
8. Live surfaces (conversation list, transcript, bell count) show a quiet **"Updates paused — retrying…"** when polling fails.
9. Responsive: the 3-pane Conversations view collapses to list → transcript → details toggle on mobile; the sidebar becomes a drawer.
10. Light and dark themes; respect reduced motion; keyboard-accessible tabs, menus and dialogs.
