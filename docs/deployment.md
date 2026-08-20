# Deployment, environments & disaster recovery

Read this before touching CI, migrations, environment variables, or a production deploy. Built in Phase 20 (`STATE.md`, `docs/phases.md`) — the "ship safety" phase everything after it depends on.

---

## 1. Environments

Three fully separate environments, three separate credential sets. None share a database, a Clerk secret key, or a Gemini key value's *scope of use* (staging and production currently reuse the same Clerk application and the same Gemini API key by deliberate simplification — see §1a — but never the same Supabase project).

| Environment | Supabase project | Purpose | Who touches it |
|---|---|---|---|
| **Local dev** | `ai-sales` (production) or a developer's own, per `.env.local` | Day-to-day development | Whoever's coding |
| **Staging** | `ai-sales-staging` (ref `otmeqswvlmorxvjocaru`, separate Supabase account/org from production) | CI runs every PR's migrations and the pgTAP suite here; a real, always-current pre-production copy | GitHub Actions, plus manual smoke-testing before a promotion |
| **Production** | `ai-sales` (ref `bykeztxvejpwfcxgsubm`) | Real tenants, real data | Only via the promotion procedure in §3 |

### 1a. Deliberate simplification, recorded not silently assumed

Staging and production currently point at the **same Clerk application** and the **same `GEMINI_API_KEY`** — only the Supabase project is isolated. This was a scope decision for Phase 20, not an oversight: a second Clerk application and a second billed Gemini key are real setup cost with no immediate safety payoff, since Clerk/Gemini hold no tenant-owned rows the way Supabase does. Revisit if staging ever needs to safely simulate a real signup flow without touching production Clerk users, or if Gemini usage/cost tracking needs to distinguish staging traffic from real traffic (Phase 21/22's cost metrics currently cannot tell the two apart).

---

## 2. CI pipeline

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

1. `npm ci`
2. `npm run lint`
3. `npx tsc --noEmit`
4. `npm run build`
5. `supabase link` + `supabase db push` against **staging** — applies the branch's migrations to the shared staging database and fails the run if any migration doesn't apply cleanly
6. `npm test` — the pgTAP tenant-isolation suite, now running against staging (see §2a), not a developer's local linked session

**Secrets** live in the GitHub repo's Actions secrets (`gh secret list --repo tarunvalluri3/ai-sales`), never in a committed file: `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `GEMINI_API_KEY`, `GEMINI_CHAT_MODEL`, `GEMINI_EMBEDDING_MODEL`, `GEMINI_EMBEDDING_DIMENSION`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PUBLISHABLE_KEY`, `STAGING_SUPABASE_SECRET_KEY`, `STAGING_SUPABASE_ACCESS_TOKEN`, `STAGING_SUPABASE_PROJECT_REF`, `STAGING_SUPABASE_DB_PASSWORD`.

### 2a. Closing the Phase 19 audit gap

Phase 19's audit flagged that `npm test` required a human's locally-linked `supabase` CLI session and always targeted whatever project that session happened to be linked to — meaning it could silently run against production. Phase 20 closes this two ways:

- **In CI**, the workflow links to staging explicitly via `STAGING_SUPABASE_ACCESS_TOKEN`/`STAGING_SUPABASE_PROJECT_REF`/`STAGING_SUPABASE_DB_PASSWORD` before running tests — no ambiguity about which project it targets.
- **Locally**, the implementing environment's own CLI session was relinked to `ai-sales-staging` as part of setting it up, so `npm test` run by hand now defaults to staging too. Run `npx supabase projects list` and check the `linked` field if you ever need to confirm which project a given machine's CLI session currently targets before running anything destructive.

### 2b. Known limitation

`ai-sales-staging` is one shared database, not a fresh instance per PR — see the "known limitation" comment directly in `ci.yml`. Supabase's per-PR preview-branching feature needs a paid project tier, deliberately not adopted (§4's free-tier decision). Two PRs with migrations open at once can race against this same database. Acceptable for a single-developer project; revisit before a second contributor lands concurrent migration PRs.

### 2c. Branch protection

`main` requires the `build-and-test` CI check to pass before a PR can merge (configured via `gh api repos/tarunvalluri3/ai-sales/branches/main/protection` — see git history for the exact call). A failing lint/typecheck/build/test run cannot reach production through the normal path.

---

## 3. Migration promotion: staging → production

Every migration already lands on staging automatically, as part of CI (§2). Promoting to production is a **separate, deliberate, manual step** — never automatic — because production holds real tenant data and staging's automatic-push model is not an acceptable safety bar for it.

1. Confirm the migration has been live on staging (via CI) for at least one real work session, and that nothing downstream looked wrong.
2. Read the migration file again, specifically for anything that isn't purely additive (a `DROP`, a `NOT NULL` added to an existing column, a type change, a rename). Anything non-additive needs a rollback plan written *before* step 3, not improvised after.
3. Link the CLI to production and push:
   ```
   npx supabase link --project-ref bykeztxvejpwfcxgsubm
   npx supabase db push --linked
   ```
   This requires interactive confirmation (the `[Y/n]` prompt) — deliberately not scripted with `--yes` for production, unlike staging's CI step.
4. Verify live: query the affected table/function directly against production and confirm the expected shape, the same way every prior phase's live-migration steps in `STATE.md` have.
5. Re-link back to staging afterward (`npx supabase link --project-ref otmeqswvlmorxvjocaru --password <staging password>`) so the local session's default target goes back to the safer project.

### 3a. Rollback per migration

Postgres migrations in this project are forward-only files (`supabase/migrations/*.sql`), matching the CLI's own model — there is no `down.sql` per migration. Rollback means one of:

- **A purely additive migration** (new table, new nullable column, new function): write and apply a new migration that reverses it (`DROP TABLE`/`DROP COLUMN`/`DROP FUNCTION`). Safe, low-risk, can be done any time.
- **A destructive migration** (dropped column, changed constraint): the *only* real rollback is restoring from a backup taken before it was promoted (§4) — a forward-fixing migration cannot un-lose already-deleted data. This is exactly why step 2 above requires flagging non-additive migrations before they touch production.

Never hand-edit a row to "undo" a migration outside of a new migration file — that leaves `supabase/migrations/` unable to reproduce the database's real current state from scratch, which every phase since Phase 3 has depended on being true.

---

## 4. Backups

**Current state, stated plainly: this project is on Supabase's free tier, which does not include point-in-time recovery (PITR) or a guaranteed automated daily backup with meaningful retention.** This was an explicit decision (STATE.md, Phase 20) over upgrading to Pro specifically for backup guarantees — recorded as a known, accepted gap, not silently assumed solved.

What exists today:
- Supabase's free tier performs periodic backups with short retention as part of the platform itself, but this is **not a substitute for a tested, owned recovery procedure** — there is no contractual retention guarantee at this tier the way Pro's PITR provides.
- A **manual logical backup** can be taken any time via `npx supabase db dump --linked -f backup.sql` against production, and should be run before any non-additive migration promotion (§3a) and on a recurring manual cadence until this is automated.

**Open item, not closed by this phase:** an automated, scheduled logical backup (e.g., a GitHub Actions cron job running `supabase db dump` against production and uploading the artifact somewhere durable) is the correct next step to make this a real safety net rather than a manual habit. Not built in Phase 20 — flag before this becomes load-bearing for a paying business's data.

---

## 5. Disaster recovery runbook

**Supabase (production database) is down or unreachable:**
1. Check https://status.supabase.com for an active incident.
2. If it's a Supabase-side outage: nothing to do but wait — confirm via their status page, do not attempt a failover (none exists). The app's error paths (`lib/errors.ts`) already return a safe, generic message rather than a raw DB error to end users.
3. If queries are failing but Supabase reports healthy: check `docs/security.md`'s RLS/grants haven't regressed via a recent migration; check the most recent migration promoted to production (§3).

**Vercel (hosting) is down or a deploy is broken:**
1. Check https://www.vercel-status.com.
2. For a bad deploy specifically: `vercel rollback` (or the dashboard's "Promote to Production" on the last-known-good deployment) — see the rollback drill record in §6, which confirmed this works live.

**Gemini (AI provider) is down or erroring:**
1. Check https://status.cloud.google.com or the AI Studio status page.
2. The chat path's existing fallback behavior (`PRODUCT.md` §7 — no fabricated answers when the model/retrieval fails) already degrades safely; there is no automated fallback model yet (tracked in the Launch Readiness gap list, Stage C/D — not this phase's scope).

**A secret is leaked (Clerk, Supabase, Gemini, or a GitHub Actions secret):**
1. Rotate it at the source (Clerk Dashboard / Supabase project API settings / Google AI Studio / `gh secret set`) immediately.
2. Update `.env.local` for local dev and Vercel's production env vars (§6) to match.
3. Never rely on `git history` scrubbing alone — treat any committed secret as permanently compromised and rotate, don't just remove the commit.

---

## 5a. Error tracking, alerting, and uptime (Phase 21)

**Error tracking:** Sentry project `waves-web-studio/ai-sales` (DE region). Full wiring detail in `docs/architecture.md`'s "Error tracking and alerting (Phase 21)" section — SDK layers, PII scrubbing, and how the existing `lib/errors.ts`/`lib/logger.ts` conventions double as alert triggers. Sentry's default "notify on high-priority issue" rule emails the account owner; view issues at `https://waves-web-studio.sentry.io/projects/ai-sales/`.

**AI latency/cost metrics:** `public.ai_response_metrics`, surfaced on `/dashboard/analytics`. See `docs/architecture.md` for the full write/read path.

**Uptime monitoring:** UptimeRobot, account `tarunvalluri3@gmail.com`. **Known limitation, not silently solved:** the free plan allows exactly one monitor — it now watches `/api/health` (chosen over the homepage as a more meaningful liveness check; a static page can serve from Vercel's edge cache even if the app server itself is unhealthy, `/api/health` cannot). `/widget/embed` and the homepage itself are **not** independently monitored. Revisit if the free-plan limit changes or the account is upgraded.

**Log retention:** Vercel's own request/function logs (accessible via the Vercel dashboard) are the only structured-log retention this project has — subject to Vercel's plan-level retention window (short on the Hobby tier this project is currently on), not a separately configured policy. Sentry retains captured errors/messages per its own plan (90 days on the free tier at time of writing). No log is exported or retained anywhere longer than each platform's own default — an explicit choice, not an oversight: this project has no compliance requirement yet that would justify a longer, separately-managed retention pipeline (see the Launch Readiness checklist's Stage C for where that requirement would be tracked if it arises).

## 6. Production deployment (Vercel)

Production is deployed via Vercel's GitHub integration, linked to `tarunvalluri3/ai-sales`. Production env vars are set directly in the Vercel project (Project Settings → Environment Variables → Production), sourced from `.env.local`'s real production values — never committed to the repo.

**Preview deployments** (Vercel's automatic per-branch/PR builds) have their own separate env var set, pointed at **staging** Supabase, Clerk, and Gemini — never production. Discovered and fixed live during Phase 21: the first PR branch's preview build failed outright (`GEMINI_EMBEDDING_DIMENSION must be a positive integer, got: undefined`) because only the Production Vercel environment had ever been configured — Preview had nothing set at all. Pointing previews at staging rather than duplicating production values is also the safer default: an arbitrary in-progress branch should never be able to touch real tenant data.

**Rollback drill, live-verified during Phase 20** (2026-08-20): `vercel rollback <older-deployment-url>` moved every production alias (`ai-sales-ashy-eight.vercel.app` and the others) onto an earlier deployment in ~2 seconds — confirmed via `vercel inspect` showing the aliases attached to the older deployment's ID, not just the CLI's own success message. Rolled forward again the same way to restore the current build, then smoke-tested `/` and `/api/health` on the live production URL (both `200`). This is a real, working escape hatch, not a documented assumption.
