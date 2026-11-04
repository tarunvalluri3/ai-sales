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
journalctl -u <service> --since "1 hour ago" | grep ig_connect_
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
