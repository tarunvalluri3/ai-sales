-- Add "Manufacturing" as a business type/industry option (user-requested,
-- 2026-11-09). Same closed-enum-via-check convention as
-- 20260911000000_add_business_type.sql -- widen businesses_business_type_check
-- to accept 'manufacturing' alongside the existing values. No default change,
-- no backfill: existing rows are untouched, 'manufacturing' simply becomes a
-- new selectable value going forward (onboarding + /dashboard/profile).
alter table public.businesses
  drop constraint businesses_business_type_check;

alter table public.businesses
  add constraint businesses_business_type_check
    check (business_type in (
      'ecommerce', 'professional_services', 'healthcare', 'education',
      'real_estate', 'hospitality', 'finance', 'technology', 'retail',
      'manufacturing', 'other'
    ));
