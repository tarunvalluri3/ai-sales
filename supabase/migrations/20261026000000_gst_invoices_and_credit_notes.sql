-- Phase 17c (2026-10-21): GST tax invoices, credit notes, and the gap-free
-- numbering that makes them lawful. Phase 17b moves money in test mode;
-- this is the legal record of that money. LIVE RAZORPAY KEYS STAY BLOCKED
-- UNTIL THIS IS IN PRODUCTION AND ONE REAL PAYMENT HAS BEEN RUN END TO END:
-- charging an Indian business without a GST tax invoice is not lawful.
--
-- What is here:
--   * invoice_counters   -- one row per (series, financial year); the
--                           numbering state. NOT a Postgres SEQUENCE (below).
--                           Four series: invoice, credit_note and their TEST
--                           twins (see "Test-mode documents").
--   * invoices           -- immutable legal records, one per successful payment
--   * credit_notes       -- immutable legal records, one per refund
--   * invoice_holds      -- payments that are owed an invoice we cannot issue
--                           yet (missing customer details / supplier config)
--   * issue_invoice() and issue_credit_note() -- the ONLY way a row gets in
--   * subscriptions.billing_name / billing_address
--   * audit_log_action_check: 55 -> 58 actions
--
-- Rollback (all additive; do it only if no invoice has been issued -- an
-- issued invoice is a legal record and must not be dropped, in which case
-- fix forward instead):
--   drop function public.issue_credit_note(jsonb);
--   drop function public.issue_invoice(jsonb);
--   drop table public.invoice_holds;
--   drop table public.credit_notes;
--   drop table public.invoices;
--   drop table public.invoice_counters;
--   drop function public.reject_legal_record_change();
--   drop function public.guard_invoice_counter();
--   drop function public.guard_credit_note_total();
--   alter table public.subscriptions
--     drop column billing_name, drop column billing_address;
--   -- then re-add audit_log_action_check without this phase's three values.

-- ===================================================================
-- 0. Why a counter row and not a SEQUENCE
-- ===================================================================
--
-- GST requires invoice numbers to be consecutive within a financial year.
-- A Postgres SEQUENCE is deliberately non-transactional: nextval() is never
-- rolled back, so any failed insert (a constraint violation, a crash, a
-- replayed webhook losing a race) permanently burns a number and leaves a
-- gap. Instead each (series, financial year) has ONE counter row that is
-- incremented with INSERT ... ON CONFLICT DO UPDATE inside the same
-- transaction that inserts the invoice. That statement takes a row lock held
-- until commit, so concurrent issuers queue on it, and if the invoice insert
-- fails the whole transaction (or the sub-block, below) rolls back and the
-- increment with it. A number is consumed if and only if an invoice
-- carrying it exists.

-- ===================================================================
-- 0a. Test-mode documents are a separate, marked series
-- ===================================================================
--
-- This app is still in Razorpay TEST mode, against a database that holds
-- real tenants (the CLI and .env.local point at production). A test payment
-- must be able to run all the way to an invoice -- that is how the flow is
-- verified -- but a test payment is not a supply, and an issued invoice can
-- never be deleted. If test invoices drew from the real series they would
-- (a) put fictional supplies into the supplier's books and (b) use up
-- numbers 0001.. of the real series, so the first genuine invoice would not
-- be number 1. So every document carries is_test, test documents draw from
-- their OWN counters and are numbered 'TST/<fy>/<nnnn>' (credit notes
-- 'TSC/...'), and the PDF is stamped TEST DOCUMENT. The real series
-- 'WAP/...' and 'WAC/...' is touched only by live-mode payments.

-- ===================================================================
-- 1. invoice_counters
-- ===================================================================

create table public.invoice_counters (
  series text not null check (series in ('invoice', 'credit_note', 'test_invoice', 'test_credit_note')),
  -- '2026-27' = 1 April 2026 .. 31 March 2027, IST. The second part is
  -- checked against the first so a typo cannot open a bogus series.
  financial_year text not null
    check (financial_year ~ '^[0-9]{4}-[0-9]{2}$')
    check (substr(financial_year, 6, 2)::int = (substr(financial_year, 1, 4)::int + 1) % 100),
  -- 9,999 is the ceiling of the 4-digit format below, and the GST 16
  -- character limit on a document number means there is no room for a fifth
  -- digit: the 10,000th document of a year fails loudly instead of emitting
  -- an illegal 17-character number.
  last_number integer not null check (last_number between 1 and 9999),
  primary key (series, financial_year)
);

alter table public.invoice_counters enable row level security;
alter table public.invoice_counters force row level security;

-- The gap-free guarantee must survive a mistake or a malicious UPDATE by a
-- role that bypasses RLS: the only legal change to a counter is +1, and a
-- counter can never be deleted or truncated (resetting one would re-issue
-- numbers that already exist).
create or replace function public.guard_invoice_counter()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.series <> old.series
       or new.financial_year <> old.financial_year
       or new.last_number <> old.last_number + 1
    then
      raise exception 'invoice_counters may only be incremented by exactly 1 (% % -> %)',
        old.financial_year, old.last_number, new.last_number
        using errcode = 'restrict_violation';
    end if;
    return new;
  end if;
  raise exception 'invoice_counters rows cannot be % -- resetting a counter would re-issue numbers', tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger invoice_counters_guard
  before update or delete on public.invoice_counters
  for each row execute function public.guard_invoice_counter();

create trigger invoice_counters_no_truncate
  before truncate on public.invoice_counters
  for each statement execute function public.guard_invoice_counter();

-- GRANTS: none to anon / authenticated / service_role. Only the two
-- SECURITY DEFINER functions below touch this table.
revoke all on public.invoice_counters from anon, authenticated, service_role;

-- ===================================================================
-- 2. The immutability trigger shared by both legal-record tables
-- ===================================================================
--
-- Invoices and credit notes are never edited or deleted. This is enforced
-- twice, on purpose:
--   1. GRANTS: no client role has UPDATE, DELETE or TRUNCATE -- and the
--      service role has neither those NOR INSERT (it must go through the
--      issue functions, which own the numbering).
--   2. THIS TRIGGER: rejects UPDATE, DELETE and TRUNCATE for everyone,
--      including roles that bypass grants and RLS. Same precedent as the
--      write-once trial_started_at trigger (20261024000000).
-- It cannot stop a database owner running DDL (ALTER TABLE ... DISABLE
-- TRIGGER); nothing in-database can, and that role is not reachable from
-- the application.
create or replace function public.reject_legal_record_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% is an immutable legal record: % is not permitted', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

-- ===================================================================
-- 3. invoices
-- ===================================================================
--
-- NO FOREIGN KEY ON business_id, deliberately. A tax invoice is the
-- supplier's statutory record and must survive the customer deleting its
-- account (GST records are kept for years). A cascade would delete invoices
-- (illegal), and SET NULL is an UPDATE, which the trigger above refuses --
-- either would make deleting a business fail or destroy records. Instead the
-- row carries a full snapshot of the customer, issue_invoice() verifies the
-- business exists at issue time, and RLS (which joins businesses) simply
-- stops showing the invoice to anyone once the business is gone.
--
-- EVERYTHING IS SNAPSHOTTED at issue time -- supplier, customer name,
-- address, state, GSTIN, the line, the SAC, every tax figure, the place of
-- supply -- so an invoice renders identically years later even if the
-- customer renames itself or moves state.
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,

  invoice_number text not null unique,
  financial_year text not null,
  sequence_number integer not null check (sequence_number between 1 and 9999),
  -- The IST calendar date of the payment. The financial year is derived from
  -- THIS in IST, never UTC: a payment at 23:00 IST on 31 March is still the
  -- old year. The check below ties the two together, so a timezone bug in
  -- the application cannot store an invoice in the wrong year's series.
  invoice_date date not null,
  payment_at timestamptz not null,
  issued_at timestamptz not null default now(),

  -- THE IDEMPOTENCY KEY. One successful Razorpay payment can never produce a
  -- second invoice, whatever replays or races reach the issue function.
  razorpay_payment_id text not null unique,
  razorpay_order_id text,
  razorpay_subscription_id text,
  purpose text not null check (purpose in ('subscription_charge', 'annual', 'upgrade_prorata')),
  plan_key text check (plan_key is null or plan_key in ('starter', 'growth', 'scale')),

  service_description text not null check (length(service_description) between 1 and 500),
  sac_code text not null check (sac_code ~ '^[0-9]{4,8}$'),
  service_period_start timestamptz,
  service_period_end timestamptz,

  supplier_name text not null,
  supplier_address text not null,
  supplier_gstin text not null check (supplier_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  supplier_state_code text not null check (supplier_state_code ~ '^[0-9]{2}$'),
  supplier_state_name text not null,

  customer_name text not null check (length(customer_name) between 1 and 200),
  customer_address text not null check (length(customer_address) between 1 and 600),
  customer_state_code text not null check (customer_state_code ~ '^[0-9]{2}$'),
  customer_state_name text not null,
  customer_gstin text check (customer_gstin is null or customer_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),

  place_of_supply_state_code text not null check (place_of_supply_state_code ~ '^[0-9]{2}$'),
  place_of_supply_state_name text not null,
  supply_type text not null check (supply_type in ('intra-state', 'inter-state')),
  reverse_charge boolean not null default false check (reverse_charge = false),
  -- A document for a Razorpay TEST-mode payment. Never a tax document.
  is_test boolean not null default false,

  gst_rate_percent smallint not null check (gst_rate_percent between 0 and 28),
  currency text not null default 'INR' check (currency = 'INR'),
  taxable_paise bigint not null check (taxable_paise >= 0),
  cgst_paise bigint check (cgst_paise is null or cgst_paise >= 0),
  sgst_paise bigint check (sgst_paise is null or sgst_paise >= 0),
  igst_paise bigint check (igst_paise is null or igst_paise >= 0),
  tax_paise bigint not null check (tax_paise >= 0),
  total_paise bigint not null check (total_paise > 0),

  -- (financial_year, sequence_number) is unique PER MODE: a test invoice and
  -- a real one may both be number 1 of a year, and carry different prefixes.
  unique (is_test, financial_year, sequence_number),

  constraint invoices_number_matches_parts check (
    invoice_number = (case when is_test then 'TST' else 'WAP' end)
                     || '/' || financial_year || '/' || lpad(sequence_number::text, 4, '0')
    and length(invoice_number) <= 16
  ),
  constraint invoices_financial_year_matches_date check (
    financial_year ~ '^[0-9]{4}-[0-9]{2}$'
    and substr(financial_year, 6, 2)::int = (substr(financial_year, 1, 4)::int + 1) % 100
    and invoice_date >= make_date(substr(financial_year, 1, 4)::int, 4, 1)
    and invoice_date <  make_date(substr(financial_year, 1, 4)::int + 1, 4, 1)
  ),
  -- Intra-state (customer's place of supply is the supplier's state) is
  -- CGST + SGST; anything else is a single IGST line. The tax layout and
  -- the states have to agree, so a wrong layout is refused rather than
  -- discovered by a customer's accountant.
  constraint invoices_supply_type_matches_states check (
    (supply_type = 'intra-state') = (place_of_supply_state_code = supplier_state_code)
  ),
  constraint invoices_tax_layout check (
    (supply_type = 'intra-state'
       and cgst_paise is not null and sgst_paise is not null and igst_paise is null
       and tax_paise = cgst_paise + sgst_paise)
    or
    (supply_type = 'inter-state'
       and igst_paise is not null and cgst_paise is null and sgst_paise is null
       and tax_paise = igst_paise)
  ),
  -- taxable + tax = the gross that was collected, to the paisa.
  constraint invoices_total_adds_up check (taxable_paise + tax_paise = total_paise),
  -- A sanity net, NOT a second copy of the rounding rule: the taxable value
  -- must be the nearest paisa to total / 1.18 (|taxable*118 - total*100|
  -- <= 59), so a wrong rate or a unit error cannot be stored.
  constraint invoices_taxable_is_gst_inclusive_split check (
    gst_rate_percent <> 18 or abs(taxable_paise * 118 - total_paise * 100) <= 59
  ),
  constraint invoices_customer_gstin_state check (
    customer_gstin is null or substr(customer_gstin, 1, 2) = customer_state_code
  ),
  constraint invoices_customer_state_is_place_of_supply check (
    customer_state_code = place_of_supply_state_code
  ),
  constraint invoices_period_ordered check (
    service_period_start is null or service_period_end is null or service_period_end > service_period_start
  )
);

create index invoices_business_date_idx on public.invoices (business_id, invoice_date desc, sequence_number desc);

create trigger invoices_immutable
  before update or delete on public.invoices
  for each row execute function public.reject_legal_record_change();
create trigger invoices_no_truncate
  before truncate on public.invoices
  for each statement execute function public.reject_legal_record_change();

alter table public.invoices enable row level security;
alter table public.invoices force row level security;

-- GRANT DECISIONS. Read-only to authenticated users of the owning business
-- via the standard clerk_org_id policy; read-only to the service role (the
-- webhook and the PDF/email paths read with it). NOBODY gets INSERT, UPDATE
-- or DELETE: rows arrive solely through issue_invoice(), which owns the
-- numbering. Written explicitly (revoke first) because Supabase's default
-- privileges would otherwise hand the service role everything.
revoke all on public.invoices from anon, authenticated, service_role;
grant select on public.invoices to authenticated, service_role;

create policy "invoices_select_own_business" on public.invoices
  for select to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

-- ===================================================================
-- 4. credit_notes
-- ===================================================================
--
-- A refund of a taxed invoice needs a credit note referencing the original
-- invoice number and reversing the tax proportionally. Its own number
-- series, 'WAC/<fy>/<nnnn>' -- NOT 'WAP/CN/<fy>/<nnnn>', which is 19
-- characters and GST caps a document number at 16.
create table public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,

  credit_note_number text not null unique,
  financial_year text not null,
  sequence_number integer not null check (sequence_number between 1 and 9999),
  credit_note_date date not null,
  refund_at timestamptz not null,
  issued_at timestamptz not null default now(),

  invoice_id uuid not null references public.invoices (id) on delete restrict,
  original_invoice_number text not null,
  original_invoice_date date not null,

  -- Idempotency key: one Razorpay refund, one credit note.
  razorpay_refund_id text not null unique,
  razorpay_payment_id text not null,
  reason text not null check (reason in (
    'duplicate_or_incorrect_charge',
    'charge_after_cancellation',
    'sustained_outage',
    'other'
  )),

  service_description text not null,
  sac_code text not null check (sac_code ~ '^[0-9]{4,8}$'),

  supplier_name text not null,
  supplier_address text not null,
  supplier_gstin text not null check (supplier_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  supplier_state_code text not null check (supplier_state_code ~ '^[0-9]{2}$'),
  supplier_state_name text not null,

  customer_name text not null,
  customer_address text not null,
  customer_state_code text not null check (customer_state_code ~ '^[0-9]{2}$'),
  customer_state_name text not null,
  customer_gstin text check (customer_gstin is null or customer_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),

  place_of_supply_state_code text not null check (place_of_supply_state_code ~ '^[0-9]{2}$'),
  place_of_supply_state_name text not null,
  supply_type text not null check (supply_type in ('intra-state', 'inter-state')),
  reverse_charge boolean not null default false check (reverse_charge = false),
  is_test boolean not null default false,

  gst_rate_percent smallint not null check (gst_rate_percent between 0 and 28),
  currency text not null default 'INR' check (currency = 'INR'),
  taxable_paise bigint not null check (taxable_paise >= 0),
  cgst_paise bigint check (cgst_paise is null or cgst_paise >= 0),
  sgst_paise bigint check (sgst_paise is null or sgst_paise >= 0),
  igst_paise bigint check (igst_paise is null or igst_paise >= 0),
  tax_paise bigint not null check (tax_paise >= 0),
  total_paise bigint not null check (total_paise > 0),

  unique (is_test, financial_year, sequence_number),

  constraint credit_notes_number_matches_parts check (
    credit_note_number = (case when is_test then 'TSC' else 'WAC' end)
                         || '/' || financial_year || '/' || lpad(sequence_number::text, 4, '0')
    and length(credit_note_number) <= 16
  ),
  constraint credit_notes_financial_year_matches_date check (
    financial_year ~ '^[0-9]{4}-[0-9]{2}$'
    and substr(financial_year, 6, 2)::int = (substr(financial_year, 1, 4)::int + 1) % 100
    and credit_note_date >= make_date(substr(financial_year, 1, 4)::int, 4, 1)
    and credit_note_date <  make_date(substr(financial_year, 1, 4)::int + 1, 4, 1)
  ),
  constraint credit_notes_supply_type_matches_states check (
    (supply_type = 'intra-state') = (place_of_supply_state_code = supplier_state_code)
  ),
  constraint credit_notes_tax_layout check (
    (supply_type = 'intra-state'
       and cgst_paise is not null and sgst_paise is not null and igst_paise is null
       and tax_paise = cgst_paise + sgst_paise)
    or
    (supply_type = 'inter-state'
       and igst_paise is not null and cgst_paise is null and sgst_paise is null
       and tax_paise = igst_paise)
  ),
  constraint credit_notes_total_adds_up check (taxable_paise + tax_paise = total_paise)
);

create index credit_notes_business_date_idx on public.credit_notes (business_id, credit_note_date desc, sequence_number desc);
create index credit_notes_invoice_idx on public.credit_notes (invoice_id);

create trigger credit_notes_immutable
  before update or delete on public.credit_notes
  for each row execute function public.reject_legal_record_change();
create trigger credit_notes_no_truncate
  before truncate on public.credit_notes
  for each statement execute function public.reject_legal_record_change();

-- THE "CANNOT CREDIT MORE THAN WAS INVOICED" RULE, enforced by the database
-- so that no code path -- the script, the webhook, a future admin tool, a
-- direct service-role insert if one were ever granted -- can exceed it.
-- Locks the invoice row first so two concurrent partial notes cannot both
-- pass the check against the same remaining balance. Every component
-- (taxable, CGST, SGST, IGST, total) is checked, not just the total.
create or replace function public.guard_credit_note_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices;
  prior record;
begin
  select * into inv from public.invoices where id = new.invoice_id for update;
  if not found then
    raise exception 'credit note references an unknown invoice' using errcode = 'foreign_key_violation';
  end if;

  if new.business_id <> inv.business_id
     or new.razorpay_payment_id <> inv.razorpay_payment_id
     or new.is_test <> inv.is_test
     or new.supply_type <> inv.supply_type
     or new.place_of_supply_state_code <> inv.place_of_supply_state_code
     or new.original_invoice_number <> inv.invoice_number
  then
    raise exception 'credit note does not match the invoice it references'
      using errcode = 'check_violation';
  end if;

  select coalesce(sum(total_paise), 0) as total,
         coalesce(sum(taxable_paise), 0) as taxable,
         coalesce(sum(cgst_paise), 0) as cgst,
         coalesce(sum(sgst_paise), 0) as sgst,
         coalesce(sum(igst_paise), 0) as igst
    into prior
    from public.credit_notes
   where invoice_id = new.invoice_id;

  if prior.total + new.total_paise > inv.total_paise
     or prior.taxable + new.taxable_paise > inv.taxable_paise
     or prior.cgst + coalesce(new.cgst_paise, 0) > coalesce(inv.cgst_paise, 0)
     or prior.sgst + coalesce(new.sgst_paise, 0) > coalesce(inv.sgst_paise, 0)
     or prior.igst + coalesce(new.igst_paise, 0) > coalesce(inv.igst_paise, 0)
  then
    raise exception 'credit notes against % would exceed the invoice total (% already credited + % > %)',
      inv.invoice_number, prior.total, new.total_paise, inv.total_paise
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger credit_notes_guard_total
  before insert on public.credit_notes
  for each row execute function public.guard_credit_note_total();

-- A trigger function cannot be called directly, but this one is SECURITY
-- DEFINER, so it is not left executable by the client roles either.
revoke all on function public.guard_credit_note_total() from public, anon, authenticated;

alter table public.credit_notes enable row level security;
alter table public.credit_notes force row level security;

-- Same grant decision as invoices: read-only, writes only via issue_credit_note().
revoke all on public.credit_notes from anon, authenticated, service_role;
grant select on public.credit_notes to authenticated, service_role;

create policy "credit_notes_select_own_business" on public.credit_notes
  for select to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

-- ===================================================================
-- 5. invoice_holds -- payments owed an invoice we cannot issue yet
-- ===================================================================
--
-- A webhook must not 500 forever because a customer never gave a state (a
-- retry loop that Razorpay answers by disabling the endpoint), and it must
-- NEVER issue an invoice with a guessed place of supply or a placeholder
-- address (the row would be immutable, so the mistake could never be
-- fixed), or a defect refuses it. So the payment is parked here: visible on the billing page,
-- emailed to the customer, logged at error level, retried by the daily
-- sweep and by saving billing details. Rows ARE mutable and deleted once
-- the invoice exists.
create table public.invoice_holds (
  razorpay_payment_id text primary key,
  business_id uuid not null,
  reason text not null check (reason in (
    'missing_customer_details',
    'invalid_customer_details',
    'supplier_config_incomplete',
    -- The database or the builder refused the invoice for a reason that
    -- retrying cannot fix (a bug). Parked rather than answered with a 500 the
    -- webhook would retry for a day before Razorpay disables the endpoint.
    'issue_failed'
  )),
  detail text,
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR',
  purpose text not null check (purpose in ('subscription_charge', 'annual', 'upgrade_prorata')),
  plan_key text check (plan_key is null or plan_key in ('starter', 'growth', 'scale')),
  razorpay_order_id text,
  razorpay_subscription_id text,
  payment_at timestamptz not null,
  service_period_start timestamptz,
  service_period_end timestamptz,
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now()
);

create index invoice_holds_business_idx on public.invoice_holds (business_id);

alter table public.invoice_holds enable row level security;
alter table public.invoice_holds force row level security;

-- A business may see that an invoice is waiting on it (the billing page
-- says so); only the service role writes.
revoke all on public.invoice_holds from anon, authenticated, service_role;
grant select on public.invoice_holds to authenticated;
grant select, insert, update, delete on public.invoice_holds to service_role;

create policy "invoice_holds_select_own_business" on public.invoice_holds
  for select to authenticated
  using (business_id in (select id from public.businesses where clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')));

-- ===================================================================
-- 6. The issue functions -- the only way a document gets a number
-- ===================================================================

create or replace function public.issue_invoice(p_invoice jsonb)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  fy text := p_invoice ->> 'financial_year';
  payment_id text := p_invoice ->> 'razorpay_payment_id';
  test_mode boolean := coalesce((p_invoice ->> 'is_test')::boolean, false);
  seq integer;
  result public.invoices;
begin
  if fy is null or payment_id is null or p_invoice ->> 'business_id' is null then
    raise exception 'issue_invoice requires business_id, financial_year and razorpay_payment_id'
      using errcode = 'invalid_parameter_value';
  end if;

  if not exists (select 1 from public.businesses where id = (p_invoice ->> 'business_id')::uuid) then
    raise exception 'issue_invoice: unknown business' using errcode = 'foreign_key_violation';
  end if;

  -- Replay of a payment that already has an invoice: return it, touch
  -- nothing, consume no number.
  select * into result from public.invoices where razorpay_payment_id = payment_id;
  if found then
    return result;
  end if;

  -- The BEGIN ... EXCEPTION block is a subtransaction: if anything inside it
  -- fails, the counter increment is rolled back with it, so a failed insert
  -- cannot burn a number.
  begin
    insert into public.invoice_counters as c (series, financial_year, last_number)
    values (case when test_mode then 'test_invoice' else 'invoice' end, fy, 1)
    on conflict (series, financial_year) do update set last_number = c.last_number + 1
    returning c.last_number into seq;

    insert into public.invoices
    select * from jsonb_populate_record(
      null::public.invoices,
      p_invoice || jsonb_build_object(
        'id', gen_random_uuid(),
        'sequence_number', seq,
        'invoice_number', (case when test_mode then 'TST' else 'WAP' end) || '/' || fy || '/' || lpad(seq::text, 4, '0'),
        'issued_at', now(),
        'reverse_charge', false,
        'is_test', test_mode,
        'currency', 'INR'
      )
    )
    returning * into result;
  exception when unique_violation then
    -- Lost a race with a concurrent delivery of the same payment: the
    -- counter bump above has been rolled back; hand back the winner's row.
    select * into result from public.invoices where razorpay_payment_id = payment_id;
    if found then
      return result;
    end if;
    raise;
  end;

  return result;
end;
$$;

create or replace function public.issue_credit_note(p_credit_note jsonb)
returns public.credit_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  fy text := p_credit_note ->> 'financial_year';
  refund_id text := p_credit_note ->> 'razorpay_refund_id';
  test_mode boolean := coalesce((p_credit_note ->> 'is_test')::boolean, false);
  seq integer;
  result public.credit_notes;
begin
  if fy is null or refund_id is null or p_credit_note ->> 'invoice_id' is null then
    raise exception 'issue_credit_note requires invoice_id, financial_year and razorpay_refund_id'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into result from public.credit_notes where razorpay_refund_id = refund_id;
  if found then
    return result;
  end if;

  begin
    insert into public.invoice_counters as c (series, financial_year, last_number)
    values (case when test_mode then 'test_credit_note' else 'credit_note' end, fy, 1)
    on conflict (series, financial_year) do update set last_number = c.last_number + 1
    returning c.last_number into seq;

    insert into public.credit_notes
    select * from jsonb_populate_record(
      null::public.credit_notes,
      p_credit_note || jsonb_build_object(
        'id', gen_random_uuid(),
        'sequence_number', seq,
        'credit_note_number', (case when test_mode then 'TSC' else 'WAC' end) || '/' || fy || '/' || lpad(seq::text, 4, '0'),
        'issued_at', now(),
        'reverse_charge', false,
        'is_test', test_mode,
        'currency', 'INR'
      )
    )
    returning * into result;
  exception when unique_violation then
    select * into result from public.credit_notes where razorpay_refund_id = refund_id;
    if found then
      return result;
    end if;
    raise;
  end;

  return result;
end;
$$;

-- Callable by the service role only: an authenticated tenant calling
-- issue_invoice() directly would be minting legal documents.
revoke all on function public.issue_invoice(jsonb) from public, anon, authenticated;
revoke all on function public.issue_credit_note(jsonb) from public, anon, authenticated;
grant execute on function public.issue_invoice(jsonb) to service_role;
grant execute on function public.issue_credit_note(jsonb) to service_role;

-- ===================================================================
-- 7. The customer's billing identity: name and address
-- ===================================================================
--
-- billing_state_code and gstin were added in 20261025000000. A tax invoice
-- also needs the recipient's name and address. Edited by the customer
-- (through a Server Action using the service role -- authenticated still has
-- no UPDATE on subscriptions), with the rule that a change applies to
-- FUTURE invoices only: issued invoices are snapshots and immutable.
alter table public.subscriptions
  add column billing_name text check (billing_name is null or length(billing_name) between 1 and 200),
  add column billing_address text check (billing_address is null or length(billing_address) between 1 and 600);

-- ===================================================================
-- 8. audit_log.action -- 55 -> 58
-- ===================================================================
--
-- 20261025000000's list plus 'invoice.issued', 'credit_note.issued' and
-- 'billing_details.updated'.
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
    'customer.renamed',
    'segment.created',
    'segment.updated',
    'segment.deleted',
    'workflow.created',
    'workflow.updated',
    'workflow.deleted',
    'workflow.enabled',
    'workflow.disabled',
    'workflow_run.cancelled',
    'copilot.item_dismissed',
    'copilot.item_undismissed',
    'copilot.action_snoozed',
    'copilot.action_completed',
    'copilot.action_superseded',
    'notification_preferences.updated',
    'subscription.checkout_started',
    'subscription.activated',
    'subscription.charged',
    'subscription.payment_failed',
    'subscription.grace_lapsed',
    'subscription.cancellation_scheduled',
    'subscription.expired',
    'subscription.plan_changed',
    'subscription.plan_change_scheduled',
    'invoice.issued',
    'credit_note.issued',
    'billing_details.updated'
  )
);
