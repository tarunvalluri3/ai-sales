-- Widen the type check without rewriting existing values or changing the default.
-- Both clauses run atomically; applying it again yields the same constraint.
alter table public.businesses
  drop constraint if exists businesses_business_type_check,
  add constraint businesses_business_type_check
    check (business_type in (
      'ecommerce', 'professional_services', 'healthcare', 'education',
      'real_estate', 'hospitality', 'finance', 'technology', 'retail',
      'manufacturing', 'other', 'fitness_wellness', 'salon_beauty'
    ));
