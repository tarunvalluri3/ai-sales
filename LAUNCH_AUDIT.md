# Waves AI Pilot: Launch Readiness Audit

**Date:** 2026-11-02 · **Commit audited:** `6bb84d5` (`main`). Application code is identical to `28c0d18`; only `STATE.md` changed since. · **Mode:** read-only. No source files were edited, no migrations run, nothing deployed, and no production service was called.

**Verification pass:** an earlier draft of this report was independently re-checked against the code. Its key citations were re-read: health check, cron, webhook error paths, WhatsApp window and templates, env key selection, onboarding and entitlement fallbacks, CORS, abuse and guardrail modes, RLS coverage, `.gitignore`, app URL, plans and the privacy page. Lint, typecheck, build and all 23 unit suites were re-run. Corrections from that pass appear in §12 (Gemini retries), §14 (privacy policy) and §C.

---

## Remediation update — 2026-11-03, branch `production-readiness` (16 commits, not merged or pushed)

The code items below were fixed on branch `production-readiness` (from `6bb84d5`). **None of it is live**: six new migrations are written but **not applied**, nothing was deployed, and no production service was called. Everything in "Still open" needs either an account/dashboard change or a product decision from you.

| Area | Before | After the branch (code) | Commit(s) |
|---|---|---|---|
| 3 Environments | Local dev + CLI → prod; `.env.example` ignored; prod Gemini key in CI | Script/test guard refuses the prod Supabase project (URL or CLI link); `APP_ENV` explicit, VPS refuses to boot without it; `.env.example` tracked and complete; CI is `APP_ENV=staging` without the prod key | `3e3316a` |
| 1/12/13 Failed replies | Silent on WhatsApp/Instagram; only timeouts handled; 6 LangChain retries | Any failure → Sentry (with error kind) + `*_reply_failed` + conversation flagged + fallback (unless the reply was already queued); `maxRetries` 1 (cap 3); recovery sweep for replies lost after the 200; WhatsApp replies after the 200 | `8cc5ea3` |
| 2 Background jobs | One daily cron, 13 sweeps in one `Promise.all` | `/api/cron/run`: per-job schedules, DB leases (no overlap), timeouts, retries, isolation, repeated-failure alert, stale-claim reaper; SLA sweep repeat-safe; `vercel.json` still daily-only | `87dbd44` |
| 7 WhatsApp | No window check, no templates, status callbacks ignored, plaintext token | Window decided at send time; approved template outside it or visible failure; Graph errors classified (no pointless retries); status callbacks recorded; staff notice; tokens encrypted (lazy migration); constant-time verify | `08dd768`, `bd7a4f1` |
| 2 Appointments | No reminders, no expiry | 24 h + 1 h reminders; pending expires at 48 h after booking or 2 h before start (≥1 h owner window for short notice); dedup ledger; business time zone; new `expired` status | `cd5f1be` |
| 9 Billing | Delete left the mandate charging | Delete records + immediately cancels the Razorpay subscription; failures retried + alerted; charges after deletion alerted; unsent invoice/credit-note emails re-sent hourly | `9bc6fb6`, `ff3c445` |
| 6 Instagram | Revocation found only when a reply failed | 6-hourly health check (token + Page subscription, self-healing re-subscribe); owner emailed once on disconnect; `docs/meta-app-review.md` | `2985d06` |
| 14 Legal | Razorpay not named | Named as a payment processor (**flagged for your review**) | `071e2c1` |
| 1 Observability | Liveness-only health; rate limits burn Sentry | `/api/health?deep=1` (503 on DB down / scheduler stopped); `/apache/jobs` scheduler + billing-cancellation panels; rate-limit logs off Sentry; tracing configurable; environment tag | `25e2030`, `da56a23` |
| 15 VPS | Spoofable client IP, no HSTS, app-URL fallback | `CLIENT_IP_SOURCE`; HSTS; startup warning without `NEXT_PUBLIC_APP_URL` (SSE buffering header and system Chromium were already handled) | `9e35cd2` |
| 5 `/apache` notes | Hard-coded USD→INR; sandbox counted | `USD_TO_INR_RATE`; rollup excludes sandbox leads/bookings | `8f94754` |
| 11 Security | Public `/dev/fragments` | Deleted | `ee11005` |
| 16 Tests | 602/603 (CRLF failure) | **All 30 unit suites pass locally** (11 new suites); 6 new pgTAP files (067–072, not run: CLI is linked to prod) | `61bb132` + each commit |

### Round 2 — 2026-11-03, same branch (9 more commits; still not merged, pushed, applied or deployed)

| Area | Before | After (code) | Commit |
|---|---|---|---|
| 4/9 Trials and plan access | Trial resettable by delete + recreate; no row or read error = free Scale; the billing step looked like a payment wall | No-card trial with a hard cap (`TRIAL_REPLY_QUOTA`, default 200) on website, WhatsApp and Instagram. One trial per org (`trial_grants`, survives deletion). No row = no paid access. A read error keeps the last known plan for 24 h, then no paid access, alerted. Onboarding step reads "free trial, no card"; pricing matches | `0b1e232`, `84ed075` |
| 7 WhatsApp plan gating | Not gated | Enforced on the server (webhook, sends, connect). Starter has no WhatsApp or Instagram; Instagram matches WhatsApp | `0b1e232` |
| 9 Admin delete | `/apache` soft-delete left the mandate charging | Soft and hard delete use the owner-delete cancel/retry/alert path. The webhook checks deletions first. The charge-after-deletion alert carries refund details; no auto-refund | `88a34be` |
| 8/11 Abuse | No Turnstile or BotID, fixed limits, no spend ceiling | Configurable limits, an enforcing per-business limit, daily Gemini turn caps, and Turnstile (off/log/enforce) inside our widget iframe. Abuse scopes and guardrails stay log-only, with docs/abuse-protection.md on how to enforce | `4f86603` |
| 3 Environments | Production ref fixed in code; local dev on prod only warned | Committed `supabase/production-project-refs.txt` protects every guard. `next dev` against prod refused (`ALLOW_DEV_AGAINST_PRODUCTION=<ref>` override) | `c179301`, `fa7e012` |
| 3 Migrations | Future-dated versions; a migration made today would be refused by `db push` | `npm run migration:new` keeps ordering; CI order check; nothing renamed | `098ebfc` |
| 7 WhatsApp onboarding | Manual token paste only | Embedded Signup v4, server-side exchange, encrypted token and PIN, "Finish setup" retry. Per-business template submission and status. Not live-tested | `07b9eaa` |
| Launch | — | `CHANNEL_WHATSAPP_ENABLED` / `CHANNEL_INSTAGRAM_ENABLED` switch each Meta channel off independently | `e8fdcb5` |

Checks: lint, typecheck, all 34 unit suites and the production build pass (secrets replaced with placeholders). pgTAP 067-075 were not run because the CLI is linked to prod. New migrations `20261121000000` to `20261124000000` are not applied. Post-appointment follow-ups and staff re-engagement templates are deferred to post-launch (STATE.md). The current handoff list is in STATE.md, round 2.

**Still open (not code, or needs your decision):** backups/PITR and a restore drill; Supabase/Vercel paid tiers or the VPS move; Razorpay live mode; separate Clerk production instance and Gemini dev key; WhatsApp templates approved in each business's WABA; Meta App Review; Sentry alert rules; post-appointment follow-ups; trial-per-org, payment-method-at-signup and "no row = Scale" fail-open (billing decisions); WhatsApp plan gating; Instagram on a plan; enforcing the log-only abuse/guardrail scopes; Turnstile/BotID; CSP; WhatsApp Embedded Signup; Gemini fallback model/circuit breaker; route-level integration tests and an E2E test. Full handoff list: STATE.md, "Production readiness" section.

---

**Ratings:** **Done** means wired up end to end and evidenced in code. **Partial** means it exists but has a gap that matters. **Missing** means it isn't there. **Can't verify** means it depends on dashboards, accounts or infrastructure outside the repo.

---

## Summary scorecard

| # | Area | Rating |
|---|---|---|
| 1 | Observability | **Partial** |
| 2 | Background jobs | **Partial** (appointment follow-ups: **Missing**) |
| 3 | Environments & operations | **Partial** |
| 4 | Onboarding gate | **Partial** |
| 5 | Admin panel `/apache` | **Done** (minor notes) |
| 6 | Instagram | **Partial**, mostly Can't verify (Meta side) |
| 7 | WhatsApp | **Partial** |
| 8 | Website channel | **Partial** |
| 9 | Billing | **Partial** (code largely Done; live mode Can't verify) |
| 10 | Data safety | **Partial** (RLS Done; backups Missing) |
| 11 | Security | **Partial** |
| 12 | Gemini reliability | **Partial** |
| 13 | Webhook reliability | **Partial** |
| 14 | Legal & data | **Partial** |
| 15 | VPS readiness | **Partial**, with several hard breakages |
| 16 | Tests | **Partial**. Lint, typecheck, build and 602/603 unit tests pass locally; no end-to-end tests |

---

## 1. Observability: **Partial**

**Done**
- Sentry is wired for node, edge and browser runtimes: `instrumentation.ts:12-22`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`. `onRequestError = Sentry.captureRequestError` captures unhandled route errors. PII scrubbing removes cookies, `authorization` and `x-widget-key` (`lib/sentry-scrub.ts:56-69`). Session replay is deliberately off.
- Structured JSON event logs: `lib/logger.ts:28-44`. Every `"error"`-level event is also sent to Sentry. `lib/errors.ts` `logAndGetUserMessage()` captures exceptions.
- Per-turn AI metrics are stored in the `ai_response_metrics` table (with stage timings) and the Gemini call ledger in `gemini_api_calls` (`lib/gemini-usage-log.ts`). Instagram also writes one `ig_reply_timing` line per turn (`app/api/meta/instagram/webhook/route.ts:332-347`, with `outcome: "error"` on failure).

**Gaps**
- **The health check is liveness only.** `app/api/health/route.ts:25-34` returns `ok` without touching Supabase, Gemini or any queue, so a dead database still reports healthy.
- **Tracing is off.** `tracesSampleRate: 0` in all three Sentry configs, so there are no distributed traces.
- **A failed agent reply on WhatsApp or Instagram leaves no trail for the business.** Neither path catches errors around `askSalesEmployee` (`app/api/meta/instagram/webhook/route.ts:444`, `app/api/webhooks/whatsapp/route.ts:251`). The exception goes to Sentry, but the prospect gets no reply and the conversation is not flagged `needs_attention`. The failure is visible in Sentry and logs only, never in the business's inbox.
- **Alerting is Sentry's default email rule plus one UptimeRobot monitor** (`docs/deployment.md` §5a). There are no explicit alert rules for dead-lettered jobs, webhook 401 spikes or Gemini error rates in code. Those rules live in the Sentry dashboard (see section D).
- **Log retention is weak.** Vercel Hobby keeps about 30 minutes of logs (STATE.md, 2026-11-02 entry), so `ig_reply_timing` and every `logEvent` line are effectively lost unless Sentry captured them.
- **Possible Sentry quota burn under abuse.** `rate_limit_exceeded` is logged at `"error"` level (`app/api/chat/route.ts` after line 196; WhatsApp and Instagram routes), so every rejected request becomes a Sentry event. Grouping helps, but a flood can still exhaust the free quota.

## 2. Background jobs: **Partial**

**What exists**
- The pattern is a claim, retry, dead-letter table queue per job type, with 5 attempts and exponential backoff from 1 minute up to 1 hour:
  - ingestion: `lib/ingestion-queue.ts:31-147`
  - outbound business webhooks: `lib/webhook-delivery.ts:20-149`
  - WhatsApp sends: `lib/whatsapp-delivery.ts:19-184`
  - Instagram sends: `lib/instagram-delivery.ts:35-39`
  - answer bank: `lib/answer-bank/generate.ts:23`
- The claims use atomic SQL functions (e.g. `claim_whatsapp_outbound_messages`). Dead-lettered rows are set to `failed` and logged at error level. `/apache/jobs` lists failed jobs (`lib/admin-jobs.ts`, `lib/admin-job-actions.ts`).
- Most work is kicked off immediately with Next's `after()` (e.g. `app/(dashboard)/dashboard/knowledge/actions.ts:36`, `lib/tools/book-appointment.ts:206`).

**Gaps**
- **The only scheduler runs once a day.** `vercel.json` has a single cron, `"0 4 * * *"`, hitting `app/api/cron/process-ingestion-queue/route.ts`. That route runs 13 sweeps in one `Promise.all` (lines 60-102). As a result:
  - The 1m/2m/4m backoff schedules never run as designed. A failed WhatsApp or Instagram send is retried at the next 04:00 UTC run, which can be up to 24 hours later and therefore outside Meta's 24-hour reply window.
  - Each run handles at most 5 ingestion jobs (`lib/ingestion-queue.ts:31`), 10 webhooks and 10 sends per channel. A backlog drains at those rates per day.
  - The **SLA escalation sweep** (`lib/sla-routing.ts`) only runs daily, so an SLA breach can go unnoticed for up to 24 hours.
  - One 60-second invocation (`maxDuration = 60`, line 24) runs all 13 jobs, including headless-browser URL refreshes. If it times out, every sweep that day is lost together.
- **Durability depends on `after()`.** Inbound WhatsApp and Instagram AI replies run inside the webhook invocation; Instagram uses `after()` at `webhook/route.ts:138`. If the instance dies after the 200, the dedup row already exists (lines 216-225), so Meta's redelivery is ignored and the reply is lost. There is no recovery sweep for "inbound stored, no reply sent".
- **Idempotency is good at ingress** (unique inbound message ids for WhatsApp and Instagram, a Razorpay event ledger, unique slot index for appointments).
- **Appointment follow-ups are Missing, as expected.** Confirmed:
  - No reminder before an appointment. No `reminder` logic touches `appointments` anywhere in `lib/` or the migrations.
  - No post-appointment follow-up.
  - No auto-expiry for `pending` bookings the owner never confirms.
  - No no-show nudge (`markAppointmentNoShow` at `lib/appointments.ts:589` is manual).
  - What exists today: an immediate owner alert and prospect acknowledgement at booking (`lib/tools/book-appointment.ts:206-238`), and a status-change notice when the owner confirms, declines or cancels (`lib/appointment-notifications.ts:56-119`).
  - Workflows can be triggered on `appointment_status_changed` (`book-appointment.ts:316-330`), but there is no time-based trigger relative to `starts_at`.

## 3. Environments & operations: **Partial**

**Done**
- **Env validation:** Zod-checked at startup (`lib/env.ts:12-79`, loaded from `instrumentation.ts:14`). It never logs values.
- **CI** (`.github/workflows/ci.yml`) runs lint, typecheck, 23 pure test suites and build, then `supabase db push` to **staging**, then the pgTAP suite against staging. `docs/deployment.md` §2c says branch protection is on.
- **Migration process:** forward-only SQL files with a manual, interactive production promotion (`docs/deployment.md` §3). Rollback is documented (§3a), and a Vercel rollback drill is recorded (§6).

**Gaps**
- **Local development points at PRODUCTION.** `.env.local` sets `NEXT_PUBLIC_SUPABASE_URL` to project `bykezt…`, the production ref per `docs/deployment.md` §1. `supabase/.temp/project-ref` is also `bykeztxvejpwfcxgsubm`, which contradicts `docs/deployment.md` §2a ("relinked to ai-sales-staging"). So `npm test`, `db push`, `npm run seed:review-demo`, `npm run credit-note` and `instagram:enable` all target production from this machine. **I did not run `npm test` for this reason.**
- **Staging and production share a Clerk application and a Gemini key** (`docs/deployment.md` §1a).
- **`.env.example` is gitignored.** `.gitignore:44` matches `.env*`, and `git ls-files` doesn't list it. Yet `docs/security.md` §5 calls it "the canonical documentation of required variables", so a fresh clone (CI, the VPS) gets no env documentation. It also omits `CATALOG_PREFETCH`, `PIPELINE_PART_B`, `CHAT_AI_DEADLINE_MS`, `CHAT_MODEL_CALL_TIMEOUT_MS` and `CHAT_TOOL_TIMEOUT_MS`, all of which the code reads.
- **CI sends a Gemini key into every PR run.** It injects `secrets.GEMINI_API_KEY` (`ci.yml:33`), apparently the production key per `docs/deployment.md` §2. `lib/env.ts` only uses that key when `VERCEL_ENV=production`, so it is unused but still exposed to every PR's workflow.
- **The staging DB is shared across PRs.** Concurrent migration PRs can race (acknowledged in `ci.yml`).
- **There is no automated production deploy gate.** Vercel's GitHub integration deploys `main` independently of whether migrations were promoted. Several recent STATE entries show a merge landing before its migration (e.g. `20261114000000` "NOT YET APPLIED" at STATE.md:79), so code and schema can drift in production.

## 4. Onboarding gate: **Partial**

**How it's enforced (server-side)**
- Operational pages use `requireLiveBusinessContext()` (`lib/business-context.ts:75-81`), which redirects to `/onboarding` unless `published_at` is set:
  - dashboard home, conversations (via `conversations/layout.tsx:34`), leads, customers, analytics, copilot, appointments, workflows, answer-bank and audit-log pages.
- Setup pages are deliberately reachable through `requireBusinessContext()`: profile, products, services, FAQs, knowledge, business hours, widget settings, billing, Instagram, WhatsApp, webhooks and notifications.
- Publishing (`lib/business.ts:332-410`) re-checks two things server-side:
  - the subscription (`entitlement.serving`, line 347)
  - the readiness report's blocking items (line 360)
- `advanceOnboarding` refuses to skip steps (`app/(dashboard)/onboarding/actions.ts:186-192`).

**Gaps and bypasses**
- **The billing step does not require billing.** It is complete when `entitlement.serving` is true (`lib/onboarding-steps.ts:99`, `plan-step.tsx:69`). Every new business automatically gets a `trialing` row (trigger at `20261025000000_razorpay_subscription_lifecycle.sql:224-243`), and a trial serves without a payment method (`lib/subscription.ts:236-252`). So **an owner can publish and reach the dashboard without choosing a plan or adding a card.** This contradicts STATE.md's recorded decision that a payment method is required at signup. It may be an intended free trial, but it doesn't match the requirement as you stated it.
- **Missing subscription rows grant the top plan.** If a business has no `subscriptions` row, or the read fails, it gets the grandfathered **Scale** entitlement, serving (`lib/subscription.ts:67`, `352-369`). Any business whose trial row wasn't created gets Scale, and so does every business during a DB blip.
- **The trial can be reset.**
  - Deleting the business (`deleteBusinessAction` → `lib/business.ts:446`) cascades away the `subscriptions` row but keeps the Clerk org. Re-onboarding inserts a new business, and the trigger grants a **fresh 14-day trial**. "One trial per organisation ever" is not enforced across delete and recreate.
  - Creating additional Clerk orgs also yields unlimited trials.
- **Publishing is one-way.** The gate is `published_at`, so once published, the dashboard stays reachable after a lapsed subscription, or after the knowledge, products and FAQs that justified publishing are deleted. The agent stops serving via `canAgentServe`, but the onboarding gate isn't re-applied. That is probably acceptable, but it isn't "enforced until complete".
- **Some setup actions are allowed before onboarding finishes.** Several setup pages are reachable pre-publish by design, including WhatsApp and Instagram connect, webhooks, and notifications. They don't expose operational data, so this isn't a leak.

## 5. Admin panel `/apache`: **Done**

- **Two-layer gate.**
  - `proxy.ts:13-27` returns a bare 404 unless `evaluatePlatformAdminAccess` passes. That check requires a Clerk user, a second factor verified recently (`fva` claim, `lib/platform-admin-rules.ts:44-47`), a row in `platform_admins` and a minimum role.
  - Every page re-checks with `requirePlatformAdmin` (2 references per page, 3 in `layout.tsx`). `apache/page.tsx` relies on the layout plus `getOverviewMetrics` in `lib/admin-metrics.ts`, which itself calls `requirePlatformAdmin`.
  - **Every exported Server Action re-checks:** 30 of 30 across `lib/admin-*-actions.ts`, `lib/feature-flag-actions.ts` and `apache/tenants/actions.ts`. Destructive actions use `requirePlatformAdminStepUp`.
- **Features:** overview, tenants (suspend, soft-delete, notes), users, billing, AI usage and cost, analytics, conversations and leads (PII masked, reveal audited), integrations health, failed jobs, support and impersonation (30-minute signed cookie), announcements, feature flags, team and settings, and an append-only admin audit log (pgTAP 058).
- **In-house analytics:** an `analytics_events` table, daily rollups via `computeDailyRollup()` in the cron and via `cron.schedule` in `20261104000000_analytics_events_and_rollups.sql:97`, and `/apache/analytics`.
- **Notes**
  - The admin client is the service-role key (`lib/supabase/admin.ts`), so any future admin read that forgets `requirePlatformAdmin` is fully privileged. Today every one checks it.
  - The USD→INR cost rate is a hard-coded constant (`lib/gemini-pricing.ts`, used at `lib/admin-ai-usage.ts:103`).
  - Analytics counts are known to include sandbox test conversations (STATE.md:5034).

## 6. Instagram: **Partial**

**Done in code**
- **Login:** Instagram API with Facebook Login is the default; Unified Login is behind `META_IG_LOGIN_MODE` (`lib/env.ts`, `lib/meta-instagram-facebook-flow.ts`).
- **OAuth:** single-use 10-minute `state` (`app/api/meta/instagram/callback/route.ts:38-63`).
- **Webhook signature:** `X-Hub-Signature-256` is verified before parsing (`app/api/meta/instagram/webhook/route.ts:112-114`), and the GET verify token is checked (lines 95-105).
- **Business resolution:** from `entry.id` only (line 190).
- **Token storage:** AES-256-GCM encrypted (`lib/token-crypto.ts:15-27`, column `access_token_encrypted`) in zero-grant tables (pgTAP 064 and 066).
- **Token lifetime:** a long-lived User token is exchanged, then Page tokens derived from it, which don't expire (`meta-instagram-facebook-flow.ts:102-125`).
- **Revocation and window:** revoked tokens are detected (`isRevokedTokenError`) and the 24-hour window is enforced before sending (`lib/instagram-delivery.ts:202`).
- **Meta callbacks:** deauthorize and data-deletion callbacks with signed-request verification (`app/api/meta/{deauthorize,data-deletion}/route.ts`, `lib/meta-signed-request.ts`).

**Gaps**
- **No token refresh code exists.** There is no `refresh_access_token` or `ig_refresh_token` anywhere. That is fine for Facebook-Login Page tokens, but if you ever switch to `unified` mode and those tokens expire, nothing renews them.
- **Instagram is on no plan.** `lib/plans.ts:98,118,139` all have `instagram: false`; access comes only through the service-role-only override `businesses.instagram_enabled`. A paying customer can't self-serve Instagram today.
- **Failed AI replies are silent.** See section 1.
- **Permissions the code needs for App Review.** These are inferred from the calls the code makes; the actual list lives in Facebook Login configuration `META_LOGIN_CONFIG_ID`:
  - `instagram_basic` and `instagram_manage_messages` (named in `lib/meta-instagram-connect-flow.ts:55`)
  - `pages_show_list` (`/me/accounts`)
  - `pages_manage_metadata` (Page `subscribed_apps`, per STATE.md:104)
  - likely `business_management`, for Pages owned through Business Manager
  - **Advanced Access** for all of them, to serve accounts other than your own

## 7. WhatsApp: **Partial**

**Done**
- **Webhook security:** HMAC-SHA256 checked with `timingSafeEqual` (`app/api/webhooks/whatsapp/route.ts:59-67`). It **fails closed** when `WHATSAPP_APP_SECRET` is unset (lines 85-90), and the GET verify token is checked (lines 71-82).
- **Dedup and rate limiting:** inbound dedup on `whatsapp_message_id` (line 146) and a per-sender rate limit.
- **Tokens:** stored in a zero-grant `whatsapp_credentials` table (`20260909000000_create_whatsapp_tables.sql:85-98`).
- **Shared pipeline:** WhatsApp uses the same AI pipeline as the widget, the suspension gate and the guardrails.

**Gaps**
- **Onboarding is manual.** The owner pastes a phone number id and a permanent system-user token (`lib/whatsapp.ts:57-160`, `connect-whatsapp-form.tsx:73`). There is no Embedded Signup.
- **The token is stored in plaintext** (`lib/whatsapp.ts:130-132`), unlike Instagram's encrypted token.
- **There is no message-template support at all.** `template` doesn't appear in any WhatsApp code path.
- **There is no 24-hour window check.**
  - Nothing in `lib/whatsapp-delivery.ts` checks the window.
  - Staff replies from the inbox, appointment notices (`lib/appointment-notifications.ts:80-93`) and daily-cron retries after 24 hours will be rejected by Meta. That happens with error 131047; the code has no handler for it.
  - Each rejected send is then retried until dead-lettered.
  - **In particular, appointment confirmations will regularly fail on WhatsApp whenever the owner confirms more than 24 hours after the prospect's last message.**
- **Status callbacks are ignored.** The route only reads `value.messages` (lines 99-115); delivered, read and failed statuses are dropped.
- **The AI reply runs inside the webhook request**, before the 200 (`handleInboundMessage`). Meta expects a fast 200; a slow Gemini turn risks Meta timing out and redelivering. Dedup makes that safe, but it is slower than the Instagram design.
- **Outbound sends are not gated on plan** (STATE.md:1530, "still not gated").

## 8. Website channel: **Partial**

**Done**
- **Embed:** an iframe at `app/(widget)/widget/embed/page.tsx` plus `public/widget-loader.js`. X-Frame-Options is deliberately not set on the widget (`next.config.ts:13-21`).
- **Request validation:** widget key plus exact origin allowlist (`lib/widget-access.ts:42-47`); Zod request schema; input sanitisation and masking (`prepareProspectMessage`).
- **Enforced rate limits:** per IP, per key and per conversation (`app/api/chat/route.ts:196`, `279`, `334`). There is also a duplicate-submit guard, a consent checkbox for contact capture, and a per-conversation write cap on tools (`lib/guardrails/write-caps.ts`).

**Gaps**
- **CORS is `Access-Control-Allow-Origin: *`** (`lib/http/widget-cors.ts:14`). The real control is the server-side `Origin`/`Referer` allowlist, but non-browser clients can forge `Origin`. With the widget key public, anyone can script requests against a tenant's quota, held back only by per-IP and per-key limits.
- **The extra abuse limits are LOG-ONLY:** `business_burst`, `new_conversation_ip` and `ip_subnet` (`lib/abuse-limits.ts:47-51`). There's no CAPTCHA, Turnstile or BotID; the bot "too fast" signal is only logged.
- **The IP key comes from `x-forwarded-for`'s first entry** (`lib/http/widget-cors.ts:54-57`). On Vercel that value is trustworthy. Behind a self-managed reverse proxy it is client-controlled, unless the proxy overwrites it. See section 15.

## 9. Billing: **Partial** (code strong; going live Can't verify)

**Done in code**
- **Subscriptions and orders:** monthly plans are Razorpay Subscriptions; annual plans are one-time Orders (`lib/razorpay.ts`, `lib/billing-checkout.ts`).
- **Webhook security:** HMAC verification fails closed without a secret (`app/api/webhooks/razorpay/route.ts`, `lib/razorpay-signature.ts`).
- **Idempotency** has two layers: an event-id ledger, plus absolute period assignment.
- **Event ordering:** out-of-order protection via `provider_event_at` (`lib/razorpay-webhook.ts:505`).
- **Renewals and failed payments:**
  - `charged`, `pending` (5-day grace anchored once), `halted`, `cancelled` and `completed` are handled.
  - The daily sweep covers grace expiry, annual reminders, trial end and stale periods (`lib/billing-lifecycle.ts`).
- **Plan changes:** upgrades are pro-rata; downgrades apply at period end.
- **Quota enforcement:** applied on every channel (`lib/usage-limit.ts`, `checkReplyQuota`), at 1k, 3k or 10k replies per plan and 200 on trial.
- **GST-inclusive pricing and invoices:**
  - Prices are GST-inclusive with a correct split (`lib/plans.ts:213-243`).
  - Invoices are gap-free, numbered per financial year and immutable (`20261026000000_gst_invoices_and_credit_notes.sql`, pgTAP 050 and 051), with supplier config `lib/invoice-config.ts`.
  - The PDF renders correctly; credit notes are issued by a CLI script.
  - Test payments use a separate `TST/` series.
- **Tests:** `test:plan-tax`, `test:razorpay` and `test:invoices` all pass (see section 16).

**Gaps**
- **Live mode is not on yet.**
  - Local keys are `rzp_test_*`, and STATE.md:1432 / 1534-1538 say live keys stay blocked until one full test-mode payment through to an invoice is done and the owner says go.
  - The credit-note execute path and real `refund.processed` handling have **never run** (STATE.md:1514-1520).
- **No re-send for failed invoice emails.** There is no scheduled re-send of unsent invoice emails (STATE.md:1527).
- **Deleting a business does not cancel its Razorpay subscription.** `deleteBusinessForOrg` (`lib/business.ts:446-462`) only deletes rows, so a deleted tenant's mandate keeps charging. The resulting webhooks hit "no row", which is logged and acknowledged.
- **Billing fails open.** Entitlement reads resolve to Scale on any error (section 4), and so does the quota check (`lib/usage-limit.ts:116-121`).

## 10. Data safety: **Partial**

**Done**
- **RLS is enabled on all 72 tables** created in migrations. I parsed every `create table` against every `enable row level security` and found no table without it.
- **There are no `anon` grants** in any migration. Function `EXECUTE` is revoked by default (`20260812191914`, `…200105`, `…213356`).
- **Tenant-isolation pgTAP tests exist** for 66 files' worth of tables and functions, including vector search (008, 030).
- **The dashboard client uses Clerk's JWT**, so RLS applies (`lib/supabase/server.ts:15`).
- **Service-role usage** is confined to server-only modules: webhooks, the public widget, cron, admin and Meta callbacks. That is 75 files under `app` and `lib`, and none are client components (checked: no `"use client"` file imports a service or admin client).

**Gaps**
- **Backups are Missing.** Supabase is on the free tier with no PITR (`docs/deployment.md` §4). A manual `pg_dump` procedure exists but **"has never been run… not yet tested end to end."** No restore has ever been tested.
- **Service-role code paths bypass RLS.** Their tenant scoping depends on every query carrying `.eq("business_id", …)`, and only the pure-module tests check this (e.g. `test:tool-scope`), not a database-level test.
- **Local development connects to the production database** (section 3).

## 11. Security: **Partial**

**Done**
- **Auth:** Clerk with organizations; `requireBusinessContext` on every dashboard page and action; org-role checks (`requireMinRole`, `org:admin` for billing and delete).
- **Validation:** Zod at the boundaries.
- **Headers:** `nosniff`, Referrer-Policy, Permissions-Policy, and frame-deny on app pages (`next.config.ts`).
- **No secrets in git history.** I scanned all commits for Google (`AIza…`), Stripe-style (`sk_live_` / `sk_test_`), Supabase (`sb_secret_`), Razorpay (`rzp_*`) and `whsec_` key patterns, and found none. Hits on `EAA…` were font or base64 data. No `.env` file was ever committed.
- **Prompt injection mitigations:**
  - a canary and verbatim-prompt leak block, which enforce
  - untrusted-content wrapping (`lib/guardrails/untrusted.ts`)
  - tools that take no URL and are scoped to the business, with contact details verified against what the visitor typed (`test:tool-scope`)
  - red-team evals (`scripts/eval-judges.mjs`)

**Gaps**
- **The injection and abuse classifiers and the output checks for contacts and promises are LOG-ONLY** (`lib/guardrails/config.ts:25-35`). Injected instructions are detected but not acted on.
- **There's no Content-Security-Policy and no HSTS in app config.** Vercel adds HSTS on its domains, but a VPS won't.
- **The WhatsApp token is stored in plaintext** (section 7).
- **A dev page is public in production.** `app/(dashboard)/dev/fragments/page.tsx` has no auth or `NODE_ENV` guard, and its own comment says "delete once the redesign ships". Low risk, since it only shows marketing fragments.
- **Many abuse limits are log-only or fail open** (section 8).

## 12. Gemini reliability: **Partial**

**Done**
- **Timeouts and deadlines:** a 25-second per-call `AbortSignal.timeout`, a 50-second turn deadline and a 15-second tool timeout (`lib/chat-timeouts.ts:87-106`, `lib/rag.ts:1284`, `1464`, `1611-1613`). A timeout produces an honest reply plus escalation (`escalationReason: "response_timeout"`).
- **No invented answers:** when retrieval finds nothing, the agent uses the approved fallback (`FALLBACK_MESSAGE`, `lib/rag.ts:138`).
- **Per-client caps:** reply quotas per plan, enforced on every channel.
- **Cost tracking:** every call goes to `gemini_api_calls` with an estimated cost (`lib/gemini-pricing.ts`), surfaced at `/apache/ai-usage`.
- **Key separation:** dev and prod Gemini keys are separated (`lib/env.ts:99-113`).

**Gaps**
- **Retries are implicit and aggressive.** `getChatModel()` (`lib/rag.ts:570-577`) sets no `maxRetries`, so `@langchain/core`'s default of **6 retries with exponential backoff** applies (`node_modules/@langchain/core/dist/utils/async_caller.js:178`; `@langchain/google-genai` 2.2.0). The 25-second abort is the only bound. On a Gemini 429 or 503, a turn can spend its whole budget retrying, which multiplies load on an already-throttled key. Retries aren't tuned or logged.
- **Timeouts and errors behave differently.** A timeout returns an honest reply with escalation (`lib/rag.ts:1159`, `1671`). Any other Gemini error is rethrown as `AppError` (`lib/rag.ts:1572-1573`, `2151-2152`). That rethrow is what causes the silent WhatsApp and Instagram failures in §1.
- **There's no fallback model and no circuit breaker** (`docs/deployment.md` §5).
- **During a Gemini outage:**
  - The widget returns an error response.
  - WhatsApp and Instagram send nothing, and the conversation isn't flagged.
  - Every turn still waits up to the full timeout.
- **There's no global rate or spend ceiling across tenants.** Only per-tenant reply quotas exist; ingestion embeddings and answer-bank generation aren't counted against them. A Google-side budget or alert can't be seen from the code.

## 13. Webhook reliability: **Partial**

| Source | Signature | Duplicates | Out of order | Retries |
|---|---|---|---|---|
| Razorpay | ✅ fails closed | ✅ event-id ledger, released on failure | ✅ `provider_event_at` | ✅ 5xx on failure → Razorpay retries |
| Instagram | ✅ | ✅ unique `mid` | n/a (each message is independent) | ⚠️ dedup row is written first, so a later failure in the same request, or in `after()`, loses the message: the redelivery is skipped |
| WhatsApp | ✅ fails closed | ✅ unique message id | n/a | ⚠️ same "dedup first" issue; status callbacks are ignored |
| Resend | ✅ Svix-style HMAC (`lib/resend-webhook.ts`) | idempotent suppression upsert | n/a | — |
| Meta deauthorize / data-deletion | ✅ signed_request | confirmation code | n/a | deletion runs in `after()` |
| Outbound business webhooks | HMAC-signed to the customer | — | — | ✅ 5× backoff, **but only at the daily cron cadence** |

## 14. Legal & data: **Partial**

**Done**
- `/privacy`, `/terms`, `/refunds`, `/shipping`, `/contact`, `/data-deletion` and `/data-deletion/status` exist. Privacy was updated 2026-11-02 and names Gemini, Clerk, Supabase, Sentry, Resend, Vercel and Meta, and has a grievance officer section.
- The widget has a consent checkbox, required before contact capture (`lib/conversations.ts:296-311`). The owner can point it at their own privacy policy URL.
- Business self-service export and delete (`app/(dashboard)/dashboard/profile/actions.ts:77`, `111-137`). Conversations are deleted automatically after 24 months via pg_cron (`20260820200000_…`, `docs/data-retention.md`).
- Meta data-deletion callback with a status page.

**Gaps**
- **The privacy page never names Razorpay** (0 hits in `app/(dashboard)/privacy/page.tsx`), even though Razorpay is a payment processor receiving customer data. *Correction to the earlier draft:* the page **does** cover the DPDP Act and retention. It covers the Data Fiduciary and Processor roles (line 72), cross-border transfer (line 316), a 30-day deletion commitment (line 377) and a "How long we keep it" section (lines 340-354). That section covers 24-month auto-deletion and statutory retention of invoices and payment records.
- **Prospect (end-user) deletion requests are a manual runbook** (`docs/gdpr-dpdp-request-workflow.md`). Acceptable, but it needs an owner and an SLA.
- **Invoices keep a deleted customer's snapshot by design** (statutory). The policy already discloses this generically (lines 350-353), so no change is needed beyond naming the processor.
- **The privacy page names Vercel**, so it needs updating when you move to the VPS. I haven't checked whether it names Supabase's region.
- **Consent on WhatsApp and Instagram is implied** by the prospect messaging first (`recordConversationConsent` in both webhooks). That's reasonable, but it should be in the policy.

## 15. VPS readiness: **Partial**. Several things break on a plain `next start` VPS

| Issue | Evidence | Effect on a Mumbai VPS |
|---|---|---|
| **Gemini key chosen by `VERCEL_ENV`** | `lib/env.ts:99-110`, `lib/gemini-usage-log.ts:59-60` | `VERCEL_ENV` is undefined, so production uses **`GEMINI_API_KEY_DEV`**. If that's unset, startup throws; if it is set, prod traffic bills the dev key and usage is mis-tagged. Needs an explicit `APP_ENV`. |
| **Cron** | `vercel.json` | Nothing triggers `/api/cron/process-ingestion-queue`. Needs systemd timer or crontab with `Authorization: Bearer $CRON_SECRET`, and should run far more often than daily. |
| **App URL fallback** | `lib/app-url.ts:3,35` | Uses `VERCEL_PROJECT_PRODUCTION_URL`, then the hard-coded fallback `https://ai-sales.vercel.app`. Email links break unless `NEXT_PUBLIC_APP_URL` is set **at build time** (`NEXT_PUBLIC_*` values are inlined into the build). |
| **Client IP** | `lib/http/widget-cors.ts:54-57` | The first `x-forwarded-for` value is spoofable behind nginx's default `proxy_add_x_forwarded_for`, which bypasses every per-IP limit. The proxy must overwrite the header (`proxy_set_header X-Forwarded-For $remote_addr`), or trust a single proxy hop. |
| **Headless Chromium** | `lib/browser-render.ts:3,22,45-46` | `@sparticuz/chromium-min` downloads an x64 Lambda pack from GitHub at runtime. It works on x86-64 Linux with outbound internet; it **breaks on ARM**. Better to install system Chromium. |
| **`after()` and process lifecycle** | Instagram webhook `:138`, many actions | Runs in-process on a VPS. A deploy or restart drops in-flight replies (see the dedup issue). Needs graceful shutdown or drain under PM2/systemd. |
| **`maxDuration` exports** | chat, cron and webhook routes | Ignored outside Vercel. There's no platform timeout, so a hung call is bounded only by the app's own aborts. |
| **Streaming** | `app/api/chat/route.ts` (SSE) | A reverse proxy must disable buffering (`proxy_buffering off` for `/api/chat`), or tokens arrive all at once. |
| **Security headers and TLS** | `next.config.ts` | No HSTS or CSP. Vercel supplied TLS and HSTS; on the VPS that falls to you. |
| **Logs** | `console.log` JSON | Need journald or file rotation and shipping. Today's only retention is Vercel's ~30 minutes plus Sentry. |
| **File storage** | Supabase Storage buckets | ✅ no local filesystem writes in `app/` or `lib/`, so this is portable. |
| **Sentry uploads** | `next.config.ts` | Building on the VPS needs `SENTRY_AUTH_TOKEN` for source maps; otherwise uploads are skipped, which is harmless. |
| **Webhook URLs** | Meta, Razorpay, Resend dashboards | Every callback URL and OAuth redirect (`META_REDIRECT_URI`) must move with the domain. |

## 16. Tests: **Partial**

**Run in this audit, re-run on `6bb84d5` with identical results** (side-effect free; production build run with `SENTRY_AUTH_TOKEN` blanked so no source maps were uploaded; unit suites run with the Supabase URL and secret unset as an extra guard):

| Check | Result |
|---|---|
| `npm run lint` | ✅ exit 0, no findings |
| `npm run typecheck` | ✅ exit 0 |
| 23 `npm run test:*` suites (pure, no DB or network) | **602 / 603 pass.** The one failure is `test:meta-instagram`, "latency: follow-up work runs after the Send API call…" (`scripts/run-meta-instagram-tests.mjs:1088`). |
| `npm run build` | ✅ exit 0, every route compiled |
| `npm test` (pgTAP) | **Not run.** The CLI is linked to **production** (`supabase/.temp/project-ref`), so running it would execute against prod. CI runs it against staging, and the last 3 `main` runs are green (`gh run list`). |
| `npm run eval` / `eval:redteam` / `loadtest` | Not run; these make live Gemini calls. |

About the one failure: the test string-matches source text containing `"\n    logEvent"`, but this Windows checkout has CRLF line endings (`core.autocrlf=true`). It is a **brittle test, not a code defect**: CI on Linux passes the same commit.

**Coverage**
- **Strong:** pure-module tests for money, tax, signatures, guardrails, rate-limit logic and widget access; the pgTAP tenant-isolation suite (66 files).
- **Weak:**
  - Many "wiring" tests are source-text pattern checks, not executions.
  - No route-level integration tests run a webhook against a database.
  - No end-to-end tests: signup → onboarding → publish → widget chat → lead → booking → payment.
  - The streaming path, WhatsApp, Instagram and Razorpay have never been exercised end to end in CI.

---

## A. Launch verdict: **NOT READY**

The core product is unusually well built for this stage. Tenant isolation, RLS, webhook signing, billing idempotency, GST invoicing and the admin gate are all solid. Launch is held up by operations and money issues, not by AI quality:

1. **There are no backups.** A real business's data has never been backed up, and no restore has ever been rehearsed.
2. **Background work runs once a day.** Failed WhatsApp and Instagram sends, SLA alerts and webhook retries effectively happen next day.
3. **Appointment follow-up doesn't exist.** There are no reminders and no expiry of unconfirmed bookings, which matters for a product that sells booking.
4. **Payments are not live**, and the "billing complete" onboarding gate is satisfied by a free trial. There are also trial-reset and orphaned-mandate holes.
5. **Development runs against the production database** from your machine.
6. **A failed AI reply on WhatsApp or Instagram is silent**: no reply goes out and nothing is flagged.
7. **The hosting tiers in use don't fit a paid launch.** Vercel Hobby is non-commercial (see E), and Supabase is on the free tier. Moving to the VPS also breaks Gemini key selection, cron, app URLs and IP rate limiting until each is fixed.

## B. Launch blockers, in fix order

| # | Blocker | Why it blocks | Effort |
|---|---|---|---|
| 1 | **Point local dev and the Supabase CLI at staging**; give dev its own Clerk instance | Every local test, seed or credit-note command currently hits production data | **S** |
| 2 | **Backups:** move to Supabase Pro (PITR), take one real `pg_dump`, **restore it into a scratch project** and document the procedure | No recovery path exists for paying customers' data | **S–M** |
| 3 | **Replace the daily cron with a frequent scheduler**, every 1–5 minutes, on Vercel Pro cron or a VPS timer. Split the sweeps so one failure or timeout doesn't sink the rest | Retries, SLA, digests and outbound sends need minutes, not a day | **M** |
| 4 | **Fail loudly on WhatsApp and Instagram reply errors:** wrap `askSalesEmployee`, send the safe fallback, flag `needs_attention`, add a recovery sweep for "inbound stored, no reply" | Prospects are currently ignored without anyone knowing | **S** |
| 5 | **WhatsApp 24-hour window:** check `last_inbound` before sending, handle error 131047 without retrying, and show "outside window" in the UI. Add at least one approved template for appointment notices, or fall back to email | Owner replies and appointment confirmations will fail in normal use | **M** |
| 6 | **Appointment lifecycle:** reminders (e.g. T-24h and T-1h on email and channel), auto-expire or escalate `pending` bookings, and post-appointment follow-up. Depends on #3 | Advertised feature with no follow-through | **M** |
| 7 | **Billing integrity:** decide whether onboarding requires a payment method (if yes, make `plan` mean `hasPaymentMethod`, not `serving`). Key trials by `clerk_org_id` so delete and recreate can't restart one. Cancel the Razorpay subscription on business delete. Revisit "no row or read error means Scale" | Free-plan loopholes and charges continuing after a customer deletes | **S–M** |
| 8 | **Go live on Razorpay** per STATE.md: one full test payment through to invoice and credit note, then live keys, live plans re-created at the same gross, and one real payment checked | Can't take money otherwise | **S** (mostly ops) |
| 9 | **Production hosting tier:** Vercel Pro, or finish the VPS move (#10) before charging | Hobby is non-commercial; logs last ~30 minutes | **S** |
| 10 | *(If launching on the VPS)* **VPS fixes:** replace `VERCEL_ENV` with an explicit `APP_ENV`, set `NEXT_PUBLIC_APP_URL` at build, overwrite XFF in nginx, turn off proxy buffering for SSE, add HSTS, system cron, graceful shutdown, and system Chromium | Production would silently use the dev Gemini key, rate limits become spoofable, and cron stops | **M** |
| 11 | **A real health check** (DB ping plus queue-depth and dead-letter counts) and **explicit Sentry alerts**: dead-letters, webhook 401s, Gemini error rate, `*_reply_failed` | You'd currently learn about outages from customers | **S** |

## C. Fix soon, can wait until after launch

- Promote the log-only abuse scopes (`business_burst`, `new_conversation_ip`, `ip_subnet`) and the guardrail classifiers to enforce, after reviewing the recorded signals. Add Turnstile or BotID to the widget.
- Encrypt WhatsApp tokens like Instagram's; offer WhatsApp Embedded Signup.
- Handle WhatsApp status webhooks (delivered, read, failed).
- Gate outbound WhatsApp on plan (STATE.md:1530).
- Put Instagram on a sellable plan, or document that it's add-on-only.
- Tune Gemini `maxRetries` explicitly; add a fallback model or circuit breaker; set a Google-side budget alert.
- Re-send unsent invoice emails on a schedule.
- Add a CSP header; delete `app/(dashboard)/dev/fragments`.
- Track `.env.example` in git (un-ignore it) and add the missing variables.
- Stop passing the prod `GEMINI_API_KEY` into CI.
- Add route-level integration tests (webhook → DB) and one Playwright E2E for onboarding → publish → chat.
- Make the CRLF-sensitive source-shape tests line-ending agnostic.
- Exclude sandbox conversations from analytics.
- Make the USD→INR rate configurable.
- Lower `rate_limit_exceeded` from Sentry error to a counter metric.
- Privacy policy: name Razorpay as a payment processor, and update the hosting providers (Vercel → VPS host, and the Supabase region if it moves) after the migration.
- Set an explicit `maxRetries` (e.g. 1–2) on `getChatModel()` so a throttled key isn't hammered six times per turn.
- Refresh `docs/deployment.md` §2a, which wrongly says the local CLI is linked to staging.

## D. Things I can't verify from code: please check

1. **Meta App Review:** approval status and **Advanced Access** for `instagram_basic`, `instagram_manage_messages`, `pages_show_list`, `pages_manage_metadata` (and `business_management` if used). Also Business Verification, App mode = Live, and the Instagram webhook object subscriptions (`messages`, `messaging_postbacks`, `message_reactions`, `messaging_seen`).
2. **Facebook Login config `META_LOGIN_CONFIG_ID`:** confirm it actually contains the permissions above (STATE.md:104 asks you to add `pages_manage_metadata`).
3. **WhatsApp:** WABA verification and display-name approval, messaging tier and quality rating, webhook subscription, and whether any templates are approved.
4. **Production migrations:** run `npx supabase migration list --linked` against prod to confirm `20261112000000` and `20261114000000` are applied. STATE.md still says "NOT YET APPLIED" for both.
5. **Vercel production env:** `META_LOGIN_CONFIG_ID`, `META_IG_LOGIN_MODE`, `META_TOKEN_ENCRYPTION_KEY`, `CRON_SECRET` (without it the cron returns 404 and **no background sweep runs at all**: `route.ts:55`), `RAZORPAY_WEBHOOK_SECRET`, `WHATSAPP_APP_SECRET`, `RESEND_WEBHOOK_SECRET` and `NEXT_PUBLIC_APP_URL`.
6. **Clerk:** that production uses a **production instance** (`pk_live_…`); your local key is `pk_test_…`. Check MFA is enforced for platform admins and the session lifetime.
7. **Razorpay dashboard:** live account activation and KYC, the webhook URL and its events (including `refund.processed`), and the card-only subscription setting.
8. **Supabase:** current tier, backup schedule and retention, whether a restore was ever tested, and that pg_cron jobs are present in prod.
9. **Sentry:** alert rules beyond the default, plan quota, and the DE data region (fine for DPDP, but disclose it).
10. **Gemini:** the production key is on a **paid** Cloud project. On the free tier, Google may use prompts for training, which would conflict with your privacy policy. Also check quota tier and a billing budget alert.
11. **UptimeRobot:** that its monitor points at the current production domain (`aipilot.waveswebstudio.in`).
12. **Resend:** domain verification (SPF, DKIM, DMARC) for `NOTIFICATION_EMAIL_FROM`.
13. **GitHub:** branch protection on `main` still requires the `build-and-test` check.

## E. Launch risks you didn't list

- **Vercel Hobby is for non-commercial use only** under Vercel's terms. Charging customers while hosted on Hobby is a ToS problem. Hobby also caps cron at once a day, which caused issue #2.
- **Supabase free projects pause after inactivity** and have tight connection limits. A paused production DB takes every tenant down.
- **Schema and code drift in production.** Merges auto-deploy, but migrations are promoted by hand afterwards. Several recent merges deployed code that expected migrations which weren't applied yet. Add a "migration pending" check, or promote before merge.
- **Region latency.** Functions run in Seoul (`icn1`) next to Supabase `ap-northeast-2` (STATE.md, 2026-11-02). Moving compute to Mumbai **without also moving Supabase** adds roughly 60–100 ms to each of the ~13 serial DB round trips per reply. Plan the database region move together with the VPS.
- **Single-instance VPS.** One box means no redundancy, and a deploy restarts in-flight `after()` work. Use zero-downtime restarts and keep the queue-based recovery from #4.
- **One shared Gemini key across all tenants.** One tenant's spike or a Google per-project rate limit hits every customer at once, and there's no tenant-level throttle beyond reply quotas.
- **Trial abuse through new Clerk organizations** (each org gets a trial). Consider a per-user or per-email-domain limit.
- **The bus factor is one.** CI, migrations, backups and Meta setup all depend on manual steps recorded in a 6,000-line STATE.md. Write a one-page runbook for incidents, migration promotion, restore and key rotation.
- **Prompt-injection exposure stays open while the classifiers are log-only.** Tools are well scoped, so the blast radius is limited to what the model says, but a determined prospect can still steer replies.
- **WhatsApp policy.** A sales bot that sends follow-ups or notices outside the 24-hour window without templates risks quality-rating drops and number restrictions.
