-- Stalled-lead sweep starvation fix (2026-10-20). Adds the "last attempt"
-- timestamp the sweep (lib/stalled-leads.ts) needs to rotate through its
-- candidates instead of retrying the same ones forever.
--
-- The bug. The sweep selects the 25 oldest leads with follow_up_sent_at
-- null. 20260910000000 deliberately leaves that column null after every
-- blocked_* outcome (no WhatsApp template, Instagram window closed,
-- email suppressed, no contact channel) so the lead is retried later --
-- and the same is true of leads skipped as a sandbox conversation. Once 25
-- such leads exist they fill every slot of every daily run, oldest first,
-- forever: no newer lead is ever picked up.
--
-- The fix is to track the last ATTEMPT separately from the last SUCCESS.
-- follow_up_sent_at keeps its meaning (the at-most-once send gate, set only
-- when a send genuinely happened). follow_up_attempted_at is stamped by the
-- sweep on every lead it examines, whatever the outcome, and the sweep
-- skips anything attempted inside a cooldown window and orders the rest
-- least-recently-attempted first (never-attempted leads before all of
-- them). The retry behaviour is unchanged; only its scheduling is.
--
-- NO BACKFILL, on purpose. Every existing lead keeps null, and null sorts
-- first, so the first sweep after this deploys picks exactly the same 25
-- leads it would have picked before (null, then oldest created_at),
-- stamps them, and from the next run those 25 sit behind every
-- never-attempted lead. Rotation starts on its own. A backfill would only
-- invent attempt times that never happened.
--
-- No new grant needed: the existing table-level grant on leads already
-- covers a new column (see 20260910030000_add_appointment_booked_to_leads),
-- and tenants can already write follow_up_sent_at on their own rows by the
-- same grant, so this widens nothing. Only the service-role sweep writes it.
--
-- Rollback (additive migration, so a new forward migration reverses it --
-- docs/deployment.md §3a): drop index public.leads_follow_up_sweep_idx;
-- alter table public.leads drop column follow_up_attempted_at;
-- The previous application code never reads the column, so rolling the
-- schema back is safe on its own; rolling the code back first is also safe.
alter table public.leads
  add column follow_up_attempted_at timestamptz;

-- leads' only indexes are on business_id, conversation_id and customer_id,
-- none of which serves a cross-tenant sweep, so this is a new index rather
-- than an extension of one. It matches the sweep's WHERE and ORDER BY
-- exactly: partial on the not-yet-sent, still-open leads (a small and
-- shrinking slice of the table), ordered attempted-at nulls first, then
-- created_at. Nulls first is stated explicitly because ascending order
-- defaults to nulls last.
create index leads_follow_up_sweep_idx
  on public.leads (follow_up_attempted_at nulls first, created_at)
  where follow_up_sent_at is null and status in ('new', 'contacted');
