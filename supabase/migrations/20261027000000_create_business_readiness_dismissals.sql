-- Onboarding readiness (feat/onboarding-readiness): the explicit
-- "this doesn't apply to us" acknowledgement for a dismissible readiness
-- item (lib/onboarding-readiness.ts DISMISSIBLE_ITEM_KEYS -- today only
-- 'catalog_present'). The readiness gate blocks a business's FIRST publish
-- until it has enough real, retrievable knowledge for its AI to face
-- prospects; a business that genuinely sells no fixed catalog can waive the
-- one conditional item rather than being forced to invent a product.
--
-- Only ever records a conditional item. A genuinely-required item
-- (description, knowledge, FAQs) is never dismissible and never written
-- here, so a row in this table can never waive the grounding guarantee.
--
-- Same tenant-isolation shape as public.copilot_dismissals
-- (20260915000000): RLS enable+force, four authenticated policies scoped by
-- clerk_org_id, cascade delete with the business. PK is (business_id,
-- item_key) -- one acknowledgement per item per business, and the upsert
-- target in lib/onboarding-readiness-data.ts. No audit_log action is added:
-- this is a low-stakes, reversible config toggle, not one of Phase 22's
-- sensitive audited actions.
--
-- Rollback: drop table public.business_readiness_dismissals;

create table public.business_readiness_dismissals (
  business_id uuid not null references public.businesses (id) on delete cascade,
  item_key text not null check (item_key in ('catalog_present')),
  dismissed_by text not null,
  dismissed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (business_id, item_key)
);

alter table public.business_readiness_dismissals enable row level security;
alter table public.business_readiness_dismissals force row level security;

grant select, insert, update, delete on public.business_readiness_dismissals to authenticated;

create policy "business_readiness_dismissals_select_own_business" on public.business_readiness_dismissals
  for select to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "business_readiness_dismissals_insert_own_business" on public.business_readiness_dismissals
  for insert to authenticated
  with check (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "business_readiness_dismissals_update_own_business" on public.business_readiness_dismissals
  for update to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')))
  with check (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

create policy "business_readiness_dismissals_delete_own_business" on public.business_readiness_dismissals
  for delete to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));
