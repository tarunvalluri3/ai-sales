begin;
select plan(2);

select lives_ok($$
  insert into public.businesses (clerk_org_id, name, business_type)
  select 'org_industry_080_' || type, 'Industry check', type
    from unnest(array[
      'ecommerce', 'professional_services', 'healthcare', 'education',
      'real_estate', 'hospitality', 'finance', 'technology', 'retail',
      'manufacturing', 'other', 'fitness_wellness', 'salon_beauty'
    ]) as types(type)
$$, 'every previous industry and both new industries are valid');
select throws_ok($$
  insert into public.businesses (clerk_org_id, name, business_type)
  values ('org_industry_080_invalid', 'Industry check', 'unlisted_industry')
$$, '23514', null, 'unlisted industry values remain invalid');

select * from finish();
rollback;
