-- Production readiness, plan access and trials (2026-11-03 owner decision):
-- ONE free trial per Clerk organisation, ever -- including after the business
-- is deleted and created again.
--
-- Before this migration the "one trial" guarantee lived on the subscriptions
-- row (trial_started_at is write-once), but that row is cascade-deleted with
-- the business. Deleting the business and re-onboarding inserted a new
-- business, and businesses_create_trial_subscription granted a fresh 14-day
-- trial (LAUNCH_AUDIT.md §4).
--
-- public.trial_grants records every organisation that has had a trial. It has
-- NO foreign key to businesses, so it survives the cascade (the same design as
-- billing_cancellations, 20261119000000). The trigger now inserts into it
-- first; only the insert that actually creates the grant gets a trialing row.
-- Every later business for the same organisation gets an 'expired' row:
-- no paid access until checkout.
--
-- Migration version note: dated after the newest existing migration
-- (20261120000000) rather than today, because migrations up to 20261114000000
-- are already applied in production and `supabase db push` refuses a local
-- migration that sorts before the last applied one. See docs/deployment.md
-- "Migration timestamps".

create table public.trial_grants (
  clerk_org_id text primary key,
  -- The business the trial was granted to. No FK on purpose (see above).
  first_business_id uuid not null,
  granted_at timestamptz not null default now()
);

comment on table public.trial_grants is
  'One row per Clerk organisation that has ever had a free trial. No FK to businesses: it must survive business deletion so a delete + recreate cannot restart the trial. Service-role only.';

alter table public.trial_grants enable row level security;
alter table public.trial_grants force row level security;

revoke all on public.trial_grants from anon, authenticated;
create policy trial_grants_no_client_access
  on public.trial_grants
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Backfill: every organisation that has a business today has already had its
-- trial (or predates billing). Recording them means deleting and re-creating
-- an existing business after this migration does not grant a new trial.
-- Organisations whose business was deleted BEFORE this migration cannot be
-- recovered (nothing recorded them) -- a known, one-off gap.
insert into public.trial_grants (clerk_org_id, first_business_id, granted_at)
select b.clerk_org_id, b.id, coalesce(s.trial_started_at, b.created_at)
from public.businesses b
left join public.subscriptions s on s.business_id = b.id
on conflict (clerk_org_id) do nothing;

-- Replaces the 20261025000000 function. Still SECURITY DEFINER with a pinned
-- search_path, still a fixed write for new.id only; the trigger itself is
-- unchanged and keeps calling this function.
--
-- 'expired' rows need period dates (subscriptions_period_dates_present), so a
-- trial-already-used row gets a zero-length-ish period [now, now + 1 second]:
-- it is never serving, and checkout charges immediately because there is no
-- trial left to defer to (lib/billing-checkout.ts firstChargeAtFor).
create or replace function public.create_trial_subscription_for_new_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  granted integer;
begin
  insert into public.trial_grants (clerk_org_id, first_business_id)
  values (new.clerk_org_id, new.id)
  on conflict (clerk_org_id) do nothing;
  get diagnostics granted = row_count;

  if granted = 1 then
    insert into public.subscriptions (
      business_id, plan_key, status, trial_started_at, trial_ends_at
    )
    values (
      new.id, 'starter', 'trialing', now(), now() + interval '14 days'
    )
    on conflict (business_id) do nothing;
  else
    insert into public.subscriptions (
      business_id, plan_key, status, current_period_start, current_period_end
    )
    values (
      new.id, 'starter', 'expired', now(), now() + interval '1 second'
    )
    on conflict (business_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.create_trial_subscription_for_new_business() from public, anon, authenticated;
