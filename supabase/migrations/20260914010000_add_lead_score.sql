-- Exposes the raw numeric point value lib/lead-scoring.ts's scoreLead()
-- already computes internally but previously discarded, keeping only the
-- 3-tier hot/warm/cold bucket. `score` is the same AI-generated,
-- untrusted, display-only signal as `qualification`/`qualification_reason`
-- (PRODUCT.md §8) -- never a gate for authorization or tenant scoping,
-- just a finer-grained sort key than three buckets.
--
-- Backfilled here (not left at a bare default) using the same rubric
-- lib/lead-scoring.ts applies going forward, computed from columns
-- already on `leads` plus a join to `conversations.needs_attention` (the
-- one signal scoreLead() needs that isn't stored on `leads` itself) --
-- existing leads get an accurate score immediately rather than showing
-- 0 next to an already-"hot" lead until its next update.

alter table public.leads add column score integer not null default 0;

update public.leads l
set score =
  (case when l.appointment_booked then 4 else 0 end) +
  (case when l.requested_callback then 2 else 0 end) +
  (case when l.contact_email is not null and l.contact_phone is not null then 1 else 0 end) +
  (case when c.needs_attention then 1 else 0 end) +
  (case when l.interest_type is not null then 1 else 0 end)
from public.conversations c
where c.id = l.conversation_id;
