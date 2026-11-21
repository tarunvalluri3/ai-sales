begin;
create unique index if not exists knowledge_documents_business_id_id_key
  on public.knowledge_documents (business_id, id);

create table if not exists public.onboarding_website_imports (
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_id uuid not null,
  generation_status text not null default 'idle' check (generation_status in ('idle', 'running', 'failed', 'ready')),
  attempts smallint not null default 0 check (attempts between 0 and 2),
  suggestions jsonb not null default '[]'::jsonb check (jsonb_typeof(suggestions) = 'array'),
  revision integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (business_id, document_id),
  foreign key (business_id, document_id) references public.knowledge_documents(business_id, id) on delete cascade
);

alter table public.knowledge_documents add column if not exists onboarding_website_import boolean not null default false;

-- Initialize review state in the same transaction as the imported document.
create schema if not exists private;
create or replace function private.initialize_onboarding_website_import()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.onboarding_website_imports (business_id, document_id)
    values (new.business_id, new.id)
    on conflict (business_id, document_id) do nothing;
  return new;
end;
$$;
revoke all on function private.initialize_onboarding_website_import() from public, anon, authenticated;
drop trigger if exists initialize_onboarding_website_import on public.knowledge_documents;
create trigger initialize_onboarding_website_import after insert on public.knowledge_documents
  for each row when (new.source_type = 'url' and new.onboarding_website_import)
  execute function private.initialize_onboarding_website_import();

alter table public.onboarding_website_imports enable row level security;
revoke all on public.onboarding_website_imports from public, anon, authenticated;
grant select on public.onboarding_website_imports to authenticated;
grant select, insert, update on public.onboarding_website_imports to service_role;
drop policy if exists onboarding_website_imports_read_own on public.onboarding_website_imports;
create policy onboarding_website_imports_read_own on public.onboarding_website_imports
  for select to authenticated using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
commit;
