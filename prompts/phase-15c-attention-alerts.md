# Phase 15c — In-app attention alerts (badge + sound)

## Goal
After this is implemented: while any dashboard page is open, a business member sees a live-updating numeric badge on the "Conversations" nav item whenever one or more conversations have `needs_attention = true`, and hears a short alert sound the moment a *new* conversation needs attention (not on every page load). The conversations list shows a per-row "Needs attention" indicator. A business member can clear the flag — either by taking over the conversation (an existing action that now also acknowledges the alert) or, for a conversation the AI is still handling fine, via an explicit "Dismiss" action on the conversation detail page. This closes the gap 15a's own entry flagged: until now, nothing could ever clear `needs_attention` once set, so a badge counting it would only ever grow.

## Current phase
Phase 15 — Human handoff (`docs/phases.md`). Confirmed from `STATE.md` §1/§3: 15a and 15b are both complete and fully verified (including a real-browser follow-up pass). This is the third and final planned Phase 15 stage.

## User request
Phase 15's original scope, set at the start of this phase: "In-app alerting only — a visual badge/sound in the dashboard when a conversation needs human attention. No email, no push notification, no SMS — that's explicitly out of scope for v1." This prompt is that stage, now that 15a (the state model) and 15b (live delivery) are both done and the `needs_attention` flag has real, verified data flowing into it.

## Skills and docs read
- `STATE.md` (full) — 15a/15b's complete entries, D8/D9/D10 in §4.
- `docs/phases.md` — Phase 15 entry ("Escalation from AI to a human representative... Exit: an escalation trigger reliably moves a live conversation to human control and the prospect sees a coherent transition").
- `docs/security.md` — §3 (RLS/grants, defense in depth), §1/§2 (tenant scoping).
- `docs/prompt-template.md`.

## Existing code inspected
- `lib/conversations.ts` — `flagConversationNeedsAttention()` (service-role only, sets `needs_attention = true`, 15a); `setConversationControl()` (currently updates only `control`, `authenticated` grant is column-scoped to `control` alone, 15a); `listConversationsForBusiness()` (already returns full `Conversation` rows including `needs_attention`, no change needed there).
- `supabase/migrations/20260814074411_add_conversation_control_and_attention.sql` — confirmed live: `authenticated` has `UPDATE` on `control` only; **no grant exists on `needs_attention` for `authenticated`** — the service role is the only writer today. This is the gap this stage must close for the dashboard to ever clear the flag.
- `app/(dashboard)/dashboard/conversations/actions.ts` — `setConversationControlAction`, `sendHumanReplyAction`, `pollConversationAction` (Phase 15b's established Server Action patterns: Zod-validated, `requireBusinessContext()`, boolean/no-existence-leak return contracts, and the polling call shape called directly as an async function from a client component).
- `app/(dashboard)/dashboard/conversations/_components/live-conversation-panel.tsx` — owns `control`/`messages` state via a 3-second self-rescheduling `setTimeout` poll, paused on `document.visibilitychange`, cleaned up on unmount. This stage's Dismiss button needs the same "poll is the source of truth, action success triggers one immediate extra poll" pattern (Phase 15b's Decision 9), extended to also track `needsAttention`.
- `app/(dashboard)/dashboard/layout.tsx` — the Server Component wrapping every dashboard page in `<Sidebar>`/`<MobileNav>`/`{children}`. Both nav components are always mounted (CSS-hidden by breakpoint, not conditionally rendered), which matters for where a single shared poller should live.
- `app/(dashboard)/dashboard/_components/{sidebar,mobile-nav,nav-items}.tsx` — `NAV_ITEMS` is one shared array consumed by both nav surfaces; adding a badge to the "Conversations" entry needs to work identically in both without duplicating the poll.
- `app/(dashboard)/dashboard/conversations/page.tsx` — the conversations list: server-rendered, already has one per-row badge pattern (the "Lead" pill, computed in-memory from a separate query) to follow for the new "Needs attention" pill.
- `app/(dashboard)/dashboard/conversations/[id]/page.tsx` — passes `initialControl`/`initialMessages`/`initialAsOf` into `<LiveConversationPanel>`; will also need to pass `initialNeedsAttention`.
- `package.json` — confirmed no audio/sound library is installed or needed; the Web Audio API (`AudioContext`) is a native browser API.

## Relevant existing architecture
- D8 (`STATE.md` §4): polling, not WebSocket/SSE, is this project's chosen live mechanism, and dashboard polling specifically gets no new rate-limit scope (Clerk-authenticated Server Action, not public traffic) — this stage's new poller follows the identical pattern already proven twice (conversation detail page, widget loader).
- `docs/security.md` §3 (D2, defense in depth): every new `authenticated` write gets both a column-scoped grant and reliance on the existing business-match RLS policy — this stage reuses 15a's `conversations_update_own_business` policy unchanged, only widening the grant.
- AI-generated signals are never trusted for authorization; `needs_attention` is set only by server-side escalation logic (15a, unchanged) and cleared only by a deliberate, trusted dashboard action (this stage) — never by the AI, never automatically by a poll or page view.

## Decisions and assumptions

1. **`needs_attention` currently has no path to ever become `false` again once set — a real gap 15a's own entry explicitly flagged as this stage's job to close.** This stage adds two ways to clear it, both requiring a deliberate human action, not an implicit one (mirroring 15a's own "control only changes via deliberate action" principle):
   - **Taking over a conversation now also clears `needs_attention`** (extends `setConversationControl`'s existing behavior when transitioning to `"human"` only — a hand-back to `"ai"` does not touch it). Taking over is already the human's explicit acknowledgment; treating it as also clearing the alert avoids requiring a second click for the overwhelmingly common path (see an alert → take it over).
   - **A new, separate "Dismiss" action** on the conversation detail page, for the case where staff reviews an escalated conversation and decides the AI is handling it fine after all — no takeover needed, but the alert should still stop showing.
   This is a real, if modest, scope addition beyond "just show a badge" — flagged explicitly here for approval, not silently assumed, since without it the badge would only ever count upward.
2. **One shared poller, not two.** Both `Sidebar` and `MobileNav` are always mounted; polling independently in each would double the request rate for no benefit. A single client component/context, mounted once in `dashboard/layout.tsx`, owns the poll and feeds both nav surfaces.
3. **Poll interval: 3 seconds, matching the dashboard's existing cadence** (`LiveConversationPanel`, Phase 15b) — no new reasoning needed, this is the same "single authenticated staff session" traffic class D8/Phase 15b's Decision 3 already covers. No new rate-limit scope, same reasoning as the existing dashboard poller.
4. **The sound fires only on a genuine increase in the attention count relative to what this browser tab already knew**, never on initial page load/mount (which would alarm on every login if a backlog already exists) and never on a decrease. This is an in-memory, per-tab comparison — no "seen" state is persisted anywhere.
5. **Sound is a synthesized tone via the Web Audio API (`AudioContext` + `OscillatorNode`), not an audio file.** Avoids adding a binary asset to the repo (sourcing/licensing is a real, if small, concern for a production asset) and avoids any new dependency — a few lines of native browser API, consistent with this project's "hand-roll it" discipline (D4/D8's own precedent).
6. **Browser autoplay policy**: most browsers only allow `AudioContext` to produce sound after a user gesture on the page. The `AudioContext` is created lazily on the first `click`/`keydown` anywhere in the dashboard (a one-time listener), not eagerly on mount — by the time a real alert needs to play, a real dashboard session will almost always have already had at least one such interaction (a nav click, at minimum). The one remaining edge case — an alert firing before the very first interaction on a freshly loaded, completely idle tab — is an accepted, documented browser limitation, not something this stage can fully engineer around.
7. **The nav badge shows the actual count** (capped at a readable "9+" past a threshold), not just a presence dot — more informative, and cheap since the count is already being fetched.
8. **The conversations list page's per-row "Needs attention" badge is static (server-rendered from the same query that already renders the list), not itself live-polled** — only the nav-level badge/sound needs to be live per the phase's original scope ("a visual badge/sound in the dashboard"); making every list page live is a larger, unrequested scope increase.
9. **The Overview page's stat cards are not touched.** No new "Needs attention" stat card — keeps this stage scoped to the nav alert and the two clearing actions, not a general dashboard redesign.
10. **Not split into further stages.** This is comparably sized to 15a (a state/grant change plus a handful of small, well-understood UI additions) and smaller than 15b — one prompt is appropriate, consistent with only splitting when a diff is genuinely too large to review as a unit.

## Open decisions this depends on
None. `STATE.md` §4 has no open decisions blocking this work.

## Dependencies / packages required
None. The Web Audio API is native; no new npm package.

## Files likely to change
- **New:** `supabase/migrations/<timestamp>_grant_needs_attention_update.sql`
- **New:** `app/(dashboard)/dashboard/_components/attention-provider.tsx`
- **New:** `app/(dashboard)/dashboard/_components/dismiss-attention-button.tsx`
- Modified: `lib/conversations.ts` (`setConversationControl` clears `needs_attention` on takeover; new `dismissConversationAttention`; new `countConversationsNeedingAttention`)
- Modified: `app/(dashboard)/dashboard/actions.ts` (new file, or extended if one already exists by the time this is implemented — confirmed not to exist yet) — new `pollAttentionCountAction`
- Modified: `app/(dashboard)/dashboard/conversations/actions.ts` (new `dismissAttentionAction`; `pollConversationAction`'s return type gains `needsAttention`)
- Modified: `app/(dashboard)/dashboard/layout.tsx` (mounts `<AttentionProvider>`)
- Modified: `app/(dashboard)/dashboard/_components/{sidebar,mobile-nav,nav-items}.tsx` (badge on the Conversations item)
- Modified: `app/(dashboard)/dashboard/conversations/page.tsx` (per-row "Needs attention" badge)
- Modified: `app/(dashboard)/dashboard/conversations/[id]/page.tsx` and `_components/live-conversation-panel.tsx` (`needsAttention` state + Dismiss button)
- Modified: `docs/architecture.md`

## Database changes

New migration (`npx supabase migration new grant_needs_attention_update`):

```sql
-- Phase 15c: lets the dashboard clear needs_attention (take-over and
-- the new explicit Dismiss action). No RLS policy change needed --
-- the existing conversations_update_own_business policy (Phase 15a)
-- already scopes any UPDATE to the caller's own business; this only
-- widens which column authenticated may touch, same pattern as
-- Phase 15a's original `grant update (control)`.
grant update (needs_attention) on public.conversations to authenticated;
```

Exact steps: write the migration, `npx supabase db push --linked`, verify live via `npx supabase db query --linked`: `has_column_privilege('authenticated', 'public.conversations', 'needs_attention', 'UPDATE')` is now `true`.

## Server / client boundaries
- The migration, `lib/conversations.ts` changes, and all Server Actions are server-only.
- `AttentionProvider` and `DismissAttentionButton` are client components; no Supabase client or secret reaches either. `AttentionProvider` only calls `pollAttentionCountAction()` (a Server Action), same pattern as `LiveConversationPanel`.
- No new env var, no new public route.

## Implementation requirements

1. **Migration**, exactly as shown above.

2. **`lib/conversations.ts`: extend `setConversationControl`.** When `control === "human"`, the update also sets `needs_attention: false`; when `control === "ai"`, only `control` is updated (unchanged behavior). Update the function's doc comment to describe this side effect explicitly (it currently states `needs_attention` is never writable from this path — that sentence must be corrected, not left stale).

3. **`lib/conversations.ts`: new `dismissConversationAttention`.**
   ```ts
   export async function dismissConversationAttention(
     supabase: SupabaseClient,
     businessId: string,
     conversationId: string,
   ): Promise<boolean>
   ```
   Updates only `needs_attention: false`, same tenant-scoped `.eq(business_id).eq(id)` + boolean-return, no-existence-leak contract as `setConversationControl`.

4. **`lib/conversations.ts`: new `countConversationsNeedingAttention`.**
   ```ts
   export async function countConversationsNeedingAttention(
     supabase: SupabaseClient,
     businessId: string,
   ): Promise<number>
   ```
   A `count`-only query (`.select("id", { count: "exact", head: true })`) filtered on `business_id` and `needs_attention = true` — the existing partial index from Phase 15a (`conversations_business_needs_attention_idx`) covers exactly this query shape.

5. **New file, `app/(dashboard)/dashboard/actions.ts`.** `"use server"`. `pollAttentionCountAction(): Promise<number>` — `requireBusinessContext()`, calls `countConversationsNeedingAttention`. No Zod input to validate (no arguments). Let real failures propagate as a rejected promise, same reasoning as `pollConversationAction` (the caller's poll loop treats a failure as "try again next tick," not a value to guess).

6. **`app/(dashboard)/dashboard/conversations/actions.ts`: new `dismissAttentionAction`.** Zod: `{ conversationId: z.string().uuid() }`. `requireBusinessContext()`, calls `dismissConversationAttention`, `revalidatePath` the conversation detail page, returns the same `{ error?; success? }` shape as the file's other actions.

7. **`app/(dashboard)/dashboard/conversations/actions.ts`: extend `pollConversationAction`.** `PollConversationResult` gains `needsAttention: boolean`, sourced from the re-fetched `conversation.needs_attention` (already available from the existing `getConversationForBusiness` call in this function — no new query).

8. **New client component, `app/(dashboard)/dashboard/_components/attention-provider.tsx`.** `"use client"`. Owns: the attention count (`useState`, seeded at `0`, first real value arrives on the first poll tick — do not attempt to seed it from a server-rendered initial value, since it's rendered once in the layout and would otherwise require every single dashboard page to fetch and thread it through, which the badge's own first poll tick already handles within 3 seconds); the previous-count ref for the "did it increase" comparison; the shared `AudioContext` (created lazily, see Requirement 9); a self-rescheduling 3-second poll (same shape as `LiveConversationPanel`: `poll()` clears any pending timer, calls `pollAttentionCountAction()`, updates state, reschedules only if `document.visibilityState === "visible"`; a `document.visibilitychange` listener pauses/resumes with an immediate poll on resume; cleanup on unmount — this component is only ever unmounted by leaving the `/dashboard/*` layout entirely). Exposes the count via a small React Context (`AttentionCountContext`), consumed by `Sidebar`/`MobileNav`. Renders `{children}` and nothing else visually itself.

9. **Sound: a `playAttentionChime()` helper, called from `AttentionProvider` only when the new count is strictly greater than the previously known count, and only after the first poll has already completed once (so mount-time doesn't count as an "increase" from the seeded `0`).** Lazily creates and reuses one `AudioContext` (stored in a ref), created on the dashboard's first `click`/`keydown` (a one-time `document`-level listener registered in `AttentionProvider`'s mount effect, removed after first fire). The chime itself: a short (~250-300ms) oscillator tone, low gain, exponential decay -- exact frequency/envelope is an implementation detail, not a hard requirement, but must be brief and not jarring (this is a notification, not an alarm).

10. **`app/(dashboard)/dashboard/layout.tsx`.** Wrap the existing `<Sidebar>`/`<MobileNav>`/`{children}` in `<AttentionProvider>`.

11. **`app/(dashboard)/dashboard/_components/nav-items.tsx`, `sidebar.tsx`, `mobile-nav.tsx`.** Both nav components read the count via `useContext(AttentionCountContext)` (or an exported `useAttentionCount()` hook) and render a small numeric badge next to the "Conversations" item specifically — not a generic mechanism attached to arbitrary nav items, since only Conversations has an attention concept. Zero count renders no badge at all (not a "0" badge). Cap the displayed number at a readable ceiling (e.g. "9+") past a small threshold — exact threshold is an implementation detail.

12. **`app/(dashboard)/dashboard/conversations/page.tsx`.** Add a "Needs attention" pill per row where `conversation.needs_attention === true`, alongside the existing "Lead" pill (both can show on the same row) — visually distinct from the "Lead" pill's color (that one already uses the primary-token treatment; use a warning-toned treatment consistent with `ControlToggle`'s existing "Human-controlled" amber badge from Phase 15a, for a consistent "needs a human" visual language across the dashboard).

13. **New client component, `app/(dashboard)/dashboard/_components/dismiss-attention-button.tsx`.** `"use client"`, `useActionState` over `dismissAttentionAction`, mirrors `control-toggle.tsx`'s structure (a small button, no confirmation dialog needed — this is a low-stakes, reversible-by-re-escalation action). Accepts an `onDismissed?: () => void` callback, same "trigger an immediate poll, don't wait for the next tick" pattern as `ControlToggle`'s `onChanged`.

14. **`app/(dashboard)/dashboard/conversations/_components/live-conversation-panel.tsx` and `[id]/page.tsx`.** The panel gains `needsAttention` state (seeded from a new `initialNeedsAttention` prop, updated from every poll tick's `result.needsAttention`, per Requirement 7). Render the "Needs attention" indicator plus the new `<DismissAttentionButton>` (only when `needsAttention === true`) near the existing `<ControlToggle>`. Dismissing triggers an immediate poll (same pattern as `handleReplySent`/`ControlToggle`'s `onChanged`).

15. **`docs/architecture.md`.** Add a "Phase 15c — in-app attention alerts" section documenting: the two ways `needs_attention` now clears (take-over, explicit dismiss) and why both exist; the single shared nav poller (not duplicated per nav surface); the synthesized-tone sound choice and its autoplay-policy handling; and that this closes the gap 15a's entry flagged.

## Security requirements
- `docs/security.md` §3 (D2): the new `needs_attention` grant is column-scoped, exactly like `control`'s existing grant; the existing business-match RLS policy is unchanged and still the actual tenant boundary for both columns.
- `docs/security.md` §1/§2: every new Server Action resolves `businessId` only via `requireBusinessContext()`. `dismissAttentionAction`'s `conversationId` is Zod-validated.
- `needs_attention` is still never set to `true` from a dashboard caller (no grant path exists for that direction from `authenticated` — only the service role, via `flagConversationNeedsAttention`, unchanged) — this stage only adds the ability to clear it, not to fabricate an alert.
- No secret, no `NEXT_PUBLIC_*` variable, involved anywhere in this stage.

## Error handling
- A poll failure in `AttentionProvider` is silent (same convention as `LiveConversationPanel`/the widget loader) — keep the last-known count, try again next tick; no error banner in the nav.
- `dismissAttentionAction`/the take-over path against a cross-tenant or nonexistent `conversationId`: existing no-existence-leak contract, zero rows affected, generic failure message.
- If `AudioContext` construction throws (a browser without Web Audio API support, exceedingly rare) or `.resume()`/playback fails, the failure is caught and swallowed — a missing notification sound must never break the badge or any other dashboard functionality.

## Acceptance criteria
- [ ] Migration applies cleanly; `authenticated` can now update `conversations.needs_attention` (verified via `has_column_privilege`).
- [ ] Taking over a conversation clears `needs_attention` in the same action (verified by direct DB read, not just UI).
- [ ] Hand-back-to-AI does not touch `needs_attention`.
- [ ] The Dismiss button clears `needs_attention` without changing `control`.
- [ ] The nav badge count matches the real number of `needs_attention = true` conversations for the signed-in business, updates within one 3-second poll tick of a change, and never shows for a different business's data.
- [ ] The chime plays when the count increases after the initial load, and does not play on initial mount or on a decrease.
- [ ] The conversations list shows the per-row "Needs attention" pill correctly for real data.
- [ ] Cross-tenant: a second business's badge/list are unaffected by the first business's escalations, dismissals, and take-overs.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass.

## Automated checks
- `npm run lint`
- `npx tsc --noEmit` (after `npx next typegen` if route types go stale)
- `npm run build`
- `npm test` — still no real suite exists project-wide; not introduced here.

## Manual testing steps
1. Apply the migration; verify the new column-scoped grant live.
2. Trigger a real escalation on a fresh conversation (as in prior phases) — confirm the nav badge appears with count 1 within ~3 seconds, and the chime plays (assuming a prior click has already occurred on the page, per Decision 6).
3. Open a second dashboard tab for the same business — confirm both tabs' badges update independently and both stay in sync.
4. Take over the escalated conversation — confirm the nav badge count drops to 0 and the conversation detail page's own "Needs attention" indicator disappears, without a manual refresh.
5. Trigger a second escalation on a different conversation, this time dismiss it via the new Dismiss button without taking it over — confirm the badge drops and `control` remains `"ai"` (verified directly in the DB).
6. Trigger two escalations back-to-back — confirm the badge shows "2" and the chime plays once per genuine increase, not twice for a single poll tick that happens to observe both at once, and not again for the same already-known count on subsequent ticks.
7. Regression: confirm a normal, non-escalating conversation never affects the badge; confirm the conversations list's existing "Lead" pill still renders correctly alongside the new "Needs attention" pill.
8. Cross-tenant: escalate a conversation on Business A; confirm Business B's dashboard badge and conversations list show no change.
9. Navigate away from `/dashboard/*` entirely (e.g., sign out) and confirm (via network tab) the attention poll stops.

## Out of scope
- Email, push notification, or SMS alerting — explicitly out of scope for the whole of Phase 15, per the phase's original framing.
- Any per-user "mute" or notification-preference setting — not requested.
- A dedicated "Needs attention" stat card on the Overview page — not requested, keeps this stage scoped to the nav alert.
- Live-polling the conversations list page itself (only the nav badge/sound and the conversation detail page are live) — a static per-row badge is sufficient for this stage's scope.
- Any change to `docs/phases.md`'s Phase 15 exit-criterion wording — still flagged (per 15a's entry) for Phase 15's overall closure; this is the last of the three planned stages, so that edit is worth actually making once this stage closes, not deferred again.
