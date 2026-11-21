-- Seeded weekly hours are a suggestion until the owner saves or confirms.
alter table public.business_hours add column if not exists confirmed_at timestamptz;

-- Use the canonical published signal and compare stored rows to the seeded
-- Monday-Friday schedule, including null times on closed days.
update public.business_hours as hours
   set confirmed_at = coalesce(business.published_at, now())
  from public.businesses as business
 where business.id = hours.business_id
   and hours.confirmed_at is null
   and (
     business.live_version_id is not null
     or exists (
       select 1
         from public.business_hours as saved
        where saved.business_id = business.id
          and (
            saved.is_open is distinct from (saved.day_of_week between 1 and 5)
            or saved.start_time is distinct from (case when saved.day_of_week between 1 and 5 then time '09:00' end)
            or saved.end_time is distinct from (case when saved.day_of_week between 1 and 5 then time '18:00' end)
          )
     )
   );
