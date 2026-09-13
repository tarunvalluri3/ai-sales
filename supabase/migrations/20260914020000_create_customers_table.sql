-- Phase 28 (Customer Intelligence foundation): a business-scoped
-- customer/prospect identity that aggregates conversations, leads, and
-- appointments across channels (website/WhatsApp/Instagram). Matching is
-- deliberately conservative -- exact normalized email or phone equality
-- only, the same rule lib/leads.ts's existing "possibly the same
-- prospect" dashboard hint already uses (phoneMatchKey: last-10-digit
-- suffix; emailMatchKey: trim+lowercase). No fuzzy/AI merging: if a new
-- lead/appointment's contact info doesn't match any existing customer
-- for this business, a new customer row is created rather than guessed
-- at, per the task's explicit "if identity cannot be confidently
-- resolved, retain separate profiles" instruction.
--
-- `email_key`/`phone_key` are generated columns (not app-computed and
-- written redundantly) so the match key can never drift out of sync
-- with the raw value, and so the same normalization is trivially
-- reusable from both application code and this migration's own backfill
-- below -- one source of truth, expressed once, in SQL.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  display_name text,
  email text,
  phone text,
  email_key text generated always as (
    case when email is null then null else lower(trim(email)) end
  ) stored,
  phone_key text generated always as (
    case
      when phone is null then null
      when length(regexp_replace(phone, '\D', '', 'g')) < 7 then null
      when length(regexp_replace(phone, '\D', '', 'g')) > 10
        then right(regexp_replace(phone, '\D', '', 'g'), 10)
      else regexp_replace(phone, '\D', '', 'g')
    end
  ) stored,
  first_seen_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_business_id_idx on public.customers (business_id);
create index customers_business_id_last_activity_idx on public.customers (business_id, last_activity_at desc);

-- Deterministic find-or-create lookups at write time: one customer per
-- normalized key per business (never globally unique -- a key collision
-- across two different businesses must never link them).
create unique index customers_business_id_email_key_idx on public.customers (business_id, email_key) where email_key is not null;
create unique index customers_business_id_phone_key_idx on public.customers (business_id, phone_key) where phone_key is not null;

create trigger customers_set_updated_at
  before update on public.customers
  for each row
  execute function public.set_updated_at();

alter table public.customers enable row level security;
alter table public.customers force row level security;

-- Customers are only ever created by the trusted server-side identity
-- resolution path (service-role client on the widget/AI-tool path, same
-- as leads/appointments themselves) -- never directly by a dashboard
-- action, so `authenticated` gets no insert/delete grant. `UPDATE` is
-- column-scoped to `display_name` only, letting staff correct a
-- prospect's name without ever letting them rewrite the identity keys
-- a business relies on for matching.
grant select on public.customers to authenticated;
grant update (display_name) on public.customers to authenticated;

create policy "customers_select_own_business" on public.customers
  for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses
      where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );

create policy "customers_update_own_business" on public.customers
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

-- Link leads/conversations/appointments to a customer. Nullable and
-- `on delete set null`: losing the customer row must never cascade into
-- losing the underlying business record it was linked from.
alter table public.leads add column customer_id uuid references public.customers (id) on delete set null;
create index leads_customer_id_idx on public.leads (customer_id);

alter table public.conversations add column customer_id uuid references public.customers (id) on delete set null;
create index conversations_customer_id_idx on public.conversations (customer_id);

alter table public.appointments add column customer_id uuid references public.customers (id) on delete set null;
create index appointments_customer_id_idx on public.appointments (customer_id);

-- One-time backfill for pre-existing rows, mirroring exactly the
-- find-or-create order the application layer uses going forward
-- (lib/customers.ts's resolveOrCreateCustomer: try email match, then
-- phone match, else create) -- so historical and newly-created customers
-- are linked by the identical rule, processed oldest-first per business
-- so an early lead's contact info seeds the customer record subsequent
-- rows then match against.
do $$
declare
  r record;
  v_customer_id uuid;
  v_email_key text;
  v_phone_key text;
begin
  for r in select * from public.leads order by business_id, created_at loop
    v_email_key := case when r.contact_email is null then null else lower(trim(r.contact_email)) end;
    v_phone_key := case
      when r.contact_phone is null then null
      when length(regexp_replace(r.contact_phone, '\D', '', 'g')) < 7 then null
      when length(regexp_replace(r.contact_phone, '\D', '', 'g')) > 10
        then right(regexp_replace(r.contact_phone, '\D', '', 'g'), 10)
      else regexp_replace(r.contact_phone, '\D', '', 'g')
    end;

    v_customer_id := null;

    if v_email_key is not null then
      select id into v_customer_id from public.customers
      where business_id = r.business_id and email_key = v_email_key limit 1;
    end if;

    if v_customer_id is null and v_phone_key is not null then
      select id into v_customer_id from public.customers
      where business_id = r.business_id and phone_key = v_phone_key limit 1;
    end if;

    if v_customer_id is null then
      insert into public.customers (business_id, display_name, email, phone, first_seen_at, last_activity_at)
      values (r.business_id, r.contact_name, r.contact_email, r.contact_phone, r.created_at, r.updated_at)
      returning id into v_customer_id;
    else
      update public.customers
      set
        display_name = coalesce(display_name, r.contact_name),
        email = coalesce(email, r.contact_email),
        phone = coalesce(phone, r.contact_phone),
        last_activity_at = greatest(last_activity_at, r.updated_at)
      where id = v_customer_id;
    end if;

    update public.leads set customer_id = v_customer_id where id = r.id;
  end loop;

  -- Appointments: same resolution, so an appointment-only contact (never
  -- a lead) still gets a customer, and one whose contact info matches an
  -- existing lead links to that same customer.
  for r in select * from public.appointments order by business_id, created_at loop
    v_email_key := case when r.contact_email is null then null else lower(trim(r.contact_email)) end;
    v_phone_key := case
      when r.contact_phone is null then null
      when length(regexp_replace(r.contact_phone, '\D', '', 'g')) < 7 then null
      when length(regexp_replace(r.contact_phone, '\D', '', 'g')) > 10
        then right(regexp_replace(r.contact_phone, '\D', '', 'g'), 10)
      else regexp_replace(r.contact_phone, '\D', '', 'g')
    end;

    v_customer_id := null;

    if v_email_key is not null then
      select id into v_customer_id from public.customers
      where business_id = r.business_id and email_key = v_email_key limit 1;
    end if;

    if v_customer_id is null and v_phone_key is not null then
      select id into v_customer_id from public.customers
      where business_id = r.business_id and phone_key = v_phone_key limit 1;
    end if;

    if v_customer_id is null then
      insert into public.customers (business_id, display_name, email, phone, first_seen_at, last_activity_at)
      values (r.business_id, r.contact_name, r.contact_email, r.contact_phone, r.created_at, r.updated_at)
      returning id into v_customer_id;
    else
      update public.customers
      set
        display_name = coalesce(display_name, r.contact_name),
        email = coalesce(email, r.contact_email),
        phone = coalesce(phone, r.contact_phone),
        last_activity_at = greatest(last_activity_at, r.updated_at)
      where id = v_customer_id;
    end if;

    update public.appointments set customer_id = v_customer_id where id = r.id;
  end loop;

  -- Conversations inherit their lead's customer (1:1), then fall back to
  -- their appointment's, for the (rarer) case of a booking with no lead.
  update public.conversations c
  set customer_id = l.customer_id
  from public.leads l
  where l.conversation_id = c.id and l.customer_id is not null and c.customer_id is null;

  update public.conversations c
  set customer_id = a.customer_id
  from public.appointments a
  where a.conversation_id = c.id and a.customer_id is not null and c.customer_id is null;
end $$;

alter table public.audit_log drop constraint audit_log_action_check;

alter table public.audit_log add constraint audit_log_action_check check (
  action in (
    'conversation.control_changed',
    'conversation.attention_dismissed',
    'knowledge.deleted',
    'knowledge.published',
    'knowledge.unpublished',
    'widget_key.created',
    'widget_key.origins_updated',
    'widget_key.revoked',
    'webhook_endpoint.created',
    'webhook_endpoint.deleted',
    'business_hours.updated',
    'widget_branding.updated',
    'business.published',
    'widget_suggested_questions.updated',
    'ai_conversion_goal.updated',
    'appointment_settings.updated',
    'appointment.confirmed',
    'appointment.declined',
    'appointment.cancelled',
    'ai_capabilities.updated',
    'whatsapp_connection.created',
    'whatsapp_connection.deleted',
    'appointment_exception.created',
    'appointment_exception.deleted',
    'appointment.completed',
    'appointment.no_show',
    'appointment_slot_block.created',
    'appointment_slot_block.deleted',
    'instagram_connection.created',
    'instagram_connection.deleted',
    'customer.renamed'
  )
);
