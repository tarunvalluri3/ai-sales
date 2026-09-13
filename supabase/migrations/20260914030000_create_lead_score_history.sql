-- Phase 28 follow-up: itemized, timestamped lead-score history.
-- lib/lead-scoring.ts's scoreLead() already computes a deterministic
-- point-by-point breakdown internally (booked an appointment, requested
-- a callback, ...) but previously discarded everything except the final
-- number/tier. This table persists that breakdown every time a lead's
-- score genuinely changes, so the dashboard can show *why* a score is
-- what it is (deterministic reasons, never an AI-invented one) and how
-- it moved over time -- both required by the Customer Intelligence
-- scope's score-reasons/score-history requirement, and by the Sales
-- Copilot's deterministic priority layer (Phase 30) once it exists.
--
-- Write-only from the service role, same posture as `needs_attention`:
-- scoring is always computed server-side in `upsertLeadForConversation`,
-- never staff-initiated, so `authenticated` gets read access only.

create table public.lead_score_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  score integer not null,
  qualification text not null check (qualification in ('hot', 'warm', 'cold')),
  reasons jsonb not null,
  created_at timestamptz not null default now()
);

create index lead_score_history_lead_id_idx on public.lead_score_history (lead_id, created_at desc);
create index lead_score_history_business_id_idx on public.lead_score_history (business_id);

alter table public.lead_score_history enable row level security;
alter table public.lead_score_history force row level security;

grant select on public.lead_score_history to authenticated;

create policy "lead_score_history_select_own_business" on public.lead_score_history
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

-- Backfill one initial history row per existing lead from its
-- already-stored score/qualification, so the history view isn't empty
-- for every lead that existed before this migration. No itemized
-- `reasons` breakdown exists for these pre-migration rows (only the
-- combined sentence in `qualification_reason` was ever stored) -- recorded
-- honestly as a single "carried over from before score history existed"
-- reason rather than fabricated point-by-point detail.
insert into public.lead_score_history (business_id, lead_id, score, qualification, reasons, created_at)
select
  business_id,
  id,
  score,
  qualification,
  jsonb_build_array(jsonb_build_object('label', 'Carried over from before score history existed', 'points', score)),
  updated_at
from public.leads;
