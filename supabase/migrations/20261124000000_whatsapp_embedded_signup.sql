-- Production readiness item 6 (2026-11-03): WhatsApp Embedded Signup and
-- per-business template status. lib/whatsapp-embedded-signup.ts.
--
-- 1. whatsapp_connections: how the number was connected and how far the
--    automatic setup got, so a failed step is visible and can be retried
--    ("Finish setup") with the stored token -- the signup code itself lives
--    only 30 seconds.
-- 2. whatsapp_credentials: the number's two-step verification PIN we set at
--    registration, encrypted with META_TOKEN_ENCRYPTION_KEY (same AES-256-GCM
--    format as the token). Needed to re-register the number later. Still a
--    zero-grant table (service role only).
-- 3. whatsapp_template_statuses: each business's message templates as Meta
--    reports them (approved / pending / rejected ...). The owner can READ their
--    own rows; only the server (service role) writes them.
--
-- Dated after 20261123000000 (not today): see docs/deployment.md 2d.

alter table public.whatsapp_connections
  add column onboarding_method text not null default 'manual'
    check (onboarding_method in ('manual', 'embedded_signup')),
  add column setup_step text
    check (setup_step in ('token_exchanged', 'phone_verified', 'waba_subscribed', 'complete')),
  add column setup_error text,
  add column meta_business_id text;

comment on column public.whatsapp_connections.setup_step is
  'Embedded Signup progress: the last step that SUCCEEDED. complete = number registered and receiving. Null for manual connections.';

alter table public.whatsapp_credentials
  add column registration_pin_encrypted text;

create table public.whatsapp_template_statuses (
  business_id uuid not null references public.businesses (id) on delete cascade,
  waba_id text not null,
  template_name text not null check (template_name ~ '^[a-z0-9_]{1,512}$'),
  language text not null,
  status text not null,
  category text,
  rejected_reason text,
  meta_template_id text,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (business_id, template_name, language)
);

create index whatsapp_template_statuses_waba_idx on public.whatsapp_template_statuses (waba_id);

alter table public.whatsapp_template_statuses enable row level security;
alter table public.whatsapp_template_statuses force row level security;

revoke all on public.whatsapp_template_statuses from anon, authenticated;
grant select on public.whatsapp_template_statuses to authenticated;

create policy "whatsapp_template_statuses_select_own_business" on public.whatsapp_template_statuses
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
