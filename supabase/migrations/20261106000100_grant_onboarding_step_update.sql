-- Bugfix for 20261106000000_add_onboarding_step.sql: that migration added
-- `onboarding_step`/`onboarding_completed_at` but, unlike every other
-- business-owned column added after the RLS policy existed (see
-- 20260813130000, 20260821060000, 20260911000000, 20261019000000), never
-- granted column-level UPDATE on them to `authenticated`. The row-level
-- `businesses_update_own_org` policy (20260813130000) only governs which
-- ROWS a user may touch -- Postgres's column-level GRANT is the separate
-- mechanism that governs which COLUMNS, and RLS alone can't substitute
-- for it. Without this grant, `saveOnboardingStep()` (lib/business.ts),
-- which runs as the authenticated user via Supabase's Clerk integration
-- (never the service role), fails on every call with a permission error
-- -- surfaced to the user as "Something went wrong saving your onboarding
-- progress." Found live during manual onboarding-wizard testing,
-- 2026-10-29.
--
-- ROLLBACK:
--   revoke update (onboarding_step, onboarding_completed_at) on public.businesses from authenticated;

grant update (onboarding_step, onboarding_completed_at) on public.businesses to authenticated;
