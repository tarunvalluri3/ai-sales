# Launch runbook

The order to take Waves AI Pilot from the current VPS to launch. Added 2026-11-04.

## 1. Deploy the current code
The VPS was still serving code from before the `production-readiness` branch on 2026-11-04: `/api/health?deep=1` returned no checks and `/pricing` had the old copy.

1. Point `.env.local` and `npx supabase link` at staging. `npm run dev` refuses a production database.
2. Push `production-readiness` and open the PR. CI applies the migrations to staging and runs pgTAP and the unit suites.
3. Fix anything CI finds, then merge.
4. Set the VPS environment: `APP_ENV=production`, `NEXT_PUBLIC_APP_URL` (before `npm run build`), `CRON_SECRET`, `OPS_ALERT_EMAIL`, `CLIENT_IP_SOURCE=x-real-ip`, `LOCAL_CHROMIUM_PATH`, `TURNSTILE_MODE=log`. Remove `VERCEL_ENV` if it is set.
5. Build, restart, and add the 2-minute scheduler (`docs/vps-cron.md`).
6. Check that `/api/health?deep=1` returns 200 with its checks.

## 2. Reply speed
Vercel ran in Seoul next to the database. The VPS adds the distance to Seoul to every database call, and a reply makes many of them.

**Measure first.** On the VPS, run this five times:

```bash
curl -s -o /dev/null -w 'total %{time_total}s\n' https://<project-ref>.supabase.co/auth/v1/health
```

Then run this in the Supabase SQL editor:

```sql
select stage->>'stage' as stage,
       count(*) as turns,
       round(avg((stage->>'ms')::numeric)) as avg_ms
from ai_response_metrics m, jsonb_array_elements(m.stage_timings) stage
where m.created_at > now() - interval '2 days'
group by 1
order by avg_ms desc;
```

- **Database stages near or above 150 ms:** the distance is the cause. Create the production Supabase project in `ap-south-1` (Mumbai). The Free plan can do this, but allows two active projects, so pause one if needed. First add the new ref to `supabase/production-project-refs.txt` and commit it.
- **`model_call_*` dominates:** look at the Gemini model and prompt size. Hosting won't change this.
- **Everything is slow, including local stages:** check the VM's CPU and memory. Shared-core machines such as `e2-micro` throttle. Use at least `e2-small`.
- **The text appears all at once:** check that nginx has no `gzip` for `text/event-stream` and that `proxy_buffering` is off for `/api/chat`.

## 3. Meta
Standard Access only covers people with a role on the app. That is why a connection can work for the owner and fail for a client.

1. In App Review, request Advanced Access for everything in `docs/meta-app-review.md`, on both Instagram and WhatsApp.
2. For a pilot client before approval, add their Facebook user as a Tester under App Roles. They must accept the invite.
3. Check the client's side:
   - the Instagram account is professional
   - it is linked to a Facebook Page they have full control of
   - they tick that Page in the Facebook dialog
   - Allow access to messages is on in the Instagram app
4. Test one real WhatsApp Embedded Signup and get the five templates approved.

If a connection fails, the page shows a message and the URL has `?error=<code>`. The server logs an `ig_connect_failed` line with Meta's own message:

```bash
grep ig_connect_ /var/log/ai-pilot/out.log | tail -20   # PM2 log file, see section 9
```

If Facebook shows an error before returning to the app, the cause is in the Meta configuration or access level, and no log line appears.

## 4. Razorpay
Add the live keys, live plan ids, live webhook and its secret. **Don't make a real payment yet.** Invoice numbers are gap-free and stored in the database, so wiping it after a real payment restarts the sequence and can duplicate GST invoice numbers. Cancel any live subscriptions before a wipe.

## 5. UI redesign, then clean up
Keep these when deleting files. CI, migrations or the app need them:
- `supabase/`, including `production-project-refs.txt`
- `scripts/`, unless you also remove the matching `package.json` scripts and CI steps
- `.github/`, `.env.example`, `docs/vps-cron.md`, this runbook

Run lint, typecheck, build and every `test:*` suite after deleting. Several tests read source files, so a deletion can fail them.

## 6. Fresh database and final deploy
1. Create the final project in Mumbai, or reset the Mumbai one, then run `db push`.
2. Confirm the pg_cron jobs exist.
3. Add your admin account to `platform_admins`.
4. Point the VPS at it, rebuild and restart.
5. Install the nightly backup, then restore one dump into a temporary project to prove it works:

```cron
30 21 * * * BACKUP_DATABASE_URL=... BACKUP_DIR=/var/backups/ai-pilot BACKUP_GCS_BUCKET=gs://... /path/to/app/scripts/backup-database.sh
```

## 7. Final checks before opening signups
1. Run a full new-customer test with a real payment: signup, onboarding, trial, payment, GST invoice, AI reply on all three channels. Then cancel or refund it.
2. Set up Sentry alerts, UptimeRobot on `/api/health?deep=1`, and a Google budget alert.
3. Confirm the Gemini key is on a paid project.

## 8. Clerk production checklist
Do this before opening signups. It is all Clerk, DNS and Vercel configuration, with no code change. Staging and local dev keep using the development instance.

1. **Create the production instance.** In the Clerk Dashboard, create the production instance for the app. Clerk shows the DNS records it needs for your domain (the `clerk.` frontend host, the accounts host and the mail records). Add them at your DNS provider and wait until Clerk marks every record verified. SSL issuance for those hosts follows.
2. **Use your own Google OAuth credentials.** In the Google Cloud console, create an OAuth client with the consent screen named "Waves AI Pilot", then paste the client ID and secret into Clerk under User & Authentication > Social connections > Google. Without this, Google's consent screen says "Clerk". Add the authorized redirect URI that Clerk shows.
3. **Turn OFF Organizations > Default naming rules.** With it on, Clerk pre-fills the organization name ("My Organization" or "<name>'s Organization") and onboarding's business-name field starts filled with that. With it off, the field starts empty. The app also renames the Clerk organization to the business name when the business is saved, and fixes existing default-named organizations when an admin next opens the dashboard.
4. **Bot protection / CAPTCHA.** Under Configure > Attack protection, decide whether sign-up bot protection (Turnstile) is on, and keep it consistent with the app's own `TURNSTILE_*` chat protection settings. Note the production Turnstile site key's allowed domains.
5. **Organizations settings.** Confirm Organizations are enabled, that members can create organizations only if you want them to (this affects the one-trial-per-organization rule), and that the roles used by the app exist: `org:admin` and `org:member`, plus the custom `org:sales_agent` and `org:analyst_viewer`.
6. **Supabase JWT template / integration.** The app sends Clerk's own session token to Supabase (`getToken()` with no custom template name, `lib/supabase/server.ts`), so there is no named template to copy. Instead, enable Clerk's Supabase integration for the production instance (Clerk Dashboard > Integrations > Supabase), and in the production Supabase project add Clerk as a third-party auth provider using the production Clerk domain (Authentication > Third-party auth). Then sign in on production and confirm a dashboard page loads data. If the production Clerk domain is not registered in Supabase, every dashboard query returns nothing or fails row-level security.
7. **Test sign-up in more than one browser.** Complete a full sign-up (email and Google), organization creation and onboarding step 1 in Chrome, Edge, Safari and a mobile browser. Some embedded or in-app browsers show Turnstile error `600010`. If one does, record which one and decide whether to tell those visitors to open the link in their normal browser.
8. **Swap the production keys on the VPS and rebuild.** In the VPS environment file (section 9), set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to the production instance's `pk_live_` and `sk_live_` values, and update any Clerk webhook signing secret. `NEXT_PUBLIC_*` values are baked in at build time, so run `npm run build` and `pm2 reload ai-pilot`, then sign out and back in on the production URL. Do not put the secret key in any `NEXT_PUBLIC_*` variable.

## 9. VPS: process manager, logs and region
Decided 2026-11-21: production runs on our own Google Cloud VM in Mumbai (`asia-south1`) with Node and PM2, not on Vercel. The database moves to Mumbai too, so the app and the database are in the same region.

**Region.** Before launch, create the new production Supabase project in `ap-south-1` (Mumbai) and retire the Seoul one (`ap-northeast-2`):
1. Add the new project ref to `supabase/production-project-refs.txt` and commit it (every script and test then refuses to run against it).
2. Link it and run `npx supabase db push`, then follow section 6 (pg_cron jobs, `platform_admins`, backups).
3. Point the VM's environment file at it (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`), rebuild and reload.
4. Add the production Clerk domain as a third-party auth provider in the new project (section 8, step 6).

Gemini needs no region setting. Measured on 2026-11-21: from India each browser request to the Seoul functions cost about 0.25 s of distance alone, and the database round trips in production took 120-370 ms per stage. Both should drop once the app and the database sit together in Mumbai.

**PM2: one process on a small VM.** On an `e2-small` or `e2-medium` (2 vCPU, 2-4 GB), run a single Next.js process (`exec_mode: "fork"`, `instances: 1`). This app spends its time waiting on the database and Gemini rather than on the CPU, so one Node process copes with it. Each extra worker adds another 300-600 MB and its own copy of the in-memory caches (the 30 s widget key cache). Switch to `exec_mode: "cluster"` with `instances: 2` only on a VM with at least 2 vCPU and 4 GB, and only if the timing logs or `pm2 monit` show the CPU is the bottleneck. In cluster mode, deploy with `pm2 reload` for zero-downtime restarts.

`ecosystem.config.cjs` on the server (secrets stay in the environment file next to the app, never in this file):

```js
module.exports = {
  apps: [
    {
      name: "ai-pilot",
      cwd: "/srv/ai-pilot",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "1G",
      // A widget reply may stream for up to 60 s, and after() work runs once
      // the response is sent: give both time to finish on restart.
      kill_timeout: 65000,
      env: { NODE_ENV: "production", APP_ENV: "production" },
      out_file: "/var/log/ai-pilot/out.log",
      error_file: "/var/log/ai-pilot/error.log",
      merge_logs: true,
    },
  ],
};
```

Start it, and make it survive reboots:

```bash
sudo mkdir -p /var/log/ai-pilot && sudo chown "$USER" /var/log/ai-pilot
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # run the command it prints
```

Deploy: `git pull && npm ci && npm run build && pm2 reload ai-pilot`.

**Logs and rotation.** Every log line, including the timing logs, is written to stdout and ends up in `/var/log/ai-pilot/out.log` (errors go to `error.log`). Rotate both:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
```

Don't set `log_date_format`. The app's lines are one JSON object each, and the timing lines carry their own `at` timestamp.

**Timing logs.** One `request_timing` line per widget reply (`api_chat`), test-chat turn (`sandbox_chat`), onboarding render and action (`onboarding_*`), and product/service/FAQ add (`catalog_create_*`). The dashboard polls (`dashboard_*_poll`) log only when a request is slow (1 s or more) or is the first after a restart. Each line has `at`, `name`, `outcome`, `totalMs`, `cold`, `instanceAgeMs`, `processUptimeMs` and per-stage `stages`. There are no ids, names, contacts or message text. On the VPS `cold` is `true` only for the first request after a start or reload, and `false` from then on.

```bash
grep '"event":"request_timing"' /var/log/ai-pilot/out.log | tail -50
# slowest widget replies today (needs jq)
grep '"event":"request_timing"' /var/log/ai-pilot/out.log | jq -s -c 'map(select(.name=="api_chat")) | sort_by(.totalMs) | .[-10:][] | {at,totalMs,cold,stages}'
```

Widget replies also store `at_first_model_text` and `at_first_visible_text` in `ai_response_metrics.stage_timings`. The gap between the two is how long the booking-claim sentence check holds back the first words.

**nginx:** keep `proxy_buffering off` and no `gzip` for `text/event-stream` on `/api/chat` (section 2), or replies arrive all at once.
