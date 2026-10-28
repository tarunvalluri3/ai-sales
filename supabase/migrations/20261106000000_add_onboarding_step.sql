-- Onboarding route guard + resume: a persisted onboarding-step cache on
-- businesses so /onboarding and the dashboard guard can resume a
-- mid-onboarding business without recomputing the full readiness/
-- channels/plan snapshot on every navigation, and so platform-admin
-- tooling can see onboarding progress per tenant later.
--
-- The actual publish gate stays `published_at` (already the single
-- "live" signal -- see lib/business.ts's publishBusinessForOrg and
-- app/(dashboard)/dashboard/widget-settings/publish-button.tsx's
-- Draft/Live label). `businesses.status` ('active'/'suspended', added in
-- 20261103000000) is the UNRELATED platform-admin tenant lifecycle, not
-- publish state -- this migration deliberately does not add a second,
-- conflicting status column.
--
-- ROLLBACK:
--   alter table public.businesses
--     drop column onboarding_step, drop column onboarding_completed_at;

alter table public.businesses
  add column onboarding_step text not null default 'account'
    check (onboarding_step in (
      'account', 'verify', 'business', 'knowledge', 'products',
      'faqs', 'persona', 'channels', 'plan', 'review', 'live'
    )),
  add column onboarding_completed_at timestamptz;

-- Backfill: a business already live before this column existed must not
-- read as mid-onboarding under the new dashboard guard. (The guard itself
-- reads `published_at`, not this column -- this keeps the cache truthful
-- for every pre-existing row too, e.g. for future platform-admin views.)
update public.businesses
set onboarding_step = 'live',
    onboarding_completed_at = coalesce(onboarding_completed_at, published_at)
where published_at is not null;
