# Phase 15a — Handoff state model and the AI-pause guard

## Goal
After this is implemented: every conversation carries an explicit `control` state (`ai` | `human`) and a `needs_attention` flag. `/api/chat` checks `control` before invoking `askSalesEmployee()` — if a conversation is human-controlled, the AI is never called, so the AI and a human can never both answer the same prospect message. When the AI escalates (`escalate: true`) on a turn, the conversation is flagged `needs_attention = true`. A business member can take over or hand back a conversation from its existing dashboard detail page via a minimal control toggle. No live/polling delivery, no dashboard alert badge/sound, and no reply-from-dashboard UI exist yet — those are later Phase 15 stages.

## Current phase
Phase 15 — Human handoff (`docs/phases.md`). Confirmed from `STATE.md` §1: Phase 14 is complete, Phase 15 not started, no prompt drafted before this one. This is stage **a** of a staged rollout — see "Staging rationale" below.

## User request
Build Phase 15 — human handoff — with: (1) real-time live takeover, not just a dashboard inbox/notification, so a human can join an in-progress widget conversation and reply, reaching the prospect in real time or near-real-time via polling; (2) the AI must stop answering once a conversation is under human control, with an explicit state distinguishing AI-handled from human-controlled, checked by `/api/chat` before calling `askSalesEmployee()`, to prevent the AI and a human both replying to the same message; (3) in-app-only alerting (visual badge/sound in the dashboard) when a conversation needs attention — no email/push/SMS. Given the size, the user asked for an explicit staged rollout to be proposed (same pattern as Phases 13a–c/14a–c) and for only the first stage's prompt to be written now, stopping for approval before drafting later stages.

## Skills and docs read
- `STATE.md` (full) — current phase, all prior decisions (D1–D7), env vars in use, database state.
- `PRODUCT.md` — §3 actors ("Business member ... Can take over conversations. Role model is defined in the phase that introduces it."), §7 AI behavior contract (escalation triggers), §8 lead model (`qualification`/`escalate` as untrusted, display-only AI signals — the precedent this phase's own AI-generated `escalate` flag already follows).
- `docs/phases.md` — Phase 15 entry: "Escalation from AI to a human representative. Mechanism is product-defined. The AI must recognize when to stop answering and hand over. Exit: an escalation trigger reliably moves a live conversation to human control and the prospect sees a coherent transition."
- `docs/security.md` — §1 (tenant isolation), §2 (identity), §7 (untrusted input), §8 (AI output is untrusted — `escalate` is already treated this way).
- `docs/prompt-template.md` — this file's own contract.
- No skill was needed for this stage (no Clerk/Supabase-pattern questions beyond what's already established in this codebase; `supabase-postgres-best-practices` conventions already in use here were followed by inspection of existing migrations, not re-read in full).

## Existing code inspected
- `app/api/chat/route.ts` — the full current request flow: rate limits (ip/key/conversation) → `resolveBusinessFromWidgetKey` → `getConversationForBusiness`/`createConversation` → `listRecentMessages` → `createMessage` (user turn) → `askSalesEmployee(...)` → `createMessage` (assistant turn) → response `{ conversationId, answer, escalate }`.
- `lib/conversations.ts` — `createConversation`, `countConversationsForBusiness`, `listConversationsForBusiness`, `getConversationForBusiness`. All take an injected Supabase client (Clerk-session or service-role) per the established client-injection convention.
- `lib/messages.ts` — `createMessage`, `listRecentMessages`, `listMessagesForConversation`. Same client-injection convention.
- `lib/rag.ts` — `askSalesEmployee(supabase, businessId, conversationId, businessName, question, history)`. Confirmed `escalate`/`escalationReason` are model-self-reported, untrusted, display-only fields (Phase 9's precedent), never used for authorization.
- `supabase/migrations/20260813120000_create_conversations_table.sql` — current `conversations` schema: `id`, `business_id`, `source`, `created_at` only. RLS: `select`/`insert` policies scoped to `business_id in (select id from businesses where clerk_org_id = ...)`. Grants: `authenticated` has `select, insert` only — **no `update` grant exists today**.
- `supabase/migrations/20260813130005_create_messages_table.sql` — current `messages` schema: `role` is `check (role in ('user', 'assistant'))`. `authenticated` has `select` only — no `insert`/`update` grant (only the service role writes).
- `lib/supabase/types.ts` — `Conversation` and `Message`/`MessageRole` types, as shown above.
- `app/(dashboard)/dashboard/conversations/[id]/page.tsx` — the existing read-only conversation detail page: loads conversation + messages + lead, renders transcript and lead card. No mutation UI exists here yet.
- `app/(dashboard)/dashboard/leads/actions.ts` + `.../leads/status-select.tsx` — the established pattern for a small inline dashboard mutation: a `"use server"` action taking `FormData`, Zod-validated, `requireBusinessContext()`-guarded, calling a `lib/*.ts` function that returns `boolean` (affected-or-not, no existence-leak), paired with a `"use client"` component using `useActionState` + `<form action={formAction}>`.
- `lib/leads.ts`'s `updateLeadStatus()` — the exact "no existence-leak, boolean return, tenant-scoped `.eq(business_id).eq(id)`" contract this stage's new control-setter should match.
- `app/(widget)/widget/embed/_lib/use-widget-chat.ts` and `.../escalation-banner.tsx` — confirmed the widget currently renders `response.answer` directly as an assistant bubble on every request/response cycle, with no server-side history reload; a static acknowledgment string returned from `/api/chat` in the same response shape requires **zero widget code changes** to display correctly.
- `AGENTS.md` §9, `docs/security.md` §3 — this project's "hand-roll it, no new infra unless justified" precedent, most directly established by Phase 11's rate-limiting decision (D4: a plain Postgres counter table, not Redis).

## Relevant existing architecture
- Every business-owned table is `business_id`-scoped with RLS + an explicit table-level grant (grants default to zero — Phase 3's `ALTER DEFAULT PRIVILEGES` migration). Column-level grants are already used once (`businesses.widget_allowed_origin`, Phase 11) for a narrow, dashboard-writable field on an otherwise more-restricted table — the same shape this stage needs for `conversations.control`.
- `lib/*.ts` data-access functions take an injected Supabase client so the same table can be written from both the Clerk-session dashboard path and the service-role widget path without duplicating query logic.
- AI-generated signals (`escalate`, `qualification`) are always untrusted and display-only — never authorization inputs. This stage's new `control` state is the opposite: it's an **application-controlled** state, only ever set by trusted server code (the dashboard's authenticated Server Action, or `/api/chat`'s own service-role write for `needs_attention`) — never derived from or set directly by model output.
- Any authenticated business member (not just `org:admin`) already has CRUD/action rights over products/services/FAQs/lead status (D7) and can already view conversations. `PRODUCT.md` §3 explicitly says business members "can take over conversations," so this stage's control-toggle authorization follows D7's precedent, not the stricter `org:admin`-only pattern used for business-profile edits.

## Staging rationale

Phase 15 is being split into three prompts, ordered by risk and dependency, the same way Phases 13 and 14 were:

- **15a (this prompt) — data model, escalation/attention state, and the AI-pause guard.** This is the highest-risk piece: the user explicitly flagged that a missing or wrong pause check produces a real, confusing product failure (AI and a human both replying to the same prospect message), not a minor bug. Building and proving this guard first — independent of any live-delivery mechanism — means the core correctness property ("once human-controlled, the AI never answers") is verified in isolation, via direct requests, before any UI complexity is layered on top. A minimal dashboard control toggle (take over / hand back) is included here, not deferred, because without *some* way to flip `control` to `human`, the pause guard can't be exercised or tested at all.
- **15b (next, not yet drafted) — human reply delivery and the live/polling mechanism.** Builds the actual "live takeover" experience: a dashboard reply form (only usable once a conversation is human-controlled, per 15a's state) and the widget-side polling that picks up staff replies without the prospect needing to send another message. This is where the real-time/near-real-time mechanism decision (see below) is implemented. Depends on 15a's state model and guard existing and being correct first.
- **15c (after that, not yet drafted) — dashboard in-app alerting UI.** The visual badge/sound when `needs_attention` is true. Deliberately last: it's the lowest-risk, purely additive piece (a dashboard polling query + UI), and it reads a flag that 15a already writes correctly — no reason to build the alert before the state it alerts on on is proven.

This mirrors Phase 14's ordering rationale (highest-scrutiny piece — the write-capable tool — got the most review) and Phase 13's (foundation before the sections that depend on it).

## Live mechanism decision (applies across all of 15a–15c, recorded here since 15a establishes the state it depends on)

**Chosen: polling, not WebSocket/SSE.** Reasoning, following the same shape as Phase 11's rate-limiting decision (D4):

- This app has no long-running server process — it's Next.js route handlers/Server Actions on what is designed to be a stateless serverless deployment target (`AGENTS.md` §2: "Vercel for deployment when deployment is introduced"). A WebSocket server needs a persistent process to hold open connections; running one would mean standing up a second, genuinely new piece of infrastructure this project has never needed, directly against `AGENTS.md` §9's "install a dependency only when the current phase needs it" and the established "hand-roll it" precedent (D4's Postgres-counter-table-not-Redis reasoning applies with equal force here).
- Server-Sent Events avoid a new *server*, but a long-lived SSE connection held open inside a serverless function invocation is fragile on this kind of deployment target (execution-time limits, connection drops on redeploy/scale events) and would need a separate pub/sub or keep-alive layer to be reliable — again, new infrastructure, not a config change.
- Polling reuses exactly what already exists: the `conversations`/`messages` tables, the existing Clerk-session and service-role Supabase clients, and the existing route-handler/Server-Action patterns. Both the widget (an anonymous prospect tab) and the dashboard (an authenticated staff member's tab) can each poll a tenant-scoped, already-authorized read on a short interval. This is the smallest-blast-radius option that still delivers "near-real-time," which is explicitly what the user scoped this to ("real time or near-real-time via polling").
- This is not this stage's implementation work (15a adds no polling endpoint) — it's recorded now because 15a's state model (`control`, `needs_attention`) is exactly what 15b's polling reads and 15c's polling alerts on, and the mechanism choice shapes what those columns need to support (a plain row read, not a change-stream).

**This should be recorded as a new resolved decision (D8) in `STATE.md` §4 once this stage — or Phase 15 as a whole — closes**, following the existing D1–D7 table format.

## Decisions and assumptions

1. **Escalation sets `needs_attention`, never `control` — a confirmed, deliberate reinterpretation of `docs/phases.md`'s literal Phase 15 exit-criterion wording ("an escalation trigger reliably moves a live conversation to human control"), not an oversight or a loose reading.** If `escalate: true` flipped `control` to `"human"` automatically, every escalating turn would immediately switch the prospect from a working AI answer to this stage's canned "someone will reply shortly" message — even though no staff member has necessarily seen the alert yet, since 15c's alerting UI doesn't exist until the third stage. That would make the product *worse* at exactly the moment it's supposed to help: the AI would go silent before a human is actually watching. The user was asked to confirm this reading explicitly and did: escalation should raise a flag for a human to claim, not unilaterally silence the AI. `control` only ever changes via the trusted dashboard Server Action (Implementation Requirement 6) — never from AI output, consistent with `docs/security.md` §8's "AI output is untrusted input" and this codebase's existing precedent that `escalate`/`qualification` are always display-only signals, never authorization/control inputs. The literal phrase "moves ... to human control" in `docs/phases.md` is satisfied at the level of the full Phase 15 flow (trigger → attention flag → a human's deliberate take-over action → control genuinely moves to human), not by the trigger alone — recorded here so a future session reading only `docs/phases.md`'s summary line doesn't conclude the codebase should make escalation itself flip `control`.
2. This reinterpretation must be recorded as its own explicit entry in `STATE.md` §4 at this stage's closure — either folded into the D8 write-up (live mechanism) as a second clause, or as its own D9, implementer's call on numbering, but it must not be left implicit in prose only.
3. Once all three Phase 15 stages are complete, `docs/phases.md`'s own Phase 15 entry is worth a small clarifying edit (e.g. "a human explicitly taking over" rather than "an escalation trigger ... moves ... to human control") so the phase doc — the durable spec other sessions read first — matches the confirmed design without requiring a cross-reference to `STATE.md` to understand why. Not required now (mid-phase, only 15a's scope); flagged for revisiting at Phase 15's overall closure, not this stage's.

## Open decisions this depends on
None. No `STATE.md` §4 "open decisions" entries block this work (confirmed: "None currently open" as of this reading).

## Dependencies / packages required
None. No new npm package. Confirmed by inspecting `package.json` — this stage only adds a migration, two `lib/conversations.ts` functions, one `app/api/chat/route.ts` conditional, one new Server Action, and one small client component, all using already-installed packages (`zod`, existing Supabase client helpers).

## Files likely to change
- **New:** `supabase/migrations/<timestamp>_add_conversation_control_and_attention.sql`
- **New:** `app/(dashboard)/dashboard/conversations/actions.ts`
- **New:** `app/(dashboard)/dashboard/conversations/_components/control-toggle.tsx`
- Modified: `lib/conversations.ts` (two new functions)
- Modified: `lib/supabase/types.ts` (`Conversation` type gains `control`/`needs_attention`; new `ConversationControl` type)
- Modified: `app/api/chat/route.ts` (control check before `askSalesEmployee()`; `needs_attention` flag write on escalation)
- Modified: `app/(dashboard)/dashboard/conversations/[id]/page.tsx` (renders current control state + the new toggle)
- Modified: `docs/architecture.md` (new subsection, same convention as every prior phase)

## Database changes

New migration, `supabase/migrations/<timestamp>_add_conversation_control_and_attention.sql` (generate the real timestamp via `npx supabase migration new add_conversation_control_and_attention` rather than hand-picking one):

```sql
alter table public.conversations
  add column control text not null default 'ai' check (control in ('ai', 'human')),
  add column needs_attention boolean not null default false;

create index conversations_business_needs_attention_idx
  on public.conversations (business_id, needs_attention)
  where needs_attention = true;

-- Dashboard staff can take over / hand back a conversation. Column-scoped
-- to `control` only -- needs_attention is written exclusively by the
-- service-role widget path (app/api/chat/route.ts), which bypasses grants
-- entirely, so no authenticated grant on that column is needed or added.
grant update (control) on public.conversations to authenticated;

create policy "conversations_update_own_business" on public.conversations
  for update
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  )
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
```

Exact steps: write the migration file, `npx supabase db push --linked`, then verify grants live the same way every prior phase has (`has_column_privilege`/`has_table_privilege` checks via `npx supabase db query --linked`) — confirm `authenticated` can update `control` but not `needs_attention`, `anon` has no grant on either, and the partial index exists.

No changes to `messages` in this stage — no new message role, no new grant. That is 15b's concern (staff-reply persistence), not this stage's.

## Server / client boundaries
- The migration, `lib/conversations.ts`'s new functions, and `app/api/chat/route.ts`'s guard are all server-only (`server-only` package already enforced at the `lib/` layer).
- `control`/`needs_attention` reach the client only as plain rendered values on the existing server-rendered conversation detail page (`[id]/page.tsx`) — no secret involved.
- The new Server Action (`app/(dashboard)/dashboard/conversations/actions.ts`) runs server-side (`"use server"`), authorized via `requireBusinessContext()` exactly like every existing dashboard action.
- No client component gains access to any Supabase client or service-role key. The new client component (`control-toggle.tsx`) only submits a form to the Server Action, matching `status-select.tsx`'s exact shape.

## Implementation requirements

1. **Migration.** Add `control` (`text`, `not null default 'ai'`, `check (control in ('ai', 'human'))`) and `needs_attention` (`boolean`, `not null default false`) to `conversations`. Add the partial index shown above. Grant `update (control)` to `authenticated`. Add the `for update` RLS policy shown above (business-match only — same shape as the table's existing `select`/`insert` policies). Do not touch `messages` in this migration.

2. **`lib/supabase/types.ts`.** Add `export type ConversationControl = "ai" | "human";`. Extend `Conversation` with `control: ConversationControl` and `needs_attention: boolean`.

3. **`lib/conversations.ts`: `setConversationControl`.** New function:
   ```ts
   export async function setConversationControl(
     supabase: SupabaseClient,
     businessId: string,
     conversationId: string,
     control: ConversationControl,
   ): Promise<boolean>
   ```
   Updates only the `control` column, `.eq("business_id", businessId).eq("id", conversationId)`, `.select("id")`, returns `data.length > 0` — same no-existence-leak, boolean-return contract as `lib/leads.ts`'s `updateLeadStatus()`. Do not also touch `needs_attention` here (out of scope for this stage — see "Out of scope").

4. **`lib/conversations.ts`: `flagConversationNeedsAttention`.** New function:
   ```ts
   export async function flagConversationNeedsAttention(
     supabase: SupabaseClient,
     businessId: string,
     conversationId: string,
   ): Promise<void>
   ```
   Called only from `app/api/chat/route.ts` with the service-role client. Sets `needs_attention = true`, scoped by `.eq("business_id", businessId).eq("id", conversationId)`. Throw `AppError` on a real DB error (matching this file's existing convention); do not throw on "zero rows affected" (should not happen on this path, since the conversation was just loaded/created in the same request, but is not itself a failure worth surfacing to the prospect if it somehow did).

5. **`app/api/chat/route.ts`: the AI-pause guard.** After the conversation is resolved (existing `getConversationForBusiness`/`createConversation` call) and the conversation-scoped rate limit passes, and **before** `listRecentMessages`/`askSalesEmployee` run:
   - Persist the prospect's message exactly as today (`createMessage(..., "user", message)`) — this must still happen regardless of `control`, so a human reviewing the conversation sees every prospect message.
   - If `conversation.control === "human"`, return `withCors(jsonSuccess({ conversationId: conversation.id, answer: HUMAN_CONTROL_MESSAGE, escalate: false }))` **without calling `askSalesEmployee()` and without writing an `assistant`-role message row.** (Not persisting this canned string is deliberate — see Decision 3 below.)
   - Define `const HUMAN_CONTROL_MESSAGE = "Thanks for your message — a member of our team has this conversation and will reply here shortly."` as a module-level constant in the route file, not sourced from the model.
   - Gate the branch on `conversation.control === "human"` to skip the AI, not on `!== "ai"` — concretely: `if (conversation.control === "human") { ...skip AI... } else { ...existing AI flow... }`. This is the literal form to implement; do not invent a third branch. (The `control` column's `not null default 'ai'` constraint means only `"ai"`/`"human"` can ever appear, so this distinction is about which literal to check, not about handling an unexpected value.)
   - When `conversation.control === "ai"` and the AI response comes back with `response.escalate === true`, call `flagConversationNeedsAttention(supabase, business.businessId, conversation.id)` after persisting the assistant message and before returning the response. A failure in this call must not fail the whole request (the prospect still needs their answer) — wrap it so a thrown `AppError` here is logged (`logAndGetUserMessage` or equivalent) but does not change the response sent to the prospect.

6. **New Server Action, `app/(dashboard)/dashboard/conversations/actions.ts`.** `"use server"`. Zod schema `{ id: z.string().uuid(), control: z.enum(["ai", "human"]) }`. `requireBusinessContext()` (any member — D7 precedent, per `PRODUCT.md` §3's explicit "business member ... can take over conversations"). Calls `setConversationControl()` with a `createServerSupabaseClient()` instance. Mirrors `updateLeadStatusAction`'s shape exactly: a typed `{ error?: string; success?: boolean }` return, `revalidatePath` on the conversation detail page (`/dashboard/conversations/${id}`) on success, a "no longer exists" message when the update affects zero rows.

7. **New client component, `app/(dashboard)/dashboard/conversations/_components/control-toggle.tsx`.** `"use client"`, `useActionState`, mirrors `status-select.tsx`'s structure. Takes `conversationId` and the current `control` value as props. Renders the current state as text ("AI-handled" / "Human-controlled") and one button: "Take over this conversation" when `control === "ai"`, "Hand back to AI" when `control === "human"` — a single form submitting the target state as a hidden input, not a dropdown (unlike `status-select.tsx`'s 4-way select, this is a binary toggle, so a button reads more clearly than a select).

8. **`app/(dashboard)/dashboard/conversations/[id]/page.tsx`.** Render the new `ControlToggle` near the top of the page (above or alongside the existing transcript), passing `conversation.control`/`conversation.id`. No other change to this page's existing rendering (transcript, lead card) in this stage.

9. **`docs/architecture.md`.** Add a short "Human handoff: control state and the AI-pause guard (Phase 15a)" subsection documenting: the two new columns, the pause-guard's exact placement in `/api/chat`, the "message always persisted, canned response never persisted" decision, and a forward pointer noting 15b owns reply delivery/polling and 15c owns the alert UI.

## Security requirements
- `docs/security.md` §1/§2: `control`/`needs_attention` writes are always tenant-scoped (`.eq("business_id", ...)`), and the dashboard write path is gated by `requireBusinessContext()`, never a client-supplied `businessId`.
- `docs/security.md` §8: `control` is never set from AI output. `askSalesEmployee()`'s `escalate` field continues to be treated as untrusted/display-only (it only ever triggers a `needs_attention` flag write, never a `control` change) — a human must always take the explicit dashboard action to actually take control away from the AI. This is a deliberate, security-relevant choice: an untrusted model signal must never be able to silently disable itself or hand control to an unverified path.
- `docs/security.md` §7: the new Server Action's input is Zod-validated (`id`, `control` enum) before use.
- RLS: the new `update` policy is business-match only, same shape as every existing policy on this table — no role check inside RLS (authorization beyond tenant match, if any is ever wanted, stays an application-layer concern per D7's existing precedent).
- The `needs_attention` write path is service-role only (no `authenticated` grant on that column) — a dashboard user cannot set or clear it directly in this stage, by design (15c owns that surface).

## Error handling
- `getConversationForBusiness` returning `null` for a bad/cross-tenant `conversationId` is unchanged — still a generic `400`, before the new guard is ever reached.
- A DB failure inside `setConversationControl` surfaces as the existing generic Server Action error message (`logAndGetUserMessage`), never a raw Postgres error.
- A DB failure inside `flagConversationNeedsAttention` must not fail the prospect's request — log and continue, per Implementation Requirement 5.
- The `HUMAN_CONTROL_MESSAGE` path returns a normal `200` with `jsonSuccess` — this is not an error case, it's the intended human-control response contract.

## Acceptance criteria
- [ ] Migration applies cleanly; `authenticated` can update `conversations.control` but not `conversations.needs_attention`, confirmed via `has_column_privilege`.
- [ ] A conversation with `control = "human"` never triggers a call to `askSalesEmployee()` — confirmed by direct test, not inspection (see below).
- [ ] A conversation with `control = "human"` still persists the prospect's message.
- [ ] A conversation with `control = "human"` does not write a new `assistant`-role message row for the canned acknowledgment.
- [ ] A conversation with `control = "ai"` behaves exactly as before this stage (no regression), except that an `escalate: true` turn now also sets `needs_attention = true`.
- [ ] The dashboard conversation detail page shows the current control state and a working take-over/hand-back toggle, tenant-scoped (cross-tenant attempt affects zero rows).
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass.

## Automated checks
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npm test` — still no real test suite exists project-wide (standing gap since Phase 3); not introduced in this stage.

## Manual testing steps
1. Apply the migration; verify via `npx supabase db query --linked` that `authenticated` has `UPDATE` on `control` and not on `needs_attention`, and that `anon` has neither.
2. Start a fresh widget conversation (real widget key), send one message — confirm normal AI-answered behavior is unchanged (regression check).
3. On the dashboard conversation detail page for that conversation, click "Take over this conversation." Confirm the page shows "Human-controlled" after the action.
4. From the widget, send another message on the same `conversationId`. Confirm: the response is the static `HUMAN_CONTROL_MESSAGE`, not an AI-generated answer; server logs confirm `askSalesEmployee()` was not invoked (add a temporary log line or confirm via the absence of a Gemini call, then remove any throwaway diagnostics); the prospect's message is visible in the dashboard transcript on refresh; no new `assistant`-role row was written for the canned message.
5. Click "Hand back to AI." Send another widget message on the same conversation — confirm normal AI-answered behavior resumes.
6. Trigger a real escalation (e.g. "I want to speak to a person") on an `ai`-controlled conversation with real knowledge (so the tool-calling/structured-output path actually runs). Confirm `needs_attention` becomes `true` on that conversation row (checked directly via `npx supabase db query --linked`, since no UI surfaces it yet).
7. Cross-tenant check: authenticated as Business B, attempt to submit the take-over action with Business A's `conversationId` (direct Server-Action-bypass style, same method as prior phases' cross-tenant Server Action checks). Confirm zero rows change on Business A's conversation and the action reports "no longer exists" rather than succeeding.
8. Confirm the existing conversations list/detail pages show no visual regression, and that the Leads page / lead-capture flow is unaffected (regression spot check).

## Out of scope
- Any live/polling delivery mechanism for staff replies reaching the prospect — Phase 15b.
- Staff sending a reply from the dashboard at all — no UI, no Server Action, no new `messages` role — Phase 15b (which will also decide how a staff reply is represented in `messages`, e.g. a new role distinct from `user`/`assistant`).
- The dashboard visual badge/sound alert for `needs_attention` — Phase 15c.
- Any "dismiss"/"clear attention" dashboard action — Phase 15c, since it owns the attention-flag UI end to end.
- WebSocket/SSE infrastructure — deliberately rejected for this whole phase, see "Live mechanism decision" above.
- Any change to `messages.role`'s check constraint or grants — untouched this stage.
- Recording decision D8 in `STATE.md` §4 formally — noted here as required before/at Phase 15's overall closure, not this stage's file to edit (this prompt records the reasoning; `STATE.md` gets updated at each stage's own closure per `AGENTS.md` §0.6, and D8 can be finalized once the mechanism is actually implemented in 15b rather than only decided).
