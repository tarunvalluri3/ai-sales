-- Production readiness item 2 (2026-11-03): platform-admin deletes in /apache
-- (soft-delete and permanent delete) now use the same Razorpay cancellation,
-- retry and alert path as the owner's delete (lib/billing-cancellation.ts).
-- billing_cancellations.reason gains the two admin reasons. No other change:
-- the table stays service-role only (RLS forced, deny policy, no grants).
--
-- Dated after 20261121000000 (not today): see docs/deployment.md
-- "Migration timestamps".

alter table public.billing_cancellations drop constraint billing_cancellations_reason_check;
alter table public.billing_cancellations add constraint billing_cancellations_reason_check
  check (reason in ('business_deleted', 'admin_soft_deleted', 'admin_hard_deleted'));
