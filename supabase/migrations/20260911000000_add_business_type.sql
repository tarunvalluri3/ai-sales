-- Business type/industry (user-requested, 2026-09-11): standard SaaS
-- onboarding asks for this to personalize the experience -- this product had
-- no such field anywhere. Descriptive/display-only for now: not read by
-- lib/rag.ts or any AI behavior, matching the same "dashboard-display-only"
-- precedent as description/contact/website (20260813140000).
--
-- Closed-enum text + check constraint, same convention as
-- widget_position/widget_language (20260822000000) -- no native Postgres
-- enum type. `not null default 'other'` gives every existing business row a
-- safe, honest value with no backfill guesswork; it's then editable both at
-- onboarding (new businesses) and on /dashboard/profile (existing ones).
alter table public.businesses
  add column business_type text not null default 'other';

alter table public.businesses
  add constraint businesses_business_type_check
    check (business_type in (
      'ecommerce', 'professional_services', 'healthcare', 'education',
      'real_estate', 'hospitality', 'finance', 'technology', 'retail', 'other'
    ));

-- Same mechanism as every other business-profile column: the existing
-- businesses_update_own_org RLS policy (Phase 11) already permits UPDATE on
-- org-matched rows at the row level; this column-level GRANT is what
-- actually lets `authenticated` touch this column. org:admin-only
-- enforcement happens at the application layer.
grant update (business_type) on public.businesses to authenticated;
