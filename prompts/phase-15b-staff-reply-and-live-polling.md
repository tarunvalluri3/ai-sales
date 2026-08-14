# Phase 15b — Staff reply persistence and live polling

## Goal
After this is implemented: a business member can type and send a reply from the dashboard conversation detail page while a conversation is human-controlled. That reply reaches the prospect's widget within a few seconds without the prospect sending anything else, via polling. While viewing a conversation, staff see new prospect messages (and each other's control changes) appear without a manual refresh, also via polling, on its own interval. The AI-pause guard from 15a is unchanged and untouched by any of this.

## Current phase
Phase 15 — Human handoff (`docs/phases.md`). Confirmed from `STATE.md` §1/§3: Phase 15a is complete and fully verified. This is Phase 15b in full — the user explicitly asked for it as one prompt, not split into a data-model stage and a mechanism stage (an earlier draft proposed that split; it's been merged back into this single document at the user's direction, with no reduction in the design rigor either half would have received on its own).

## User request
Build Phase 15b — staff reply delivery and the live/polling mechanism — with: (1) a dashboard reply UI, only usable when `control === "human"`, that decides and states explicitly what new `messages.role` value represents a staff reply, including its display treatment in both the dashboard transcript and the widget's message bubbles; (2) widget-side polling at a 5–8 second interval, via a new tenant/conversation-scoped read endpoint reusing the widget-key-resolution security model, not a new auth mechanism; (3) dashboard-side live-updating transcript, in scope for this stage, with its own reasoned interval; (4) explicit design of pause/resume conditions (tab visibility, panel open/closed, navigating away), de-duplication on poll, and rate-limit sizing for recurring poll traffic distinct from Phase 11's message-send limits; (5) all of this as one cohesive prompt, per the user's explicit direction against a further split.

## Skills and docs read
- `STATE.md` (full, including 15a's complete §2 entry and D8/D9 in §4).
- `docs/phases.md` — Phase 15 entry.
- `docs/security.md` — §1 (tenant isolation), §2 (identity), §3 (RLS/grants — "defense in depth" per D2), §4 (public widget: origin allowlist, rate limiting per key/IP/conversation), §7 (untrusted input).
- `docs/prompt-template.md`.

## Existing code inspected
- `app/api/chat/route.ts` — full request flow including 15a's `control === "human"` pause guard; confirmed `createMessage`'s return values (the inserted row, including `created_at`) are currently discarded at both call sites — both need to be captured for this stage's response-contract additions.
- `lib/messages.ts` — `createMessage(supabase, businessId, conversationId, role, content)` (role currently `"user" | "assistant"`), `listRecentMessages`, `listMessagesForConversation`. All client-injected.
- `lib/conversations.ts` — `getConversationForBusiness`, `setConversationControl` (15a), `flagConversationNeedsAttention` (15a).
- `lib/supabase/types.ts` — `MessageRole = "user" | "assistant"`; `Conversation` (with 15a's `control`/`needs_attention`); `ConversationControl`.
- `supabase/migrations/20260813130005_create_messages_table.sql` — `role text not null check (role in ('user', 'assistant'))`, constraint name confirmed live via `pg_constraint` as **`messages_role_check`**. `authenticated` = `SELECT` only today, no write grant.
- `supabase/migrations/20260813130010_create_rate_limit_counters_table.sql` — `scope text not null check (scope in ('ip', 'key', 'conversation'))`, constraint name confirmed live via `pg_constraint` as **`rate_limit_counters_scope_check`**.
- `lib/rate-limit.ts` — `checkAndIncrementRateLimit(scope, identifier, limit, windowSeconds)`, generic over `RateLimitScope`, backed by `public.increment_rate_limit_counter` (a generic `p_scope text` parameter, no internal allow-list beyond the table's check constraint — confirmed no function change is needed, only the table constraint).
- `lib/widget-auth.ts` — `resolveBusinessFromWidgetKey(key, origin)`, the exact mechanism this stage's poll endpoint must reuse unchanged, per the user's explicit "not a new auth mechanism" instruction.
- `package.json` — confirms installed `zod` is **v4.4.3**, which has both the legacy `z.string().datetime()` and the newer namespaced `z.iso.datetime()` validators; the poll endpoints' `after` cursor field should use whichever the installed version actually supports as verified at implementation time (see Implementation Requirement 6), not assumed from memory.
- `app/(dashboard)/dashboard/conversations/[id]/page.tsx` — current Server Component: loads `conversation`/`messages`/`lead`, renders `<ControlToggle>` (15a), the transcript inline via `.map(...)` over `MessageBubble`, and the lead card.
- `app/(dashboard)/dashboard/conversations/_components/message-bubble.tsx` (dashboard) — two-way (`user`/else) styling, right/left-aligned, caption `"Prospect"`/`"AI"`.
- `app/(dashboard)/dashboard/conversations/actions.ts` and `_components/control-toggle.tsx` (15a) — the exact Server Action + `useActionState` client-component pattern (Zod-validated `FormData`, `requireBusinessContext()`, `{ error?; success? }` return, `revalidatePath`) this stage's reply composer follows for its *form-submission* half; the *polling* half needs a different call shape (see Implementation Requirement 9).
- `app/(widget)/widget/embed/_lib/use-widget-chat.ts` — the widget's message state machine: a `pendingRef` map keyed by `requestId`, `messages: ChatMessage[]` (`role: "user" | "assistant"`), driven entirely by `widget:response`/`widget:error` postMessage events from the loader. No polling, no re-fetch of any kind exists here today.
- `app/(widget)/widget/embed/_lib/post-message.ts` — the full, explicitly-typed postMessage protocol (`FromParentMessage`/`ToParentMessage`) between the iframe and the loader; both directions are validated by shape, not trusted blindly (`event.source === window.parent` check at each listener, since the loader — not an arbitrary origin — created this iframe).
- `app/(widget)/widget/embed/_components/widget-app.tsx` — owns `isOpen` (panel open/closed) as local React state inside the iframe; currently never communicates this state to the loader (the loader only ever learns about resize dimensions, from which panel-open-ness could theoretically be inferred but isn't today).
- `public/widget-loader.js` — plain vanilla JS, no build step, runs in the *host page's own context*. **This is the only script whose `fetch()` carries the host page's real `Origin` header** (a deliberate Phase 12 design fixed after a real bug was caught before implementation, per `STATE.md`'s Phase 12 entry) — confirmed this means the new poll requests must also originate from this file, not from the iframe, for the same reason the chat POST already does.
- `app/(widget)/widget/embed/_components/message-bubble.tsx` (widget) — two-way (`user`/else) styling; `role: "assistant"` empty-content placeholder returns `null` (used while awaiting a response).
- `app/(widget)/widget/embed/_components/panel.tsx` — renders `MessageList`/`Composer`; no changes needed to this file's own structure, only to what `use-widget-chat.ts` feeds it.

## Relevant existing architecture
- Every write to a business-owned table goes through RLS + an explicit grant, verified live, never assumed from the migration file alone (Phase 3/7/11 precedent).
- `docs/security.md` §3's "defense in depth" (D2): RLS **and** application-layer filtering, both present, neither alone. 15a established this shape for `conversations.control`; this stage applies the identical shape to `messages`' first-ever `authenticated` write.
- `lib/*.ts` functions take an injected Supabase client so the same query logic serves both the Clerk-session and service-role paths.
- The widget's entire network boundary is `public/widget-loader.js` — a hand-kept-in-sync duplicate of the message shapes lives there since it cannot `import` from the Next.js app (no build step). Any new postMessage type added to `post-message.ts` must be mirrored by hand in the loader, exactly as the existing types already are.
- `docs/security.md` §4: rate limiting is per key/IP/conversation, via the existing generic `rate_limit_counters` table/function — the established pattern for adding a new *kind* of limited traffic is a new `scope` value, not a new table or mechanism (D4's precedent).
- D8 (`STATE.md` §4): polling was chosen over WebSocket/SSE specifically because this app has no long-running server process. This stage is D8's actual implementation.

## Decisions and assumptions

This section documents the "genuinely new territory" reasoning the user asked not to shortcut, kept as one place to read all of it together.

1. **New message role: `human_agent`.** Distinct from `assistant` (AI-authored) and `user` (prospect-authored) — a staff reply is neither. Chosen over reusing `assistant` (would make it impossible to ever tell AI and human replies apart in the transcript, undermining the entire point of this phase) and over a generic `system` (a staff reply is real conversational content directed at the prospect, not a system notice).

2. **Polling is not gated on `control === "human"` alone — it starts the first time a conversation shows *either* `escalate: true` on any response *or* `control === "human"`, and then stays on for the rest of that browser session.**
   This was reconsidered from an earlier draft that gated polling strictly on `control === "human"`, learned only from responses to messages *the prospect itself sends*. That gate has a real gap: if a staff member proactively takes over and replies before the prospect sends anything further, the widget would have no signal to ever ask for that reply — it only ever learns `control` from its own outgoing requests' responses. Gating on "has this conversation ever escalated" closes that gap in the realistic case (a staff member only discovers a conversation exists to take over via the Phase 15c attention alert, which — per D9 — only ever fires on `escalate: true`), while `control === "human"` remains a second, independent trigger for the case where a business member proactively opens a never-escalated conversation and takes it over anyway (rarer, but the design shouldn't silently fail it).
   Once started, polling is **not** stopped again when `control` reverts to `ai` (hand-back) — the state machine "stop, but restart if X happens again" is more complex than "start once, then poll passively for the rest of the session," and a passive poll that usually returns nothing is cheap and bounded (see rate-limit sizing below), not a meaningful resource concern. This keeps the widget's polling logic a one-way latch, not a toggle, which is simpler to reason about and to test.
   Polling is never started for a conversation that has neither escalated nor gone human-controlled — the overwhelmingly common case (most conversations are fully AI-handled end to end) generates zero poll traffic, which matters given the widget is public, unauthenticated, and could in principle run on every visitor of every business's site simultaneously.

3. **Poll interval: widget 6 seconds, dashboard 3 seconds — different, reasoned separately.**
   Widget: the user specified a 5–8 second band; 6 seconds sits near the responsive end while keeping steady-state traffic modest, and this traffic is genuinely unbounded in principle (any number of anonymous browser tabs across any number of businesses could be polling at once), unlike the dashboard.
   Dashboard: a single authenticated staff session actively watching one specific conversation they intend to reply to benefits more from a snappier update (they're waiting to see the prospect's next message), and the traffic is bounded by real signed-in headcount on one conversation at a time — realistically 1, occasionally 2. No new rate-limit scope is introduced for this traffic (see Decision 6).

4. **Both polling loops use a self-rescheduling `setTimeout`, not `setInterval`.** A poll that takes longer than the interval (slow network, momentary server load) would let `setInterval` fire overlapping, out-of-order requests; scheduling the *next* poll only after the current one settles (success or failure) avoids that entirely, at the cost of slightly variable real-world cadence around the nominal interval — an acceptable tradeoff for a background poll, not a real-time guarantee.

5. **Pause/resume conditions, decided explicitly, not left implicit:**
   - **Widget:** polling only runs while (a) a `conversationId` exists, (b) the handoff signal from Decision 2 has fired, (c) the panel is open (a new `widget:panel_open` message from the iframe to the loader, sent on every `isOpen` change — the loader did not previously know this), and (d) the host page's own tab is visible (`document.visibilitychange` inside the loader, which runs in the host page's own context — the same reason it, not the iframe, is the one that must observe this). On regaining visibility or reopening the panel, the loader fires one poll immediately rather than waiting out a full interval, so returning to the tab doesn't cost the user up to 6 seconds of apparent staleness. While a message send (`handleSend`) is in flight, the poll loop is paused (no new poll scheduled until the send settles) — the synchronous chat response is authoritative and more current than a poll could be, and avoids two competing requests updating widget state at once.
   - **Dashboard:** polling runs while the conversation detail page's live-transcript component is mounted and the tab is visible (`document.visibilitychange`, checked directly in the client component — the whole dashboard page *is* the "panel," there's no separate open/closed state to track). Navigating away unmounts the component, and its `useEffect` cleanup clears any pending timeout — no explicit "stop" action is needed beyond React's own lifecycle.

6. **Rate limiting: two new scopes, `poll_ip` and `poll_conversation`, sized for recurring read traffic, not message-send traffic — the dashboard's polling gets no new rate limit at all.**
   Phase 11's existing `ip`/`key`/`conversation` limits (30/120/20 per 5 minutes) were sized around one request per prospect message — a 6-second poll would blow through the `conversation` limit of 20/5min in the first two minutes of steady polling alone, and would contend with real message-send traffic on the same `ip`/`key` counters if it reused them. New scopes, same `rate_limit_counters` table/function (D4's precedent — no new mechanism): `poll_ip` at **300 per 5 minutes** (comfortably covers several concurrent human-controlled conversations from one IP, e.g. a shared office network, at the nominal 6s cadence — roughly 50 requests/5min per conversation — with headroom for visibility-triggered immediate polls) and `poll_conversation` at **100 per 5 minutes** (roughly 2x the nominal single-conversation rate, covering jitter and immediate-resume polls without being so tight that ordinary use ever trips it). The dashboard's polling Server Action gets **no new rate-limit scope** — it is Clerk-authenticated, tenant-scoped via `requireBusinessContext()`, and this codebase has never rate-limited a Server Action (Phase 11's limits exist specifically because that endpoint is public and unauthenticated; the dashboard's existing auth/RLS boundary is the established bound for staff traffic, consistent with every other dashboard mutation in this codebase).

7. **De-duplication: both sides filter by message `id` before merging poll results into local state**, in addition to the cursor (`after`/`asOf`) preventing most duplicates from ever being fetched a second time. This is deliberately defense-in-depth, not redundant: the cursor guarantees no *regression*, but a client-side `id` check is what actually guarantees no *duplicate render* even in an edge case (e.g., a poll response arriving after a slightly later synchronous response already rendered the same message).

8. **The widget's poll endpoint excludes `role: 'user'` from its results; the dashboard's poll includes every role.** The widget already knows its own prospect-authored messages from local state the moment they're composed — it never needs the server to tell it about them again. The dashboard has no such local knowledge of the prospect's next message; showing it live is the explicit point of this stage's dashboard requirement.

9. **The dashboard's live-updating view also polls `control`, and staff-initiated control/reply actions trigger an immediate extra poll rather than relying on `revalidatePath`-driven prop refresh for their own in-page feedback.** `setConversationControlAction` keeps its existing `revalidatePath` call unchanged (still correct for a fresh page load), but the client-side live view treats polling as the single source of truth for what's currently rendered once mounted, and both `ControlToggle` and the new reply composer trigger one immediate poll tick right after their own action succeeds. This avoids a subtle race between RSC prop-refresh timing and the poll loop's own state that would otherwise be possible if two update paths both tried to be authoritative for the same values.

## Open decisions this depends on
None. `STATE.md` §4 has no open decisions blocking this work.

## Dependencies / packages required
None. Confirmed against `package.json` — everything here (a new route handler, two migrations, widened types, new Server Actions, new client components, and `public/widget-loader.js` edits) uses already-installed packages and plain browser APIs (`setTimeout`, the Page Visibility API).

## Files likely to change
- **New:** `supabase/migrations/<timestamp>_add_human_agent_message_role.sql`
- **New:** `supabase/migrations/<timestamp>_add_poll_rate_limit_scopes.sql`
- **New:** `app/api/chat/poll/route.ts`
- **New:** `lib/http/widget-cors.ts` (extracted shared CORS/origin/IP helpers, see Implementation Requirement 5)
- **New:** `app/(dashboard)/dashboard/conversations/_components/reply-composer.tsx`
- **New:** `app/(dashboard)/dashboard/conversations/_components/live-conversation-panel.tsx`
- Modified: `lib/supabase/types.ts` (`MessageRole` widened)
- Modified: `lib/messages.ts` (`createMessage`'s role type widened; new `listMessagesForConversationAfter`)
- Modified: `lib/rate-limit.ts` (`RateLimitScope` widened)
- Modified: `app/api/chat/route.ts` (captures message rows for `asOf`; response gains `control`/`asOf`; CORS/origin/IP helpers extracted to the new shared module)
- Modified: `app/(dashboard)/dashboard/conversations/actions.ts` (new `sendHumanReplyAction`, new `pollConversationAction`)
- Modified: `app/(dashboard)/dashboard/conversations/_components/message-bubble.tsx` (third role branch)
- Modified: `app/(dashboard)/dashboard/conversations/_components/control-toggle.tsx` (accepts an `onChanged` callback for Decision 9)
- Modified: `app/(dashboard)/dashboard/conversations/[id]/page.tsx` (delegates the toggle/composer/transcript to `<LiveConversationPanel>`)
- Modified: `app/(widget)/widget/embed/_lib/post-message.ts` (new `widget:panel_open` outgoing type, new `widget:poll_result` incoming type)
- Modified: `app/(widget)/widget/embed/_lib/use-widget-chat.ts` (`ChatMessage.role` widened, merges poll results)
- Modified: `app/(widget)/widget/embed/_components/widget-app.tsx` (posts `widget:panel_open` on `isOpen` change)
- Modified: `app/(widget)/widget/embed/_components/message-bubble.tsx` (widget) (third role branch)
- Modified: `public/widget-loader.js` (polling loop, visibility handling, panel-open tracking, `/api/chat/poll` calls)
- Modified: `docs/architecture.md`

## Database changes

**Migration 1** (`npx supabase migration new add_human_agent_message_role`):

```sql
alter table public.messages
  drop constraint messages_role_check,
  add constraint messages_role_check check (role in ('user', 'assistant', 'human_agent'));

-- First-ever `authenticated` write into `messages` -- every prior write
-- came from the service role (widget path), which bypasses grants/RLS
-- entirely. Column-scoped, matching this project's existing narrow-grant
-- precedent (businesses.widget_allowed_origin, conversations.control).
grant insert (business_id, conversation_id, role, content) on public.messages to authenticated;

-- Defense in depth (docs/security.md §3, D2): the grant alone would let
-- an authenticated caller insert into another business's conversation;
-- RLS alone would still let them insert as any role. Together:
-- (a) role must be 'human_agent' -- never 'user'/'assistant' impersonation;
-- (b) business_id must match the caller's own business;
-- (c) the target conversation must belong to that business AND currently
--     have control = 'human' -- a second, DB-level enforcement of the
--     same invariant app/api/chat/route.ts already enforces for reads.
create policy "messages_insert_human_agent_reply" on public.messages
  for insert
  to authenticated
  with check (
    role = 'human_agent'
    and business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.business_id = messages.business_id
        and c.control = 'human'
    )
  );
```

**Migration 2** (`npx supabase migration new add_poll_rate_limit_scopes`):

```sql
alter table public.rate_limit_counters
  drop constraint rate_limit_counters_scope_check,
  add constraint rate_limit_counters_scope_check
    check (scope in ('ip', 'key', 'conversation', 'poll_ip', 'poll_conversation'));
```

No grant/RLS change needed for migration 2 — `rate_limit_counters` already has zero `authenticated`/`anon` grants and only the service role (via `increment_rate_limit_counter`) touches it; widening the allowed `scope` values doesn't change who can write.

Exact steps for both: write the migration files, `npx supabase db push --linked`, then verify live via `npx supabase db query --linked`: `has_column_privilege('authenticated', 'public.messages', 'role', 'INSERT')` is `true`; the new constraints/policy read back as written (`pg_get_constraintdef`, `pg_policies`); `anon` still has zero grant on either table.

## Server / client boundaries
- Both migrations, `lib/messages.ts`, `lib/rate-limit.ts`, `app/api/chat/route.ts`, `app/api/chat/poll/route.ts`, `lib/http/widget-cors.ts`, and the new Server Actions are all server-only.
- `app/api/chat/poll/route.ts` is, like `/api/chat`, intentionally public and unauthenticated — never calls `requireAuthContext()`/`auth.protect()`. It never accepts a `business_id`; it resolves one from `widgetKey` exactly as `/api/chat` does.
- `public/widget-loader.js` remains the only script making cross-origin, real-`Origin`-header requests to this app — the poll requests are added there, not in the iframe, for the identical reason `handleSend` already is.
- The dashboard's polling action (`pollConversationAction`) and reply action (`sendHumanReplyAction`) are both Clerk-authenticated Server Actions; no Supabase client of any kind reaches a client component.

## Implementation requirements

### A. Staff reply persistence (data model and write path)

1. **Migration 1**, exactly as shown above (constraint name confirmed live).

2. **`lib/supabase/types.ts`.** Widen `MessageRole` to `"user" | "assistant" | "human_agent"`.

3. **`lib/messages.ts`.** Widen `createMessage`'s `role` parameter from `"user" | "assistant"` to `MessageRole`. Add `listMessagesForConversationAfter(supabase, businessId, conversationId, after: string, options?: { excludeRoles?: MessageRole[]; limit?: number })`, querying `.gt("created_at", after)`, `.order("created_at", { ascending: true })`, `.limit(options?.limit ?? 200)`, applying `.not("role", "in", \`(${options.excludeRoles.join(",")})\`)`-equivalent filtering (or the client's native "not in" builder method, whichever the installed `supabase-js` version actually exposes — check before assuming the exact call shape) when `excludeRoles` is given. Returns full `Message` rows (this is what both the poll route and the dashboard action need — a shared function, not two near-duplicate queries).

4. **New Server Action, `sendHumanReplyAction`, in `app/(dashboard)/dashboard/conversations/actions.ts`.** `"use server"`. Zod: `{ conversationId: z.string().uuid(), content: z.string().trim().min(1).max(2000) }` (2000-char bound matches `/api/chat`'s existing `MESSAGE_MAX_LENGTH`). `requireBusinessContext()`. Re-fetch the conversation via `getConversationForBusiness` and confirm `control === "human"` before inserting — return `{ error: "Take over this conversation before replying." }` otherwise, without attempting the insert. On success, `createMessage(supabase, businessId, conversationId, "human_agent", content)`, `revalidatePath(\`/dashboard/conversations/${conversationId}\`)`, return `{ success: true, message: <the inserted row> }` (the row is returned so the client component can append it optimistically without waiting for the next poll tick — see Implementation Requirement 11).

5. **`app/(dashboard)/dashboard/conversations/_components/message-bubble.tsx`.** Add a third branch for `role === "human_agent"`: left-aligned, but visually distinct from the AI's neutral bubble (e.g. `bg-dashboard-primary/10 text-zinc-900`, reusing the existing token rather than inventing a new color, per `docs/architecture.md`'s Phase 13a token-borrowing note). Caption: `"Prospect"` / `"AI"` / `"Team member"` — not a personalized name, matching `HUMAN_CONTROL_MESSAGE`'s existing anonymized phrasing.

### B. Widget-side polling

6. **New route, `app/api/chat/poll/route.ts`.** `POST` + `OPTIONS`, mirroring `/api/chat`'s shape. Body: `{ widgetKey: z.string().uuid(), conversationId: z.string().uuid(), after: <ISO datetime string> }` — verify the installed Zod v4.4.3's actual validator for this (`z.iso.datetime()` vs. `z.string().datetime()` vs. a `.refine(v => !Number.isNaN(Date.parse(v)))` fallback) before writing the schema; do not assume the exact API from memory. Flow: rate-limit check under the new `poll_ip` scope (300/300s) → `resolveBusinessFromWidgetKey(widgetKey, origin)` (identical call, no forked logic) → rate-limit check under `poll_conversation` (100/300s, keyed by `conversationId`) → `getConversationForBusiness(supabase, businessId, conversationId)`, generic `400` on mismatch (same convention as `/api/chat`) → `listMessagesForConversationAfter(supabase, businessId, conversationId, after, { excludeRoles: ["user"], limit: 50 })` → respond `{ conversationId, control: conversation.control, messages: [{ id, role, content, createdAt: created_at }], asOf: <created_at of the last returned message, or the request's own `after` unchanged if none> }`.

7. **Extract shared CORS/origin/IP helpers into `lib/http/widget-cors.ts`.** `extractOrigin`, `extractIp`, `withCors`, `CORS_HEADERS` currently live only in `app/api/chat/route.ts`; both this route and the new poll route need identical logic — extracting them is a small, directly-justified refactor (two real call sites now share one implementation), not scope creep. Update `app/api/chat/route.ts` to import from the new module instead of defining these locally.

8. **`app/api/chat/route.ts` response contract.** Capture the return value of both `createMessage` calls (currently discarded) into named variables. Add `control: conversation.control` and `asOf: <the created_at of whichever message was persisted last in this request — the user message's row on the human-control-ack path, the assistant message's row on the AI-answered path>` to every success response (`jsonSuccess({...})`), on both the human-control branch and the normal AI-answered branch. This is additive — no existing consumer of the current three fields (`conversationId`/`answer`/`escalate`) breaks.

9. **`app/(widget)/widget/embed/_lib/post-message.ts`.** Add `WidgetPanelOpenMessage = { type: "widget:panel_open"; open: boolean }` to `ToParentMessage`. Add `WidgetPollResultMessage = { type: "widget:poll_result"; messages: { id: string; role: "assistant" | "human_agent"; content: string }[] }` to `FromParentMessage`, with matching validation in `parseFromParentMessage`.

10. **`app/(widget)/widget/embed/_components/widget-app.tsx`.** Send `postToParent({ type: "widget:panel_open", open: isOpen })` in a `useEffect` keyed on `isOpen` (including the initial `false` on mount, so the loader's default state is correct even if the prospect never opens the panel).

11. **`app/(widget)/widget/embed/_lib/use-widget-chat.ts`.** Widen `ChatMessage["role"]` to include `"human_agent"`. Handle the new `widget:poll_result` message type in the existing `handleMessage` listener: for each incoming message, skip it if its `id` already exists in the current `messages` array (Decision 7's client-side de-dup), otherwise append a new `ChatMessage` with that `id`/`role`/`content` (no `status`, no `escalate`). Also capture `control`/`asOf` from every `widget:response` payload if they're relayed through (see next requirement) — or, per the loader-owns-the-network-layer design, note explicitly that **`control`/`asOf` are consumed entirely inside `public/widget-loader.js` and never need to cross the postMessage boundary into the iframe at all**, since only the loader decides whether/when to poll; do not add them to `WidgetResponseMessage`'s type unless a genuine UI need for them inside the iframe emerges (none does this stage).

12. **`app/(widget)/widget/embed/_components/message-bubble.tsx`** (widget). Add a third branch for `role === "human_agent"`: same bubble treatment as `assistant` (`bg-widget-assistant-bubble`), with a small caption above the bubble — reuse `EscalationBanner`'s text-sizing convention (`text-xs text-widget-muted`) for a line reading `"A team member replied"`, shown once per such message, not merged into the bubble itself.

13. **`public/widget-loader.js` — the polling loop.** State to track (module-level `var`s, matching this file's existing style): `hasHandoffSignal` (boolean, starts `false`), `isPanelOpen` (boolean, starts `false`), `lastKnownMessageAt` (string or `null`), `knownMessageIds` (a plain object used as a set, or an array — matching this file's lack of any ES2015+ `Set` usage elsewhere; confirm what the rest of the file already relies on before introducing a new pattern), `pollTimeoutId` (or `null`), `isSendInFlight` (boolean).
    - In `handleSend`'s success branch: after posting `widget:response`, also update `lastKnownMessageAt = body.data.asOf`, and if `body.data.escalate || body.data.control === "human"`, set `hasHandoffSignal = true` and call `schedulePoll()` (idempotent — see below).
    - Set `isSendInFlight = true` at the start of `handleSend`, `false` in both its success and catch paths; `schedulePoll()` is a no-op while `isSendInFlight` is `true` (checked at call time, not by cancelling an in-flight timeout).
    - Handle `widget:panel_open` in the existing `window.addEventListener("message", ...)` listener: set `isPanelOpen = data.open`; if opening and `hasHandoffSignal` is true, clear any pending timeout and call `doPoll()` immediately (not through the normal delay), which will itself call `schedulePoll()` again at the end.
    - `document.addEventListener("visibilitychange", function () { ... })`: on becoming hidden, clear `pollTimeoutId` if set; on becoming visible, if `hasHandoffSignal && isPanelOpen`, call `doPoll()` immediately (same immediate-fire behavior as reopening the panel).
    - `schedulePoll()`: if `!hasHandoffSignal || !isPanelOpen || document.visibilityState !== "visible" || isSendInFlight || !conversationId`, do nothing (don't schedule). Otherwise `pollTimeoutId = setTimeout(doPoll, 6000)`.
    - `doPoll()`: performs the `POST appOrigin + "/api/chat/poll"` fetch with `{ widgetKey, conversationId, after: lastKnownMessageAt }`; on success, filters `body.data.messages` against `knownMessageIds`, adds any new ids to the set, updates `lastKnownMessageAt = body.data.asOf`, and — only if there are new messages — posts `{ type: "widget:poll_result", messages: <the new ones> }` to the iframe; on any failure (network error, non-200), does nothing observable (no error surfaced to the prospect for a background poll failure — it will simply retry on the next tick) and does not update the cursor. Always calls `schedulePoll()` at the end, success or failure, so the loop continues.
    - This is a genuinely new subsystem in a file that has never had one before — keep it as a small set of named functions (`schedulePoll`, `doPoll`, plus the two event handlers) rather than folding the logic into `handleSend` or the message listener, so it stays independently readable.

### C. Dashboard-side live-updating transcript

14. **New Server Action, `pollConversationAction`, in `app/(dashboard)/dashboard/conversations/actions.ts`.** Not form-driven — called directly as an async function from a client component (a supported Next.js Server Action call pattern, not requiring a `<form>`). Zod-validate its arguments (`conversationId: z.string().uuid()`, `after: <ISO datetime, same validator decision as Implementation Requirement 6>`) even though it's not `FormData`-sourced, since it's still a public entry point reachable with arbitrary arguments from client code. `requireBusinessContext()`. Calls `listMessagesForConversationAfter(supabase, businessId, conversationId, after, { limit: 200 })` (no `excludeRoles` — the dashboard wants every role, including `user`, per Decision 8) and separately re-reads the conversation's current `control` via `getConversationForBusiness` (cheap, and this is what makes hand-back/take-over by another staff member visible live). Returns `{ messages, control, asOf }` — no `{ error }`/`{ success }` wrapper needed here (it's a read, not a mutation with a form-error UI), but still wrap in a `try/catch` and return a safe shape on failure (e.g. `{ messages: [], control: <unchanged>, asOf: after }`) rather than throwing across the Server Action boundary into the client.

15. **New client component, `app/(dashboard)/dashboard/conversations/_components/live-conversation-panel.tsx`.** `"use client"`. Props: `conversationId`, `initialControl: ConversationControl`, `initialMessages: Message[]`. Owns: `messages` state (seeded from `initialMessages`), `control` state (seeded from `initialControl`), a `knownIds` set, and the poll loop (self-rescheduling `setTimeout`, 3-second interval, paused via `document.visibilitychange`, cleared on unmount). Renders, in order: `<ControlToggle conversationId control={control} onChanged={triggerImmediatePoll} />` (see Implementation Requirement 16), `<ReplyComposer conversationId onSent={handleOptimisticAppend} />` only when `control === "human"`, then the transcript (`messages.map(...)` over `MessageBubble`, same as today). `triggerImmediatePoll` cancels any pending scheduled poll and calls the poll function right away, per Decision 9. `handleOptimisticAppend` (from `sendHumanReplyAction`'s returned `message`, Implementation Requirement 4) appends the new row directly to local `messages` state (deduped by id against whatever the next poll tick returns) so the sender doesn't wait up to 3 seconds to see their own reply, and also calls `triggerImmediatePoll`.

16. **`app/(dashboard)/dashboard/conversations/_components/control-toggle.tsx`.** Add an optional `onChanged?: () => void` prop, called after `setConversationControlAction` returns `{ success: true }` (in a `useEffect` watching `state.success`, or inline after the `formAction` resolves — implementer's call for the exact React pattern, but it must fire only on genuine success, not on every render).

17. **New client component, `app/(dashboard)/dashboard/conversations/_components/reply-composer.tsx`.** `"use client"`, `useActionState` over `sendHumanReplyAction`, mirrors `control-toggle.tsx`'s structure: `<textarea name="content">`, hidden `conversationId`, disabled while pending, clears on success, shows `state.error` inline. Add an `onSent?: (message: Message) => void` prop, called with `state.message` when present after a successful submission.

18. **`app/(dashboard)/dashboard/conversations/[id]/page.tsx`.** Replace the current inline `<ControlToggle>` + `.map(...)` transcript rendering with a single `<LiveConversationPanel conversationId={conversation.id} initialControl={conversation.control} initialMessages={messages} />`. The lead card and page header stay exactly as they are today (Server-Component-rendered, no live-update requirement was asked for there).

19. **`docs/architecture.md`.** Add a "Phase 15b — staff reply persistence and live polling" section (after the existing Phase 15a subsection) documenting: the `human_agent` role and its RLS/grant pair; the polling trigger condition (Decision 2) and why it's a one-way latch, not a toggle; the two new rate-limit scopes and their sizing rationale; the split of "who consumes `control`/`asOf`" between the loader (network layer) and the dashboard's live panel (React state); and an explicit note that `public/widget-loader.js`'s hand-kept-in-sync duplication of `post-message.ts`'s types now includes the two new message types.

## Security requirements
- `docs/security.md` §1/§2: `app/api/chat/poll/route.ts` never accepts a `business_id`; resolves one from `widgetKey` via the unmodified `resolveBusinessFromWidgetKey`, exactly like `/api/chat`. The dashboard's new Server Actions resolve `businessId` only via `requireBusinessContext()`.
- `docs/security.md` §3 (D2, defense in depth): the `messages_insert_human_agent_reply` RLS policy and `sendHumanReplyAction`'s own `control === "human"` re-check both independently gate the write — neither is redundant-therefore-removable, per the same reasoning 15a's control guard already established.
- `docs/security.md` §4: the poll endpoint's tenant boundary is identical to `/api/chat`'s — a `conversationId` that doesn't belong to the resolved `businessId` gets the same generic `400`, never a distinguishable "not found." It is rate-limited under the two new scopes before any DB work happens, same ordering convention (`ip`-scoped check before resolution, `conversation`-scoped check after).
- `docs/security.md` §7: every new input (`content`, `after`, `conversationId`) is Zod-validated at its boundary — the route handler, and the two new Server Actions.
- No `NEXT_PUBLIC_*` variable, no secret, involved anywhere in this stage. The poll endpoint carries the same non-secret `widgetKey` the chat endpoint already does.

## Error handling
- Reply attempted while `control === "ai"` (stale tab, race with another staff member): the Server Action's own check catches it with a clear message; if bypassed, RLS denies the insert, surfaced via the existing `AppError`/`logAndGetUserMessage` convention, never a raw Postgres error.
- Cross-tenant `conversationId` on either the reply action or the poll routes: the existing no-existence-leak contract (`getConversationForBusiness` returns `null`) is preserved — a generic failure, not a distinguishable "not found."
- A poll request failure (network error, `500`, rate limit) on the widget side is silent to the prospect — no error bubble, no retry UI, just no update this tick, with the next scheduled tick trying again. This is a deliberate choice: surfacing background-poll failures as visible errors would be noisy and unhelpful for what is, from the prospect's perspective, an invisible background mechanism, unlike a failed *message send*, which already has its own explicit error/retry UI in `use-widget-chat.ts` untouched by this stage.
- A poll failure on the dashboard side similarly does not interrupt the page — the live panel simply keeps its last-known state and tries again next tick; no error banner is added for this stage (the existing page still renders correctly from its initial server-side data even if polling never succeeds even once).
- Empty/over-length `content` on the reply action: Zod rejects before any DB call.

## Acceptance criteria
- [ ] Both migrations apply cleanly; `authenticated` has column-scoped `INSERT` on `messages` restricted by the new RLS policy; the two new rate-limit scopes are accepted by the widened constraint.
- [ ] A direct attempt to insert `role = 'assistant'` as `authenticated`, or a `human_agent` row into an AI-controlled conversation, is denied by RLS — verified by direct test.
- [ ] Taking over a conversation and sending a reply via the dashboard reaches the widget within roughly one polling interval, without the prospect sending another message.
- [ ] The dashboard's live panel shows a new prospect-sent message without a manual refresh, within roughly one dashboard polling interval.
- [ ] Closing the widget panel, backgrounding the tab, or navigating away from the dashboard conversation page all visibly stop new poll requests (confirmed via network inspection), and reopening/refocusing resumes promptly (an immediate poll, not a wait for the next tick).
- [ ] No duplicate message ever renders on either side across a sequence of overlapping/edge-case polls.
- [ ] The `poll_ip`/`poll_conversation` rate limits correctly trip under sustained abusive polling and correctly do not trip under normal single-conversation polling at the nominal interval.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass.

## Automated checks
- `npm run lint`
- `npx tsc --noEmit` (after `npx next typegen` if route types go stale)
- `npm run build`
- `npm test` — still no real suite exists project-wide; not introduced here.

## Manual testing steps
1. Apply both migrations; verify grants/constraints live via `npx supabase db query --linked`.
2. **Direct RLS proof:** attempt to insert `role = 'assistant'` as `authenticated` — denied. Attempt `role = 'human_agent'` into a `control = 'ai'` conversation — denied. Attempt the same into a genuinely `control = 'human'` conversation for the same business — succeeds.
3. **End-to-end live takeover, the phase's core scenario:** open a real widget conversation, trigger an escalation, take the conversation over from the dashboard, send a reply via the new composer — confirm the reply appears in the widget panel within a few seconds, with no further prospect message sent, and with the correct "A team member replied" treatment.
4. **End-to-end dashboard live view:** with the conversation detail page open, send a new prospect message from the widget in a separate tab/window — confirm it appears in the dashboard transcript without a manual refresh.
5. **Pause/resume, widget:** close the widget panel mid-poll-cycle — confirm (via network tab) polling stops; reopen — confirm an immediate poll fires and any missed reply appears promptly. Background the browser tab — confirm polling stops; refocus — confirm an immediate poll fires.
6. **Pause/resume, dashboard:** background the tab while viewing a live conversation — confirm polling stops; refocus — confirm it resumes and catches up immediately. Navigate to a different dashboard page — confirm (via network tab) polling has stopped entirely, not just paused.
7. **No-handoff-signal case:** a conversation that never escalates and is never taken over — confirm the widget never issues a single poll request for it, across a normal multi-turn AI conversation.
8. **De-duplication:** deliberately trigger overlapping timing (e.g. send a staff reply right as a poll tick is in flight) and confirm the reply renders exactly once on the widget side, not twice.
9. **Rate limiting:** script a burst of poll requests against one `conversationId` well beyond 100/5min — confirm `429`s begin; confirm normal single-tab polling at the nominal interval never approaches the limit in a real session.
10. Cross-tenant: call the poll route with a widget key resolving to Business A but a `conversationId` belonging to Business B — confirm the generic `400`, same as `/api/chat`'s existing contract. Call `sendHumanReplyAction`/`pollConversationAction` with Business B's session against Business A's `conversationId` — confirm no data crosses over.
11. Regression: confirm the existing AI-answered flow, the 15a control toggle, escalation flagging, and every other dashboard section are unaffected.

## Out of scope
- The `needs_attention` alert badge/sound in the dashboard nav/UI — Phase 15c, unaffected by this stage.
- Per-staff-member identity on a message (who specifically sent it) — `"Team member"` stays anonymous, same as 15a's `HUMAN_CONTROL_MESSAGE`.
- Any change to `docs/phases.md`'s Phase 15 exit-criterion wording — still flagged (per 15a's entry) for Phase 15's overall closure, once 15c also lands.
- Read-receipt/typing-indicator-style signals for a staff reply in progress — not requested.
- Any reload-persistence of the widget's conversation/message state across a full page reload — still out of scope, carried from Phase 12's decision 4, unaffected by adding a poll endpoint.
