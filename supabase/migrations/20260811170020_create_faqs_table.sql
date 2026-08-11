-- FAQs: business-owned structured knowledge (Phase 5). Same tenant-scoping
-- approach as products/services — see that migration's comments. No price
-- column; question/answer are both required.

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index faqs_business_id_idx on public.faqs (business_id);

create trigger faqs_set_updated_at
  before update on public.faqs
  for each row
  execute function public.set_updated_at();

alter table public.faqs enable row level security;
alter table public.faqs force row level security;

grant select, insert, update, delete on public.faqs to authenticated;

create policy "faqs_select_own_business" on public.faqs
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "faqs_insert_own_business" on public.faqs
  for insert
  to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "faqs_update_own_business" on public.faqs
  for update
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  )
  with check (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "faqs_delete_own_business" on public.faqs
  for delete
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
