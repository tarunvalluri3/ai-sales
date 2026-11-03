# Abuse protection for the public chat

Production readiness item 3 (2026-11-03). The code is in `lib/chat-protection.ts`, `lib/abuse-limits.ts`, `lib/guardrails/config.ts` and `app/api/chat/route.ts`.

## What is enforced today

| Protection | Key(s) | Default | Mode | On counter/provider failure |
|---|---|---|---|---|
| Per visitor IP | `CHAT_IP_LIMIT` | 30 per 5 min | enforce (429) | fail closed |
| Per widget key | `CHAT_KEY_LIMIT` | 120 per 5 min | enforce (429) | fail closed |
| Per conversation | `CHAT_CONVERSATION_LIMIT` | 20 per 5 min | enforce (429) | fail closed |
| Per business (all its keys) | `CHAT_BUSINESS_LIMIT` | 300 per 5 min | enforce (429) | fail open |
| AI replies per business per UTC day, website + WhatsApp + Instagram | `GEMINI_DAILY_TURN_CAP_PER_BUSINESS` | 1,000 (0 = off) | enforce: no Gemini call, conversation flagged, "a person will follow up" notice (see below) | fail **closed** (treated as over the limit, logged, alerted) |
| AI replies per UTC day, all businesses, all channels | `GEMINI_DAILY_TURN_CAP_GLOBAL` | 5,000 (0 = off) | same | fail **closed** |
| Cloudflare Turnstile (new conversations) | `TURNSTILE_MODE`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | `off` | `log` or `enforce` (403 on a missing/invalid token) | Cloudflare unavailable: allowed and logged |

Why these defaults:
- The per-business limit (300 per 5 min) is twice the log-only `business_burst` ceiling (150). It is a backstop that only a script hitting one tenant will reach.
- The daily caps (round 3, `lib/daily-reply-limit.ts`) count AI *replies* on every channel against ONE pair of counters (`gemini_daily_business` per business, `gemini_daily_global` overall).
  - A reply is counted once, right before the model would be called, after human control, the serving check and guardrail/non-text canned replies. On WhatsApp and Instagram this is after the inbound de-duplication insert, so a webhook Meta redelivers is never counted twice.
  - 1,000 per business per day is about 3x Scale's monthly quota spread evenly (10,000 / 30 ≈ 333). A real busy day fits; a runaway script stops within a day.
  - 5,000 a day across all businesses (owner decision 2026-11-03) bounds the worst day's Gemini spend. Raise it as you add customers.
- The notice ("We're receiving a lot of messages right now ... will follow up"):
  - Website: returned as the reply to each blocked message (the visitor is waiting on that request).
  - WhatsApp / Instagram: at most once per conversation per UTC day (`gemini_cap_notice` counter, migration `20261124000100`), and only inside the 24-hour window measured from the prospect's message. If that counter can't be read, no notice is sent (never a duplicate); the conversation is still flagged.

Alerts:
- `gemini_daily_cap_reached` (error + email to `OPS_ALERT_EMAIL`) once per cap per UTC day: only the request whose atomic increment returned exactly cap + 1 sends it, so it is not repeated per message or per server.
- `gemini_daily_counter_unavailable` (error + email, throttled to once an hour per process) when the counter can't be read. Each blocked message is also logged as `gemini_daily_cap_blocked` (info).
- `turnstile_verified` is an info line on every new conversation while Turnstile is on.
- `rate_limit_exceeded` is info.

## Cloudflare Turnstile

1. In Cloudflare, go to Turnstile and add a widget.
   - **Hostname:** your app's own domain (e.g. `aipilot.waveswebstudio.in`), not each customer's. The chat widget is our page inside an iframe, and the Turnstile challenge renders inside that page.
   - **Widget mode:** Managed.
2. Set `TURNSTILE_SITE_KEY` (public; it is sent to the iframe) and `TURNSTILE_SECRET_KEY` (secret; server only).
3. Set `TURNSTILE_MODE=log`. Open a chat on a real customer site (not our own domain), then search the logs for `turnstile_verified`.
   - Expect `ok: true` and `hostname` equal to your app domain.
   - Cloudflare's docs don't say which hostname is checked for a widget inside a cross-origin iframe, so confirm this before enforcing.
4. When `ok` is consistently true for real visitors, set `TURNSTILE_MODE=enforce`.
   - An embed loaded before this change sends no token, so its first message is refused until the page is reloaded.

The token is verified only when a message starts a **new** conversation. Each token is single-use and valid for 5 minutes, and an ongoing conversation is held by the per-conversation limit.

`NEXT_PUBLIC_APP_URL` sets the expected hostname. A token whose `hostname` doesn't match is refused in `enforce` mode.

## Log-only checks, and how to switch them to enforcing

Owner decision 2026-11-03: these stay **log-only** for now. Each one records a "would have blocked" signal and never blocks.

### Abuse rate-limit scopes (`lib/abuse-limits.ts`)

| Scope | What it limits | Signal to review |
|---|---|---|
| `business_burst` | 150 AI turns per 5 min per business (40 while trialing), across channels | `rate_limit_would_exceed` with `scope: business_burst` |
| `new_conversation_ip` | 30 new conversations per hour per IP (tighter for "too fast" clients) | `rate_limit_would_exceed` with `scope: new_conversation_ip`; `bot_signal` |
| `ip_subnet` | 150 requests per 5 min per IPv4 /24 | `rate_limit_would_exceed` with `scope: ip_subnet` |

To enforce one:
1. Review a week or more of `rate_limit_would_exceed` for the scope.
   - Make sure real visitors behind shared NAT (offices, mobile carriers) wouldn't have been blocked.
   - Adjust `SCOPE_LIMITS` if needed.
2. Remove the scope from `LOG_ONLY_SCOPES` in `lib/abuse-limits.ts`.
   - The chat route already contains the enforcing branches (Stage D): `ip_subnet`/`new_conversation_ip` return 429; `business_burst` sends the fixed soft reply and flags the conversation.
3. Update the matching assertion in `scripts/run-abuse-limit-tests.mjs`. Run `npm run test:abuse-limits`, then deploy.

To roll back, put the scope back in `LOG_ONLY_SCOPES`.

### Guardrail checks (`lib/guardrails/config.ts`)

| Check | What it does when enforcing | Signal to review |
|---|---|---|
| `injection` | refuses prompt-injection attempts with the safe reply | `guardrail_events` rows (column `signal`) for injection |
| `abuse` | ends abusive conversations after repeated strikes | `guardrail_events` abuse signals |
| `output_contacts` | removes links, emails and phone numbers that appear nowhere in the turn's evidence | `guardrail_events` output-contact signals |
| `output_promise` | replaces unsupported discount, refund or guarantee promises with the safe reply | `guardrail_events` output-promise signals |

To enforce one:
1. Review its `guardrail_events` rows (in `/apache` or SQL) for false positives.
2. Change its value in `GUARDRAIL_MODES` from `"log_only"` to `"enforce"`.
3. Run `npm run test:guardrails` and `npm run test:guardrail-response`, then deploy.

The canary and verbatim-prompt-leak block already enforce.
