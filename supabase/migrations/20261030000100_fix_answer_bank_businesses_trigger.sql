-- Fix for public.answer_bank_businesses_bump() (migration 20261030000000).
--
-- The trigger function compared `ai_conversion_goal`, a businesses column that
-- 20260901070000_ai_capability_toggles.sql DROPPED long ago (replaced by
-- recommend_products_enabled). Postgres resolves the field at run time, so the
-- migration applied cleanly but every UPDATE on public.businesses -- and every
-- insert/update/delete on products, services, faqs and knowledge_documents,
-- which bump the version by updating the business row -- failed with
--   42703: record "new" has no field "ai_conversion_goal".
-- Found by pgTAP immediately after the migration was applied to production.
--
-- Fix: compare the column that exists. Same signature and grants; the trigger
-- itself is unchanged. No data change.

create or replace function public.answer_bank_businesses_bump()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.name, new.description, new.contact_email, new.contact_phone, new.website,
      new.widget_language, new.widget_suggested_questions, new.published_at,
      new.recommend_products_enabled)
     is distinct from
     (old.name, old.description, old.contact_email, old.contact_phone, old.website,
      old.widget_language, old.widget_suggested_questions, old.published_at,
      old.recommend_products_enabled)
  then
    new.answer_bank_version := old.answer_bank_version + 1;
    insert into public.answer_bank_jobs (business_id)
    values (new.id)
    on conflict (business_id) do update
      set requested_at = now(), attempts = 0;
  end if;
  return new;
end;
$$;

revoke execute on function public.answer_bank_businesses_bump() from public, anon, authenticated;
