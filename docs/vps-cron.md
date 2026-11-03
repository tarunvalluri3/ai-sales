# Background jobs: scheduler and VPS cron setup

Production readiness, item 3 (LAUNCH_AUDIT.md §2, blocker B3). Read this before setting up the production server.

## How it works

Every background job (queues, retries, SLA, appointment reminders, billing cancellations, daily digest ...) is registered in `lib/scheduler/jobs.ts` with its own schedule. One authenticated endpoint runs whatever is due:

```
POST /api/cron/run            (GET also works)
Authorization: Bearer $CRON_SECRET
```

- **Call it every 1–2 minutes.** Each job runs only when its own schedule says so (`every 60 s`, `every 15 min`, `daily at 04:00 UTC` ...), so calling more often never runs a job more often than intended, and the once-a-day digest still goes out once a day.
- **Overlap-safe.** Each job takes a lease in `public.scheduled_job_runs` before running. A second trigger (an overlapping cron tick, a second server, a manual call) skips a job that is already running. A lease expires by itself, so a killed run never blocks a job.
- **Isolated, timed out, retried.** Jobs run independently; one failing or hanging never stops the others. Each attempt has a timeout under 60 s; a failed attempt is retried once in the same run (the digest is never retried, so nobody gets it twice).
- **Visible failures.** Every failure logs `scheduler_job_failed` at error level (Sentry). Three consecutive failures of the same job log `scheduler_job_failing`. Rows a dead instance left in `processing` are put back to `pending` after 15 minutes (`release_stale_queue_claims`).
- **Optional subset:** `?jobs=whatsapp_outbound,instagram_outbound` runs only those jobs. Unknown names return 400.
- Unauthenticated requests get **404**. A `CRON_SECRET` shorter than 16 characters is refused (and logs `cron_secret_too_short`).

`vercel.json` keeps only its existing **daily** cron (`0 4 * * *` → `/api/cron/process-ingestion-queue`, which runs the same scheduler). Do **not** add a sub-daily schedule there: Vercel Hobby rejects it at deploy time.

## Prerequisites

1. Migrations `20261115000000` and `20261116000000` (and the later ones on this branch) applied to the target database.
2. Environment on the server:
   - `CRON_SECRET` — at least 16 characters. Generate: `openssl rand -base64 32`
   - `APP_ENV=production` (the server refuses to start without it when `NODE_ENV=production` and `VERCEL_ENV` is unset)
   - `NEXT_PUBLIC_APP_URL=https://aipilot.waveswebstudio.in` **at build time** (email links)

## Option A: crontab (simplest)

Create `/etc/ai-sales/cron.env`, readable only by the user that runs cron:

```sh
sudo install -d -m 700 -o deploy /etc/ai-sales
sudo -u deploy sh -c 'umask 077; printf "CRON_SECRET=%s\nAPP_URL=%s\n" "<the secret>" "https://aipilot.waveswebstudio.in" > /etc/ai-sales/cron.env'
```

Create `/usr/local/bin/ai-sales-cron` (mode 755):

```sh
#!/bin/sh
# Triggers the AI Sales scheduler. flock stops a slow run from stacking up
# behind the next tick; the server-side leases make it safe either way.
set -eu
. /etc/ai-sales/cron.env
exec flock -n /tmp/ai-sales-cron.lock \
  curl -fsS --max-time 75 -X POST \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    "${APP_URL}/api/cron/run" -o /dev/null -w "%{http_code} %{time_total}s\n"
```

Then `crontab -e` as that user:

```cron
# AI Sales background jobs, every 2 minutes
*/2 * * * * /usr/local/bin/ai-sales-cron >> /var/log/ai-sales-cron.log 2>&1
```

Rotate the log (`/etc/logrotate.d/ai-sales-cron`):

```
/var/log/ai-sales-cron.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
}
```

The secret never appears in the crontab or the process list (it's read from the env file, and only in the request header).

## Option B: systemd timer

`/etc/systemd/system/ai-sales-cron.service`:

```ini
[Unit]
Description=AI Sales scheduler trigger
After=network-online.target

[Service]
Type=oneshot
User=deploy
EnvironmentFile=/etc/ai-sales/cron.env
ExecStart=/usr/bin/curl -fsS --max-time 75 -X POST -H "Authorization: Bearer ${CRON_SECRET}" ${APP_URL}/api/cron/run -o /dev/null
```

`/etc/systemd/system/ai-sales-cron.timer`:

```ini
[Unit]
Description=Run the AI Sales scheduler every 2 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
AccuracySec=10s

[Install]
WantedBy=timers.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now ai-sales-cron.timer
systemctl list-timers ai-sales-cron.timer
journalctl -u ai-sales-cron.service -n 20
```

systemd never starts a oneshot service that is still running, so ticks can't overlap.

## Verify

```sh
. /etc/ai-sales/cron.env
curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/run" | head -c 2000
```

Expect `{"ok":true,"data":{"ownerId":"run_…","jobs":[{"job":"knowledge_ingestion","status":"succeeded",…},{"job":"daily_digest","status":"not_due",…}]}}`. Statuses: `succeeded`, `failed`, `timed_out`, `not_due`, `locked` (another run has it), `skipped` (filtered out by `?jobs=`).

Without the header you must get `404`.

Then check `/apache/jobs` → **Scheduler** for each job's last run, last success and consecutive failures.

## nginx

The endpoint must not be cached or buffered past the timeout:

```nginx
location = /api/cron/run {
  proxy_pass http://127.0.0.1:3000;
  proxy_read_timeout 90s;
  proxy_buffering off;
  proxy_set_header X-Real-IP $remote_addr;         # with CLIENT_IP_SOURCE=x-real-ip in the app env
  proxy_set_header X-Forwarded-For $remote_addr;   # overwrite, never append
  proxy_set_header Host $host;
}
```

## Alerts to create in Sentry

Issue alerts on these event messages (all logged at error level):

| Event | Meaning |
|---|---|
| `scheduler_job_failing` | a job failed 3 runs in a row |
| `scheduler_job_failed` | any job attempt failed or timed out |
| `cron_secret_too_short` | the scheduler refuses every trigger |
| `whatsapp_reply_failed`, `instagram_reply_failed` | an AI reply failed; the fallback was sent and the conversation flagged |
| `*_delivery_dead_lettered` | an outbound message gave up after 5 attempts |
| `billing_cancellation_failed` | a deleted business's Razorpay subscription could not be cancelled |

Also point UptimeRobot (or similar) at `/api/health?deep=1` so a stopped scheduler shows up (see `app/api/health/route.ts`).
