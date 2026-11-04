-- Production readiness round 3, item 2 (2026-11-03 owner decision): ONE free
-- trial per Clerk USER, in addition to one per Clerk organisation
-- (20261121000000). A user who deletes their organisation, or creates a new
-- one, cannot start a second trial.
--
-- Identity: the Clerk user ID is the `sub` claim of the verified session JWT
-- the business insert runs under (lib/business.ts createBusinessForOrg uses
-- the Clerk-authenticated Supabase client). It is read inside the trigger, so
-- no client-supplied value is ever trusted. No email-domain rule (owner
-- decision).
--
-- Concurrency: both grants are primary-key inserts in the same transaction as
-- the business insert. Two simultaneous inserts by the same user (in two
-- organisations) both reach the trial_user_grants insert; the second waits on
-- the first's uncommitted key, then gets `on conflict do nothing` (0 rows) and
-- falls through to the 'expired' path -- exactly one trial. When the org grant
-- succeeded but the user grant did not, the org grant is removed again so the
-- organisation is not marked as having had a trial it never got.
--
-- No `sub` (a service-role or SQL insert: platform tooling, seeds, pgTAP) keeps
-- the previous org-only rule. Real sign-ups always carry `sub`.
--
-- Backfill: none is possible. Businesses never recorded which user created
-- them, so users who started a trial before this migration are not blocked
-- from one more trial in a NEW organisation (a one-off gap; the org rule still
-- blocks the same organisation).
--
-- Paid plans and existing trials are untouched: this only changes what a NEW
-- business gets at insert.
--
-- Rollback: restore create_trial_subscription_for_new_business() from
-- 20261121000000, then drop table public.trial_user_grants.

create table public.trial_user_grants (
  clerk_user_id text primary key,
  -- The organisation and business the trial went to. No FK on purpose: the
  -- row must survive deleting the business or the organisation.
  clerk_org_id text not null,
  first_business_id uuid not null,
  granted_at timestamptz not null default now()
);

comment on table public.trial_user_grants is
  'One row per Clerk user who has ever started a free trial. No FK: it must survive business/organisation deletion so a new organisation cannot restart the trial. Service-role only.';

alter table public.trial_user_grants enable row level security;
alter table public.trial_user_grants force row level security;

revoke all on public.trial_user_grants from anon, authenticated;
create policy trial_user_grants_no_client_access
  on public.trial_user_grants
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Replaces the 20261121000000 function. Still SECURITY DEFINER with a pinned
-- search_path, still a fixed write for new.id only; the trigger is unchanged.
create or replace function public.create_trial_subscription_for_new_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := nullif(btrim(coalesce((select auth.jwt()) ->> 'sub', '')), '');
  org_granted integer;
  user_granted integer := 1;
begin
  insert into public.trial_grants (clerk_org_id, first_business_id)
  values (new.clerk_org_id, new.id)
  on conflict (clerk_org_id) do nothing;
  get diagnostics org_granted = row_count;

  if org_granted = 1 and v_user_id is not null then
    insert into public.trial_user_grants (clerk_user_id, clerk_org_id, first_business_id)
    values (v_user_id, new.clerk_org_id, new.id)
    on conflict (clerk_user_id) do nothing;
    get diagnostics user_granted = row_count;

    if user_granted = 0 then
      -- This user already had a trial: undo the org grant written above.
      delete from public.trial_grants
      where clerk_org_id = new.clerk_org_id and first_business_id = new.id;
    end if;
  end if;

  if org_granted = 1 and user_granted = 1 then
    insert into public.subscriptions (
      business_id, plan_key, status, trial_started_at, trial_ends_at
    )
    values (
      new.id, 'starter', 'trialing', now(), now() + interval '14 days'
    )
    on conflict (business_id) do nothing;
  else
    -- Same 'expired' shape as 20261121000000: never serving, surfaced in the
    -- app as `trial_already_used` with the paid plans to choose from.
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
