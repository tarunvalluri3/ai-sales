# Data retention policy

Phase 22d, `STATE.md` / `docs/phases.md`. This is the written policy the Phase 22 brief requires, plus the operational detail for whoever maintains the scheduled job that enforces it.

## Policy

A prospect conversation (its messages, and any lead/contact info captured from it) is retained for **24 months from its last activity** (its most recent message, or its own creation time if it never received a reply). After 24 months of inactivity, the conversation is permanently deleted — no residual row in `conversations`, `messages`, or `leads`.

This applies uniformly, across every business on the platform. It is not currently configurable per business.

Business-level account data (business profile, products, services, FAQs, knowledge documents) is **not** covered by this automatic job — see `docs/security.md` and the Privacy Policy (`/privacy`) for account-level retention, which follows the customer's own account lifecycle instead of a fixed timer.

## Enforcement

Enforced by a Postgres scheduled job (`pg_cron`), not application code — so it runs even if the app itself is down.

- **Migration:** `supabase/migrations/20260820200000_schedule_conversation_retention_cleanup.sql`
- **Function:** `public.delete_expired_conversations()` — `security definer`, computes each conversation's last-activity timestamp (`coalesce(max(messages.created_at), conversations.created_at)`), and hard-deletes every conversation past the 24-month threshold. Deleting the `conversations` row cascades to its `messages` and `leads` rows via their existing `on delete cascade` foreign keys — one delete statement, not three.
- **Schedule:** `cron.job` name `delete-expired-conversations`, `0 3 * * *` (03:00 UTC daily).
- **Scope:** global — the function is not tenant-scoped by design; it is a platform-operated sweep, not a per-business action, so it carries no `authenticated` grant (only the role that owns the cron job can invoke it).

## Changing the retention window

The 24-month window is a literal inside `delete_expired_conversations()`'s SQL body, not an environment variable — a scheduled job runs in Postgres, not in the Next.js app, so `lib/env.ts`'s convention doesn't apply here. To change it: write a new migration that `create or replace function`s the same function with the new interval. Do not edit the existing migration file after it has shipped.

## Verifying the job is running

```sql
select * from cron.job where jobname = 'delete-expired-conversations';
select * from cron.job_run_details where jobname = 'delete-expired-conversations' order by start_time desc limit 20;
```

The second query shows each run's actual start/end time and status — check it after the first scheduled run following any change to this job, rather than assuming the schedule alone means it executed successfully.
