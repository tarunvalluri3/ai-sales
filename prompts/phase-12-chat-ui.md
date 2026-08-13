# Phase 12 — Chat UI

## Goal

After this is implemented, a business can drop one `<script>` tag into their own website and get a real, working AI sales chat widget: a floating launcher bubble that opens into a message panel, holds a full conversation against the already-live `/api/chat` contract (Phase 11), handles loading/typing/empty/error/rate-limit states without ever breaking, and works on both mobile and desktop. This is the actual embeddable production surface for prospects — not `/dashboard/ai-test` (an internal, authenticated debugging page, untouched by this phase) and not a new backend contract (Phase 12 consumes Phase 11's contract as-is).

## Current phase

Phase 12 — Chat UI. Confirmed from `STATE.md` §1 (Phase 11 completed and fully verified 2026-08-13) and `docs/phases.md`.

## User request

Design and implement the Phase 12 chat widget: no existing visual/brand system exists, so one is designed for this widget specifically, using the 21st.dev MCP server and the `ui-ux-pro-max`/`impeccable` skills. Build the real embeddable surface (script/mount-point a business can drop into their own site), not just an internal preview. State explicitly what the embed mechanism is and why. Follow the prompt-first workflow; stop after writing this file.

## Skills and docs read

- `STATE.md` (§1, Phase 11 and Phase 10 entries in §2, env vars in §5)
- `PRODUCT.md` (§3 actors — prospect is anonymous/untrusted, §7 AI behavior contract, §8 lead model's "AI-generated, untrusted, UI/display-only" framing, applied here to `escalate`)
- `docs/phases.md` (Phase 11 and Phase 12 sections)
- `docs/security.md` §4 (public chat widget), §7 (untrusted input), §10 (error handling)
- `docs/prompt-template.md` (this file's own contract, including the UI-specific sections)
- `docs/architecture.md` (Folder layout, Route handler conventions, Authentication section) — confirmed no documented convention yet exists for a route with an independent root layout; flagged as a verification step below, not assumed from training data, per `CLAUDE.md`'s "this is NOT the Next.js you know" warning.
- **21st.dev MCP** — confirmed connected and used this session (`mcp__21st__search`, `type: "component"`, query `"chat widget floating bubble"`). Returned reference patterns, notably `serafimcloud/agent-chat` ("Agent Elements" — scrollable message list + bottom composer, user/assistant bubbles, error states, empty state) and multiple `chat-bubble` results. Used as **visual/structural inspiration only** — no component code installed (see Decision 6 below for why).
- **`ui-ux-pro-max` skill** — present on disk at `.agents/skills/ui-ux-pro-max` (symlinked from `.claude/skills/ui-ux-pro-max`), confirmed. Its `scripts/search.py` requires a real Python interpreter; this environment only has Windows Store app-execution-alias stubs for `python`/`python3`/`py` (they print an install prompt instead of running), so **the script could not be executed**. Read `data/colors.csv`, `data/typography.csv`, `data/products.csv`, `data/ux-guidelines.csv`, `data/styles.csv` directly instead — same underlying data the script would have queried, just without its ranking/reasoning layer. Findings quoted in "Visual interpretation" below. Flagging this honestly per `AGENTS.md` §6 rather than fabricating a `--design-system` run.
- **`impeccable` skill** — present on disk at `.claude/skills/impeccable` (confirmed via directory listing, `reference/*.md` + `scripts/*`). Not invoked this session (that skill is oriented at live iterative critique/polish of an already-rendered UI; nothing is built yet to critique). Flagged for the **implementing session** to run `impeccable`'s `polish`/`critique` pass against the live widget once it's rendered in a browser, before calling this phase done.

## Existing code inspected

- `app/api/chat/route.ts` — the full Phase 11 contract. Request: `{ widgetKey: uuid, conversationId?: uuid, message: string (1–2000 chars) }`. Success response: `{ ok: true, data: { conversationId, answer, escalate } }` (via `jsonSuccess`). Error response: `{ ok: false, error: string }` with status `400`/`401`/`429`/`500`, generic messages only (`"Invalid request."`, `"Too many requests."`, or a safe provider-failure message). CORS headers (`Access-Control-Allow-Origin: *`, methods, headers) already set on every response, `OPTIONS` handler already exists. **No `businessName` field is returned anywhere in this contract.**
- `lib/widget-auth.ts` — confirms the fail-closed behavior this UI must tolerate gracefully: an unconfigured `widget_allowed_origin`, an unknown key, or an origin mismatch all produce the same generic `401`, indistinguishable from the client's perspective.
- `app/dashboard/widget-settings/page.tsx` + `widget-origin-form.tsx` — where a business gets its real `widget_key` and sets `widget_allowed_origin` today. This phase's manual testing depends on a business already configured here (from Phase 11's own verification). Confirms the existing Server Action/`useActionState` convention, Tailwind utility classes with no design tokens yet (`zinc`/`red`/`green` raw Tailwind palette, no `@theme` custom colors).
- `app/layout.tsx` + `app/globals.css` — the **only** root layout today: wraps everything in `ClerkProvider`, renders a dashboard header (sign-in link / `OrganizationSwitcher` / `UserButton`), loads `Geist`/`Geist_Mono` via `next/font/google`. `globals.css` has no brand tokens (`--color-background`/`--color-foreground` only, mapped straight from `create-next-app` boilerplate) — confirms the user's framing that no visual system exists yet. **This root layout is wrong for the widget**: a prospect must never see a "Sign in" link or load `ClerkProvider` at all.
- `package.json` — no CSS/component library beyond Tailwind v4 (`@tailwindcss/postcss`) is installed. No Radix, no shadcn, no animation library, no bundler beyond Next.js itself.
- `docs/architecture.md` §"Route handler conventions" — Zod colocated, `jsonSuccess`/`jsonError`. Not directly relevant here since this phase adds no new API route, but confirms the pattern already used correctly by `/api/chat`.

## Relevant existing architecture

- The Next.js app is the whole backend and frontend; no separate bundler/build tool has ever been introduced (`lib/chunking.ts`, the rate limiter, etc. are all hand-rolled rather than reaching for a package). This phase should follow the same discipline for the embed script rather than introducing a JS bundler just to ship a standalone widget bundle.
- `server-only` guards every `lib/` module that touches secrets or the database; nothing server-only is ever imported into a client component. The widget UI touches none of that — it only calls the already-public `/api/chat` endpoint via `fetch`.
- Every prior UI (dashboard pages) lives inside the single existing root layout. This phase is the first time a route needs to **not** share that layout at all.

## Decisions and assumptions

1. **Embed mechanism: a `<script>` tag loader (static file, not a route handler) that creates a fixed-position `<iframe>` pointed at a same-origin Next.js page, not a directly-mounted React component in the host page. The iframe is a pure rendering surface — the loader, not the iframe, performs the actual `/api/chat` calls.** Reasoning:
   - **Isolation.** A host site's own CSS/JS is completely unknown and uncontrolled. Mounting React directly into the host DOM risks CSS bleed in both directions and JS/React-version collisions with whatever the host page already runs. An iframe is a hard boundary — the same pattern Intercom/Drift/Crisp use.
   - **No new dependency.** Producing a standalone, framework-agnostic JS bundle of a React component would require introducing a bundler (esbuild/Vite/Rollup) that doesn't exist in this project. An iframe just points at a normal Next.js page — zero new packages, consistent with `AGENTS.md` §9's "install only when the phase needs it."
   - **No new env var.** The loader determines the app's own origin from `document.currentScript.src` (the URL the browser used to fetch the loader itself), so it works in any deployment (localhost, preview, production) without a hardcoded domain or a new `NEXT_PUBLIC_APP_URL`.
   - **The fetch must happen from the host page's own JavaScript context, not the iframe's.** The iframe's document is served from and same-origin with *this app*, not with whatever business's site embeds the widget. If `useWidgetChat` called `fetch("/api/chat")` from inside the iframe (as an earlier draft of this prompt had it), the browser's `Origin` header on that request would always be this app's own origin — never the host page's real domain — so `lib/widget-auth.ts`'s per-business origin check (`docs/security.md` §4) could never pass for a genuine cross-domain embed; it would only "work" if a business set `widget_allowed_origin` to this app's own domain, defeating the entire purpose of a per-business allowlist. This is also why Phase 11 set `Access-Control-Allow-Origin: *` with no credentials in the first place — that only makes sense for a call genuinely originating from the host page's own cross-origin script, which is a CORS request; a same-origin iframe fetch wouldn't trigger CORS at all, so that header would be doing nothing. **Corrected design:** `public/widget-loader.js` performs the real `fetch("/api/chat", ...)` itself, using the `widgetKey` it already has from its own `data-widget-key` attribute and the `conversationId` it receives back from the first successful response (which it retains as its own JS variable, not the iframe's). The iframe communicates with the loader purely via `postMessage`: it posts a `widget:send` request up to `window.parent` when the prospect sends a message, and the loader posts `widget:response`/`widget:error` back down once the real cross-origin `fetch` resolves. See Requirement 1 (loader) and Requirement 8 (`useWidgetChat`) for the exact message shapes.
   - Concretely: `public/widget-loader.js` (static asset, no route handler needed — Next.js serves `public/` as-is) reads its own `<script>` tag's `data-widget-key` (required) and `data-position` (optional, `"bottom-right"` default or `"bottom-left"`), creates a `position: fixed` iframe at `{origin-of-loader}/widget/embed?key=<widgetKey>&position=<position>`, sized to the collapsed launcher bubble initially, and resizes it via a `postMessage` protocol (Implementation Requirement 4) as the panel opens/closes. The `key` query param on the iframe URL is retained (it is not a secret — `docs/security.md` §4) for a stable, business-attributable embed-page URL, but it is **not** what authorizes the real API call — the loader's own in-memory copy of the key is what's actually sent to `/api/chat`.
2. **The embed page (`app/widget/embed/page.tsx`) needs its own independent root layout — no `ClerkProvider`, no dashboard header, no shared `<html>`/`<body>` with `app/layout.tsx`.** Next.js App Router supports multiple root layouts by placing divergent branches in top-level route groups, each defining its own `<html>`/`<body>`. **The implementing session must verify the exact current mechanism against the installed `node_modules/next/dist/docs/` before building this** — per `CLAUDE.md`'s standing instruction not to assume Next.js conventions from training data, since this project pins Next.js 16 and prior phases have already hit real breaking-change surprises (`proxy.ts` vs `middleware.ts`, `auth.protect()` behavior). Route shape: existing dashboard tree moves under `app/(dashboard)/...` if needed to cleanly separate root layouts, or the widget route is isolated instead — whichever the verified Next.js 16 mechanism actually requires. This is the single largest technical risk in this prompt; flagged explicitly rather than guessed at.
3. **No `businessName` personalization; the greeting is generic.** The `/api/chat` response contract has no `businessName` field. Adding one would be a backend contract change, which conflicts with `docs/phases.md`'s framing of Phase 12 as consuming the established API contract, not extending it. The initial greeting bubble is static client-side copy ("Hi! Ask me anything and I'll do my best to help." or equivalent), not fetched from the server. Flagged as a real limitation, not silently worked around — see "Out of scope."
4. **No conversation persistence across a page reload.** The client accumulates the visible transcript in React state for the lifetime of the iframe (i.e., for as long as the prospect stays on the host page without a full reload). `conversationId` from the first response is reused for subsequent turns within that session so the *server-side* AI context carries forward correctly, but nothing is written to `localStorage`/`sessionStorage` to redisplay history after a reload. Reasoning: redisplaying prior history after a reload needs a `GET` endpoint that doesn't exist in Phase 11's contract (its own "Out of scope" explicitly deferred this), and adding one here would again be a backend change beyond "consuming the established contract." The Phase 12 exit criterion ("hold a full conversation... including through an API failure") is about resilience within a session, not reload persistence — satisfied without this.
5. **Visual system, chosen from `ui-ux-pro-max`'s data (see "Visual interpretation" below) rather than invented freehand**, since the user asked for a real design pass, not a default. Light mode only for v1 — no dark-mode variant, since the widget renders inside a neutral iframe regardless of the host page's own theme and no product requirement asks for it. Flagged as a scope limitation, not an oversight.
6. **No new npm dependency for UI components.** The 21st.dev search results (`serafimcloud/agent-chat`, `jakobhoeg/chat-bubble`, etc.) are shadcn-registry components — installing one pulls in Radix primitives, `class-variance-authority`, `tailwind-merge`, etc., none of which are in `package.json` today, for what amounts to ~6 small, fully custom-styled components (launcher button, panel, header, message bubble, composer, typing indicator). `AGENTS.md` §9 says to choose the smallest option that fits; hand-building these in Tailwind, using the 21st results only as structural/visual reference, is smaller than adding a dependency chain neither previously needed nor requested. If a future phase wants a broader shadcn adoption across the dashboard, that's a separate, larger decision — not implied by this one.
7. **The `escalate` flag is rendered as passive, non-interactive text guidance only** — a small banner under the AI's message suggesting the prospect leave contact info, no new form/submission UI. Consistent with `PRODUCT.md` §8's framing of AI-generated signals (there, `qualification`; here, `escalate`) as untrusted/display-only, and with Phase 11's own explicit deferral of any lead-capture trigger from the widget (still an open, unscheduled decision — not this phase's job to invent).
8. **Rate-limit (`429`) and provider-failure (`500`) responses get an inline retry affordance on the specific failed message**, not a full-panel error state — the rest of the conversation stays visible and usable. A `401` on the very first request of a session (misconfigured widget key/origin) shows a quiet, generic panel-level message ("This chat isn't available right now.") rather than exposing which check failed, matching `docs/security.md` §10's "no internal detail leaks" applied to the UI layer too. The launcher bubble itself always renders regardless of `401` risk — it's inert chrome with no security-sensitive content, and hiding it retroactively after a prospect already opened it would be a worse experience than a clear inline message.
9. **Position is configurable (`data-position` = bottom-right default, or bottom-left) but nothing else is** — no per-business color/theming override in v1. No product requirement asks for it, and it would meaningfully expand this prompt's scope; flagged in "Out of scope."

## Open decisions this depends on

None outstanding. D4 (widget identity mechanism) was already resolved in Phase 11.

## Dependencies / packages required

None. `next/font/google` (already used by `app/layout.tsx`) covers the new font. No bundler, no component library, no animation library — confirmed against `package.json` (see "Existing code inspected").

## Files likely to change

**New, static:**
- `public/widget-loader.js` — the embed script (vanilla JS, no build step, no framework).

**New, app routes (exact paths depend on Decision 2's verified root-layout mechanism):**
- `app/widget/embed/page.tsx` (or the equivalent path under whatever route-group structure Next.js 16 actually requires) — the iframe's content page. Reads `key`/`position` from the query string, renders the widget client component tree.
- A new, independent root layout for that branch (own `<html>`/`<body>`, no `ClerkProvider`, no dashboard header).
- Client components under e.g. `app/widget/embed/_components/`: `widget-app.tsx`, `launcher-button.tsx`, `panel.tsx`, `panel-header.tsx`, `message-list.tsx`, `message-bubble.tsx`, `typing-indicator.tsx`, `composer.tsx`, `escalation-banner.tsx`.
- `app/widget/embed/_lib/use-widget-chat.ts` (or similar) — the client-side hook owning transcript state and in-flight/error state. It does **not** call `fetch` — it posts `widget:send` to `window.parent` and resolves/rejects the pending message when a matching `widget:response`/`widget:error` arrives (see Requirement 8). No server code, no secrets — this is a plain client-side data hook, not a `lib/` server module.
- `app/widget/embed/_lib/post-message.ts` — the small, shared postMessage protocol helpers used by both the embed page and `public/widget-loader.js` (types/constants only on the page side; the loader itself stays a plain `.js` file and cannot import TS, so its copy of the protocol constants — including the `widget:send`/`widget:response`/`widget:error` message shapes — is duplicated deliberately, not shared via import).

**Possibly moved (only if Decision 2's verified mechanism requires it):**
- Existing `app/layout.tsx`, `app/page.tsx`, `app/dashboard/**`, `app/sign-in/**`, `app/sign-up/**`, `app/session-tasks/**`, `app/onboarding/**` into a route group (e.g. `app/(dashboard)/...`) so they keep their current root layout unchanged in behavior, only in file location. **No behavior change to any of these pages is in scope** — this would be a pure file move if it turns out to be necessary, verified by `npm run build`'s route manifest looking identical afterward.

**Docs:**
- `docs/architecture.md` — new "Public chat widget UI (Phase 12)" subsection documenting the iframe/postMessage embed mechanism and the root-layout split, once the implementing session has confirmed the exact Next.js 16 mechanism used.

## Database changes

None. This phase adds no table, column, migration, or query.

## Server / client boundaries

- `public/widget-loader.js` runs in the **host page's** JavaScript context — third-party, uncontrolled, and genuinely cross-origin from this app in every real embed. It must never receive or handle any secret; it only ever sees the widget key (already public by design, per `docs/security.md` §4). It is also the component that actually calls `fetch("/api/chat")` — deliberately, since that is the only JS context whose `Origin` header reflects the host page's real domain, which is what `lib/widget-auth.ts`'s origin check depends on (see Decision 1).
- `app/widget/embed/page.tsx` and its client components run inside the sandboxed iframe, same-origin with the rest of this app, but must not import any `server-only` `lib/` module, must not call `requireBusinessContext()`/Clerk, and must not render the dashboard layout/header. They never call `fetch("/api/chat")` directly — all data access is mediated through `postMessage` to/from `window.parent` (the loader), which is the one actually holding the public contract's request/response cycle.
- No new secret, no new env var.

## Implementation requirements

1. **`public/widget-loader.js`** (vanilla JS, no TypeScript, no build step):
   - Locate its own `<script>` tag via `document.currentScript` (fallback: the last `<script>` matching its own filename, for older browsers/edge cases where `currentScript` is `null` mid-execution — document this fallback in a comment).
   - Read `data-widget-key` (required — if missing, `console.error` and do nothing further) and `data-position` (optional, default `"bottom-right"`).
   - Derive the app origin from the script's own `src`.
   - Create a `<iframe>`: `src="{origin}/widget/embed?key={widgetKey}&position={position}"`, `style.position = "fixed"`, `border: "none"`, initial size matching the collapsed launcher (e.g. `84px` square) at the configured corner with an `16–24px` margin, high `z-index`, `title="Chat widget"` for accessibility, appended to `document.body`.
   - Owns a single in-memory `conversationId` variable (`null` until the first successful response), since the loader — not the iframe — is the thing making the real requests across the conversation's lifetime.
   - Add a `window.addEventListener("message", ...)` handler that **validates `event.origin === {the app's own derived origin}`** and `event.source === iframe.contentWindow` before acting on anything. Handles four message types from the iframe:
     - `{ type: "widget:resize", width, height }` → updates the iframe's `style.width`/`style.height` (and, on narrow viewports, repositions to a full-screen overlay — see Requirement 4).
     - `{ type: "widget:send", requestId, text }` → performs `fetch("{origin}/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ widgetKey, conversationId: conversationId ?? undefined, message: text }) })` from the loader's own (host-page) execution context, so the request's `Origin` header is the host page's genuine origin — this is the actual fix for the origin-check bug described in Decision 1. On a successful `200` response, stores `data.conversationId` into the loader's `conversationId` variable and posts `{ type: "widget:response", requestId, conversationId, answer, escalate }` back to the iframe. On a non-`200` response or a thrown `fetch` error, posts `{ type: "widget:error", requestId, kind }` back, where `kind` is `"unauthorized"` (`401`), `"rate_limited"` (`429`), or `"failure"` (`400`/`500`/network error) — collapsing the server's specific status codes into the three UI-relevant categories from the "Error handling" table, never forwarding the raw response body/status to the iframe beyond that.
   - Also forwards viewport size to the iframe on load and on a throttled `window resize` listener (`{ type: "widget:viewport", width, height }`), via `iframe.contentWindow.postMessage(...)`, so the embed page can decide its own responsive breakpoint without being able to read the parent window directly (cross-origin iframes cannot).
2. **Root layout split** (Decision 2): before writing any embed-page code, read the relevant Next.js 16 doc under `node_modules/next/dist/docs/` for multiple/independent root layouts and route groups, confirm the exact supported shape, then implement it. Do not assume the pre-16 App Router pattern still applies verbatim.
3. **`app/widget/embed/page.tsx`**: Server Component reading `key`/`position` from `searchParams`, rendering the client `WidgetApp` with them as props. No Clerk, no `server-only` imports.
4. **`WidgetApp` (client)**: owns `isOpen` boolean state.
   - Renders `LauncherButton` always; renders `Panel` only when `isOpen`.
   - On mount and on `isOpen` change, posts `{ type: "widget:resize", width, height }` to `window.parent` with the target size: collapsed → `84×84`; open desktop (`viewport width ≥ 480`, from the last `widget:viewport` message received) → fixed panel, e.g. `380×600` (capped to not exceed the reported viewport height minus margin); open narrow (`< 480`) → full viewport (`width`/`height` from the last `widget:viewport` message), i.e. the panel becomes full-screen on small screens.
   - Listens for `widget:viewport` messages from `window.parent` (with an origin check — reject anything not from `window.parent`) to know current host viewport size for the breakpoint decision above.
5. **`LauncherButton`**: a real `<button aria-label="Open chat">` (or `"Close chat"` when open), circular, brand-primary background, a simple inline SVG chat-bubble/message icon (no icon library — hand-authored SVG, consistent with "no new dependency"), toggles `isOpen`. Minimum hit target `56×56px` (exceeds the 44×44 minimum from the accessibility guideline used in "Visual interpretation").
6. **`Panel`**: header + scrollable message list + composer, in a `role="dialog" aria-label="Chat"` container. `Escape` key closes the panel and returns focus to `LauncherButton`. Focus moves to the composer's `<textarea>` when the panel opens.
7. **`PanelHeader`**: static generic title ("Chat with us" or equivalent — no business name, per Decision 3), a close button (`aria-label="Close chat"`).
8. **`useWidgetChat` hook**: owns `messages: Array<{ id, role: "user" | "assistant"; content: string; status?: "sending" | "error" }>`, a local `conversationId: string | null` mirror (informational/display only — the loader holds the authoritative copy used for the actual request, per Decision 1), `isAwaitingResponse: boolean`, `panelError: string | null` (for the first-request `401` case), and a `Map<requestId, resolver>` of in-flight sends. Exposes `sendMessage(text: string)`:
   - Client-side guard mirroring the server's bound: trims, rejects empty, caps at 2000 chars (defensive only — the server is still the real enforcement, per `docs/security.md` §7).
   - Optimistically appends the user message and a `TypingIndicator` placeholder for the assistant turn.
   - Generates a `requestId` (e.g. `crypto.randomUUID()`) and posts `{ type: "widget:send", requestId, text }` to `window.parent` — it does **not** call `fetch` itself (Decision 1/Requirement 1: only the loader, in the host page's own context, performs the real cross-origin request).
   - A `window.addEventListener("message", ...)` handler (validating `event.origin`/`event.source === window.parent`, same as the loader's own check) resolves the pending `requestId` when `widget:response` or `widget:error` arrives:
     - `widget:response`: updates the local `conversationId` mirror, replaces the typing placeholder with the real assistant message, renders `EscalationBanner` under it when `escalate === true`.
     - `widget:error` with `kind: "unauthorized"` **and no prior successful message in this session**: sets `panelError` (Decision 8's quiet panel-level message), does not add an error bubble to the transcript.
     - `widget:error` with `kind: "rate_limited"`: marks the just-sent user message `status: "error"` with retry copy "Too many messages — please wait a moment and try again," re-enables the composer after a short client-side cooldown (e.g. 5s, cosmetic only — the real limit is server-enforced).
     - `widget:error` with `kind: "failure"`: marks the message `status: "error"` with a retry button; retry re-sends the exact same `text` through the same `sendMessage` path (a new `requestId`, same `text`).
   - A request with no matching response/error within a reasonable timeout (e.g. 30s — the loader's own `fetch` should already surface a network error well before this) is treated as `kind: "failure"`, so a dropped `postMessage` or a hung request can't leave the UI stuck in "sending" forever.
9. **`MessageBubble`**: right-aligned, primary-colored for `role: "user"`; left-aligned, neutral for `role: "assistant"`; an `"error"` status variant renders the failed user bubble with a visible retry affordance instead of pretending it sent successfully.
10. **`TypingIndicator`**: three animated dots, respects `prefers-reduced-motion` (falls back to a static "..." or a subtle opacity pulse with animation disabled).
11. **`Composer`**: `<textarea>` (auto-grow up to a max height, not a single-line `<input>`, since messages can be up to 2000 chars) + send `<button aria-label="Send message">`, `Enter` sends (`Shift+Enter` inserts a newline), disabled while `isAwaitingResponse` or during the 429 cooldown, a subtle character counter appears only in the last ~200 characters approaching the 2000 cap (progressive disclosure, not shown by default).
12. **`EscalationBanner`**: shown once, directly under the specific assistant message whose response had `escalate: true`. Static copy inviting the prospect to share contact info in the chat — no new input field, no new submission path (Decision 7).
13. **Message list**: wrapped in an `aria-live="polite"` region so new assistant messages are announced to screen readers without interrupting typing; auto-scrolls to the latest message on new content.
14. **`app/widget/embed/page.tsx` sets a `noindex` directive** — either via `generateMetadata`'s `robots: { index: false, follow: false }` or an explicit `X-Robots-Tag: noindex, nofollow` response header. This is a real, crawlable page that will carry live (non-secret, but not meant to be indexed/cached) widget keys in its query string across every business using the widget — no reason to let search engines index or cache those URLs.

## Security requirements

- `docs/security.md` §4: the widget key is the only identifier ever sent; nothing resembling a `business_id` is ever read from the URL, `postMessage`, or any client-side state and sent to the server. `business_id` continues to come only from the server-side widget-key resolution already implemented in Phase 11 — this phase does not touch that.
- `docs/security.md` §7: the client-side 2000-char/non-empty check on `sendMessage` is defense-in-depth only; the server's own Zod validation (Phase 11, unchanged) remains the real boundary.
- `docs/security.md` §10: the `401`/`429`/`500` UI copy is generic and does not distinguish *why* a request failed (unknown key vs. origin mismatch vs. unconfigured origin all read the same to the prospect), matching what the API already returns.
- Every `postMessage` listener (in both the loader and the embed page) validates `event.origin`/`event.source` before acting on the message — for `widget:resize`/`widget:viewport` this is layout data only, but for `widget:send`/`widget:response`/`widget:error` it gates which script can trigger a real API call or inject a fabricated response into the transcript, so the check is load-bearing here, not just defense-in-depth.
- **The `/api/chat` call must be made by `public/widget-loader.js`, in the host page's own execution context, never by `app/widget/embed/page.tsx` or anything running inside the iframe.** This is the specific fix in this revision: the fetch must carry the host page's genuine `Origin` header for `lib/widget-auth.ts`'s per-business origin check (`docs/security.md` §4) to mean anything for a real cross-domain embed. Confirm by inspection that no `fetch`/`XMLHttpRequest` call to `/api/chat` exists anywhere under `app/widget/embed/`.
- No secret, credential, or `SUPABASE_SECRET_KEY`/`GEMINI_API_KEY`-adjacent value is ever referenced anywhere in `public/widget-loader.js` or the embed page — confirm by inspection, since anything in `public/` is served verbatim to anyone.
- `app/widget/embed/page.tsx` is `noindex`ed (Requirement 14) — not a security boundary (the widget key isn't secret), but keeps live per-business widget-key URLs out of search indexes/caches as good hygiene.

## Error handling

| Failure | User-facing behavior |
|---|---|
| First request in a session returns `401` (misconfigured widget key/origin) | Panel-level quiet message: "This chat isn't available right now." No further composer interaction offered beyond closing the panel. |
| A later request returns `401` mid-conversation (should not normally happen once already resolved once, but handled the same way as a safety net) | Same panel-level message. |
| `400` (malformed body / stale `conversationId`) | Treated as a `500`-equivalent inline retry on that message — this should not occur under normal UI usage (the client always sends a well-formed body and only ever reuses a `conversationId` it received from this same session), but must fail safely, not silently, if it ever does. |
| `429` (any of the three rate-limit scopes) | Inline retry affordance on the specific message, cooldown-disabled composer, no panel-level interruption. |
| `500` (Gemini/provider failure, or a persistence failure) | Inline retry affordance on the specific message; prior messages in the transcript remain visible and intact. |
| `fetch` throws (offline/network error) | Same inline retry affordance, with connection-specific copy ("Check your connection and try again."). |
| `postMessage` received from an unexpected origin/source | Silently ignored, not processed. |

## Acceptance criteria

- [ ] A static HTML test page with only `<script src=".../widget-loader.js" data-widget-key="...">` renders a floating launcher bubble, no other visible change to the host page.
- [ ] Clicking the bubble opens the panel; a generic greeting is visible; the composer is focused.
- [ ] Sending a message shows a typing indicator, then the real grounded answer from `askSalesEmployee()` (same pipeline as Phase 11, unchanged).
- [ ] **The test page is served from a genuinely different origin than this app (different port counts) with `widget_allowed_origin` set to that real origin, and a full conversation succeeds** — not just the same-origin case, which alone cannot prove the origin check works correctly against a real cross-domain embed (see the manual testing steps below for why this is a separate, required case).
- [ ] No `fetch`/`XMLHttpRequest` call to `/api/chat` exists anywhere under `app/widget/embed/` — confirmed by inspection; the only caller of `/api/chat` in this phase's new code is `public/widget-loader.js`.
- [ ] `app/widget/embed/page.tsx` responses carry a `noindex`/`X-Robots-Tag: noindex, nofollow` directive.
- [ ] A second message in the same session continues the same `conversationId` and reflects multi-turn context (same manual-test shape as Phase 11's own step 5).
- [ ] Closing and reopening the panel within the same page load preserves the visible transcript; a full page reload starts a fresh conversation (per Decision 4 — confirm this is the deliberate behavior, not a bug).
- [ ] On mobile viewport width (e.g. devtools responsive mode at ≤480px), the open panel becomes a full-screen overlay with a visible close affordance; the collapsed bubble stays a fixed, thumb-reachable corner button.
- [ ] A wrong/garbage `data-widget-key` (or a key from a business with no configured `widget_allowed_origin`) results in the panel-level quiet unavailable-message on first send, not a broken/blank panel or an unhandled exception in the console.
- [ ] Triggering the IP rate limit (per Phase 11's existing 30/5min limit) surfaces the inline retry state on the specific message, without crashing the panel or losing the rest of the transcript.
- [ ] A simulated `500` (e.g. temporarily an invalid `GEMINI_API_KEY` in `.env.local`, restored after the test) surfaces the inline retry state, and retry succeeds once the underlying cause is fixed.
- [ ] Keyboard-only: Tab reaches the launcher, Enter/Space opens it, Tab reaches composer and send button, Escape closes the panel and returns focus to the launcher.
- [ ] A screen reader (VoiceOver, NVDA, or the OS default available in the test environment) announces new assistant messages without needing to manually navigate to them.
- [ ] `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass, and the build's route manifest shows no unintended change to any existing dashboard route path.
- [ ] `impeccable`'s live critique/polish pass has been run against the rendered widget (per the flag in "Skills and docs read") and any findings addressed or explicitly deferred with reasoning.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- No new tenant-isolation test is required — this phase adds no table, column, or business-owned data access (`AGENTS.md` §7's tenant-isolation-test requirement is scoped to phases that add business-owned data access; this one only consumes the already-isolated `/api/chat` endpoint).

## Manual testing steps

1. Confirm a test business already has `widget_key` configured (reuse Phase 11's manual-testing business, or set one up at `/dashboard/widget-settings`).
2. Create a plain static HTML file served from `next dev`'s own origin (e.g. `http://localhost:3000`'s own static handling, or a second local static server bound to the *same* port/origin) containing only `<script src="http://localhost:3000/widget-loader.js" data-widget-key="<the real key>"></script>` before `</body>`, with `widget_allowed_origin` set to that same origin. Open it in a desktop browser. Confirm the bubble appears, opens/closes correctly, and a real conversation works end-to-end (send → typing indicator → grounded answer), including a follow-up message that only makes sense with the first turn's context. **This same-origin case alone does not prove the origin check works** — the iframe and the host page share an origin here, masking the bug this revision fixes — so it only confirms basic wiring, not the real embed scenario.
3. **The real cross-origin case.** Serve the *same* test HTML file from a genuinely different origin — e.g. a second static server on a different port, such as `python -m http.server 8080` from the folder containing the test file, giving `http://localhost:8080`. Set `widget_allowed_origin` to `http://localhost:8080` (not `:3000`). Load the test page from `http://localhost:8080` in a browser and confirm a full conversation succeeds end-to-end. **This is the case that actually exercises `lib/widget-auth.ts`'s origin check against a genuinely different `Origin` header** — the case the same-origin test in step 2 cannot cover, and the specific scenario this revision's fix (fetch from the loader, not the iframe) makes work correctly.
4. Resize the browser (or devtools responsive mode) to a mobile width, from either test page. Confirm the panel goes full-screen when open and the collapsed bubble stays correctly positioned.
5. Replace `data-widget-key` with a random UUID (either test page). Reload, open the panel, send a message. Confirm the quiet unavailable message, not a crash or blank state.
6. Using the step-2 (`:3000`) test page while `widget_allowed_origin` is still set to `:8080` (i.e. a real mismatch), confirm the same quiet-unavailable behavior (the origin check still fails closed exactly as Phase 11 already verified server-side — this step confirms the UI degrades gracefully on top of that, not that the check itself works, which step 3 already proved for the success path and this step proves for the failure path).
7. From the step-3 (`:8080`, correctly configured) test page, send messages rapidly enough to trip the IP rate limit (30/5min, from Phase 11). Confirm the inline retry state appears on the message that got `429`, the rest of the transcript stays intact, and the composer becomes usable again after the cooldown.
8. Temporarily set an invalid value for `GEMINI_API_KEY` in `.env.local`, restart `next dev`, send a message from the step-3 test page. Confirm the inline retry state (not a crash). Restore the real key, retry the same message, confirm it now succeeds.
9. Keyboard-only pass: Tab to the bubble, Enter to open, Tab through composer/send, type and send via Enter, Escape to close, confirm focus returns to the bubble.
10. Basic screen-reader pass (VoiceOver/NVDA/whatever is available): confirm the launcher's label is announced, the panel is announced as a dialog, and a new assistant reply is announced without manual navigation.
11. Inspect the embed page's response headers or rendered `<head>` and confirm the `noindex` directive is present.
12. `npm run build`; confirm the route manifest lists the new widget route(s) and shows no change to any existing dashboard route's path.

## Out of scope

- **Conversation persistence across a page reload, and any `GET` endpoint to redisplay prior history** — Decision 4; would require extending the API contract, which this phase deliberately does not do.
- **Personalized greeting using the real business name** — Decision 3; the API contract has no `businessName` field today.
- **Any new lead-capture form/submission UI, or wiring `captureLeadFromConversation()` to the widget** — still an open, unscheduled decision per Phase 11's own "Out of scope"; this phase only adds passive text guidance when `escalate: true`.
- **Dashboard conversation/message viewer** — Phase 13.
- **Human takeover of a live conversation** — Phase 15.
- **Per-business theming/color customization of the widget** — Decision 9; only launcher position is configurable in v1.
- **File/image attachments, sound or desktop notifications, typing-while-composing indicators sent to the business side** — none requested, none specified anywhere in `PRODUCT.md`.
- **Multi-language/i18n UI copy** — `PRODUCT.md` §10 explicitly defers multi-language support.
- **Widget usage analytics** — Phase 18.
- **Restyling `/dashboard/ai-test`, `/dashboard/widget-settings`, or any other internal/authenticated dashboard page** — explicitly out per the user's framing; those stay as-is.

---

## Visual interpretation

No existing brand/visual system exists (confirmed by inspecting `app/globals.css` — only unstyled `create-next-app` boilerplate tokens). This phase designs one for the widget specifically, grounded in `ui-ux-pro-max`'s data (read directly from its CSVs since its Python search script couldn't run in this environment — see "Skills and docs read"):

- **Product-type match**: the closest entries in `data/products.csv` are *B2B Service* ("Trust & Authority + Minimal... Credibility essential") and *AI/Chatbot Platform* ("AI-Native UI + Minimalism... Neutral + AI Purple (#6366F1)... Conversational UI. Minimal chrome."). This widget sits at the intersection: a B2B-trust surface, delivered as a minimal-chrome conversational AI interface. *Chat & Messaging App* additionally confirms the expected structural pattern: "Bubble UI (left/right alignment)... typing indicators."
- **Color**: blending the *SaaS (General)* and *Micro SaaS* palettes from `data/colors.csv` (`#2563EB`/`#6366F1` primaries, both landing in the blue-indigo trust range, and both independently corroborated by *AI/Chatbot Platform*'s own "AI Purple #6366F1" note) — chosen primary **Indigo `#4F46E5`** (between the two, reads as both "SaaS trust blue" and "AI-native purple" without committing fully to either). Full token set below.
- **Typography**: `data/typography.csv`'s "Premium Sans" pairing (SaaS/startups, "premium, modern, clean") points at DM Sans/Satoshi; "Minimal Swiss" (Inter, "dashboards... enterprise apps... single font family with weight variations. Ultimate simplicity") is the better fit for a *compact floating widget* specifically, where a second display face has no room to earn its place. **Chosen: Inter**, weights 400/500/600, loaded via `next/font/google` scoped to the widget's own independent layout (Decision 2) — not shared with `app/layout.tsx`'s existing `Geist` fonts, so the dashboard is untouched.
- **Motion**: `data/ux-guidelines.csv`'s Interaction/Feedback rows (duration 150–300ms implied by the skill's priority table, success/error feedback required, no silent failures) — panel open/close and typing-indicator animation both stay in that range, both respect `prefers-reduced-motion`.

### Token set (defined only within the widget's own CSS scope, not merged into `app/globals.css`)

| Token | Value | Use |
|---|---|---|
| `--widget-primary` | `#4F46E5` | Launcher background, user bubble, send button, focus ring |
| `--widget-primary-hover` | `#4338CA` | Hover/active state on primary controls |
| `--widget-on-primary` | `#FFFFFF` | Text/icons on primary background |
| `--widget-surface` | `#FFFFFF` | Panel background |
| `--widget-assistant-bubble` | `#F1F1F7` | Assistant message background |
| `--widget-foreground` | `#1E293B` | Primary text |
| `--widget-muted` | `#64748B` | Timestamps, helper text |
| `--widget-border` | `#E2E8F0` | Panel/header borders |
| `--widget-success` | `#10B981` | Reserved (e.g. a future "online" indicator — not required by this phase's requirements, token defined for consistency if used) |
| `--widget-error` | `#DC2626` | Error bubble border/retry text |

Contrast (white text on `#4F46E5`, dark text on `#F1F1F7`/`#FFFFFF`) must be verified ≥4.5:1 during implementation (per the skill's Accessibility priority-1 rule) rather than asserted here without a tool run.

## Layout and hierarchy

- **Collapsed**: single circular launcher, fixed bottom-right (default) or bottom-left, floating above all host-page content.
- **Open, desktop (≥480px viewport)**: fixed panel, `380px` wide, up to `600px` tall (capped below viewport height), anchored to the same corner as the launcher. Header (title + close) → scrollable message list (flex-grow) → composer (fixed at bottom).
- **Open, narrow (<480px viewport)**: panel expands to fill the full viewport (via the loader's `postMessage`-driven resize), same internal header/list/composer stack, close button becomes the primary way back to the collapsed bubble.

## Typography and spacing

- Base message text: `15px`/`1.5` line-height (compact-widget convention; still clears the skill's ≥12px anti-pattern floor).
- Header title: `15px`/`600` weight.
- Timestamps/meta/char-counter: `12px`, `--widget-muted`.
- Spacing scale: `4/8/12/16/24px`, consistent with the skill's "Standard" density tier (this is a compact widget, not a spacious marketing page or a dense dashboard).
- Message bubble padding: `10px 14px`; bubble corner radius `16px` with the corner nearest the sender's avatar/edge flattened slightly (`4px`), a common bubble-UI convention noted implicitly by the *Chat & Messaging App* row's "Bubble UI (left/right alignment)."

## Components

Reused: none exist yet for this surface — this is a from-scratch widget UI, deliberately not reusing dashboard components (different layout, different audience, different trust level).

New (all hand-built Tailwind, no installed library — Decision 6): `LauncherButton`, `Panel`, `PanelHeader`, `MessageList`, `MessageBubble` (user/assistant/error variants), `TypingIndicator`, `Composer`, `EscalationBanner`. Each justified in "Implementation requirements" above; none is a thin wrapper that could instead be inlined — each has distinct state/behavior (composer has its own key handling and character-limit logic; message bubble has three visually distinct variants; etc.).

## Responsive behavior

- **Breakpoint: 480px viewport width** (reported to the embed page via the loader's `widget:viewport` postMessage, since the iframe cannot read the parent viewport directly).
- **≥480px**: fixed-size floating panel (see Layout).
- **<480px**: full-screen panel, launcher bubble unaffected (stays a small fixed corner control when collapsed).
- No intermediate tablet-specific breakpoint — a floating chat panel doesn't need one; the same "compact floating panel" layout scales fine from ~480px up to full desktop widths.

## States

- **Default (collapsed)**: launcher bubble only.
- **Loading**: `TypingIndicator` shown in place of the pending assistant bubble while a request is in flight.
- **Empty**: static generic greeting shown the first time the panel opens in a session, before any message is sent.
- **Error**: per-message inline retry (429/500/network), or a panel-level quiet message (401 on the first request) — see "Error handling" table.
- **Disabled**: composer disabled while awaiting a response or during a 429 cooldown.
- **Success**: no special toast/confirmation needed beyond the assistant's reply appearing — matches the skill's "Confirmation Messages" guideline's intent (the reply itself is the confirmation).

## Interaction behavior

- Click/tap launcher toggles the panel; `Enter`/`Space` when focused does the same.
- `Enter` in the composer sends; `Shift+Enter` inserts a newline.
- `Escape` closes the panel from anywhere inside it and returns focus to the launcher.
- Retry buttons re-send the exact original failed text, not a blank composer.
- Auto-scroll to the newest message on send/receive, but do not force-scroll if the prospect has manually scrolled up to re-read earlier messages (only auto-scroll when already at/near the bottom).

## Accessibility

- Launcher: real `<button>`, `aria-label` reflects current state ("Open chat"/"Close chat"), minimum `56×56px` hit target.
- Panel: `role="dialog"`, `aria-label="Chat"`, focus moves to the composer on open, `Escape` closes and returns focus to the launcher (a basic focus-return pattern; a full focus-trap is a nice-to-have the implementer may add but is not a listed acceptance criterion).
- Message list: `aria-live="polite"` so new assistant replies are announced without interrupting active typing.
- All interactive elements keep visible focus rings (`--widget-primary` ring) — never `outline: none` without a replacement, per the skill's explicit anti-pattern.
- Color contrast verified ≥4.5:1 for all text/background pairs in the token table above (implementation-time check).
- `prefers-reduced-motion` respected for the typing-indicator animation and panel open/close transition.
- No icon-only control without an `aria-label` (launcher, close button, send button all covered above).
