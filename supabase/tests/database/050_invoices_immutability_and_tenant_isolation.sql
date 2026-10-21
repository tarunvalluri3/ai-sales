-- Shape, immutability and tenant isolation for Phase 17c's GST tax invoices
-- (2026-10-21, migration 20261026000000): public.invoices and
-- public.issue_invoice().
--
-- An invoice is a legal record. Four properties are asserted, each of which
-- would be a compliance failure if it quietly stopped being true:
--
--   * IMMUTABLE, in the database and not only in application code: UPDATE,
--     DELETE and TRUNCATE are rejected by a trigger even for the connecting
--     role, and the client roles hold no write grants at all -- including
--     the service role, which may not even INSERT directly (it must go
--     through issue_invoice(), which owns the numbering).
--   * ONE INVOICE PER PAYMENT: a replayed webhook can never produce a second
--     invoice, and a replay burns no invoice number.
--   * GAP-FREE NUMBERS PER FINANCIAL YEAR (IST), restarting each 1 April:
--     a failed insert does not consume a number. Both sides of the
--     31 March / 1 April midnight-IST boundary are asserted.
--   * TENANT ISOLATION: org_a cannot read org_b's invoices.
--
-- Includes positive controls (assertions 1, 15, 22, 25) so a test that only
-- ever proves denial cannot pass against a table nobody can use.
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.

begin;
select plan(28);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

-- A fixture builder: the JSON issue_invoice() takes, for a GST-inclusive
-- gross. The tax split here uses the same nearest-paisa rule as lib/plans.ts
-- only so the fixtures satisfy the table's arithmetic constraints; the real
-- derivation under test lives in TypeScript (scripts/run-invoice-tests.mjs).
create function pg_temp.invoice_json(
  p_payment text,
  p_business uuid,
  p_at timestamptz,
  p_total bigint,
  p_customer_state text default '36'
) returns jsonb
language plpgsql
as $$
declare
  ist date := (p_at at time zone 'Asia/Kolkata')::date;
  yr int := extract(year from ist)::int;
  fy text := case
    when extract(month from ist) >= 4 then yr::text || '-' || lpad(((yr + 1) % 100)::text, 2, '0')
    else (yr - 1)::text || '-' || lpad((yr % 100)::text, 2, '0')
  end;
  taxable bigint := (p_total * 200 + 118) / 236;
  tax bigint := p_total - taxable;
  intra boolean := p_customer_state = '36';
begin
  return jsonb_build_object(
    'business_id', p_business,
    'financial_year', fy,
    'invoice_date', ist,
    'payment_at', p_at,
    'razorpay_payment_id', p_payment,
    'purpose', 'subscription_charge',
    'plan_key', 'growth',
    'service_description', 'Waves AI Pilot Growth plan, monthly',
    'sac_code', '998314',
    'supplier_name', 'Waves Web Studio',
    'supplier_address', 'Test address, Hyderabad, Telangana',
    'supplier_gstin', '36BYQPT2686E1ZR',
    'supplier_state_code', '36',
    'supplier_state_name', 'Telangana',
    'customer_name', 'Customer ' || p_business::text,
    'customer_address', '1 Test Street, Somewhere',
    'customer_state_code', p_customer_state,
    'customer_state_name', case when intra then 'Telangana' else 'Maharashtra' end,
    'place_of_supply_state_code', p_customer_state,
    'place_of_supply_state_name', case when intra then 'Telangana' else 'Maharashtra' end,
    'supply_type', case when intra then 'intra-state' else 'inter-state' end,
    'gst_rate_percent', 18,
    'taxable_paise', taxable,
    'cgst_paise', case when intra then tax / 2 end,
    'sgst_paise', case when intra then tax - tax / 2 end,
    'igst_paise', case when intra then null else tax end,
    'tax_paise', tax,
    'total_paise', p_total
  );
end;
$$;

insert into public.businesses (id, clerk_org_id, name)
values ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
       ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

-- ===================================================================
-- 1-5. Numbering: the first number, the replay, the second number
-- ===================================================================

-- 1. Positive control, and the format: exactly 16 characters, the GST limit.
insert into _tap_results select is(
  (select invoice_number from public.issue_invoice(
     pg_temp.invoice_json('pay_a1', '00000000-0000-0000-0000-00000000000a', '2026-10-21T10:00:00Z', 149900))),
  'WAP/2026-27/0001',
  'the first invoice of 2026-27 is WAP/2026-27/0001'
);

insert into _tap_results select is(
  (select length(invoice_number) from public.invoices where razorpay_payment_id = 'pay_a1'),
  16,
  'an invoice number is exactly 16 characters -- the most GST allows'
);

-- 3. THE REPLAY: the same Razorpay payment, delivered again.
insert into _tap_results select is(
  (select invoice_number from public.issue_invoice(
     pg_temp.invoice_json('pay_a1', '00000000-0000-0000-0000-00000000000a', '2026-10-21T10:00:00Z', 149900))),
  'WAP/2026-27/0001',
  'replaying the same payment returns the same invoice rather than issuing a second'
);

insert into _tap_results select is(
  (select count(*)::int from public.invoices where razorpay_payment_id = 'pay_a1'),
  1,
  'one payment, one invoice'
);

-- 5. ...and the replay burned no number.
insert into _tap_results select is(
  (select invoice_number from public.issue_invoice(
     pg_temp.invoice_json('pay_a2', '00000000-0000-0000-0000-00000000000a', '2026-10-22T10:00:00Z', 399900))),
  'WAP/2026-27/0002',
  'the next payment gets 0002 -- the replay did not consume 0002'
);

-- ===================================================================
-- 6-7. Test-mode documents are a separate, marked series
-- ===================================================================
--
-- A Razorpay TEST payment is not a supply and an invoice can never be
-- deleted, so test documents must neither enter the real series nor use up
-- its numbers.
insert into _tap_results select is(
  (select invoice_number from public.issue_invoice(
     pg_temp.invoice_json('pay_test1', '00000000-0000-0000-0000-00000000000a', '2026-10-22T11:00:00Z', 149900)
       || '{"is_test": true}'::jsonb)),
  'TST/2026-27/0001',
  'a test-mode payment is numbered in its own series, TST/2026-27/0001'
);

insert into _tap_results select ok(
  (select last_number from public.invoice_counters where series = 'invoice' and financial_year = '2026-27') = 2
  and (select last_number from public.invoice_counters where series = 'test_invoice' and financial_year = '2026-27') = 1,
  'the test invoice did not touch the real counter (invoice 2, test_invoice 1)'
);

-- ===================================================================
-- 8-10. A failed insert cannot burn a number
-- ===================================================================

-- total_paise = 1 but taxable + tax = 399900: invoices_total_adds_up fails
-- AFTER the counter row was incremented inside the function.
insert into _tap_results select throws_ok(
  $$ select public.issue_invoice(
       pg_temp.invoice_json('pay_bad', '00000000-0000-0000-0000-00000000000a', '2026-10-23T10:00:00Z', 399900)
         || '{"total_paise": 1}'::jsonb) $$,
  '23514',
  null,
  'an invoice that violates a constraint is rejected'
);

insert into _tap_results select is(
  (select last_number from public.invoice_counters
    where series = 'invoice' and financial_year = '2026-27'),
  2,
  'the rejected insert rolled its counter increment back (counter still 2)'
);

insert into _tap_results select is(
  (select invoice_number from public.issue_invoice(
     pg_temp.invoice_json('pay_a3', '00000000-0000-0000-0000-00000000000a', '2026-10-24T10:00:00Z', 999900))),
  'WAP/2026-27/0003',
  'the next valid invoice is 0003: no gap where the failed one was'
);

-- ===================================================================
-- 9-12. The financial year is IST, and restarts on 1 April
-- ===================================================================
--
-- 2027-03-31T18:29:59Z is 23:59:59 IST on 31 March: still 2026-27.
-- 2027-03-31T18:30:00Z is 00:00:00 IST on 1 April: 2027-28.

insert into _tap_results select is(
  (select invoice_number from public.issue_invoice(
     pg_temp.invoice_json('pay_fy1', '00000000-0000-0000-0000-00000000000a', '2027-03-31T18:29:59Z', 149900))),
  'WAP/2026-27/0004',
  '23:59:59 IST on 31 March is still the old financial year'
);

insert into _tap_results select is(
  (select invoice_number from public.issue_invoice(
     pg_temp.invoice_json('pay_fy2', '00000000-0000-0000-0000-00000000000a', '2027-03-31T18:30:00Z', 149900))),
  'WAP/2027-28/0001',
  '00:00:00 IST on 1 April starts the new year, and the numbering restarts at 0001'
);

insert into _tap_results select throws_ok(
  $$ select public.issue_invoice(
       pg_temp.invoice_json('pay_fy3', '00000000-0000-0000-0000-00000000000a', '2027-03-31T18:30:00Z', 149900)
         || '{"financial_year": "2026-27"}'::jsonb) $$,
  '23514',
  null,
  'an invoice dated 1 April cannot be filed in the 2026-27 series (the timezone bug the check exists for)'
);

insert into _tap_results select throws_ok(
  $$ select public.issue_invoice(
       pg_temp.invoice_json('pay_fy4', '00000000-0000-0000-0000-00000000000a', '2027-03-31T18:29:59Z', 149900)
         || '{"financial_year": "2027-28"}'::jsonb) $$,
  '23514',
  null,
  'an invoice dated 31 March cannot be filed in the 2027-28 series'
);

-- ===================================================================
-- 13-16. Tax layout and state invariants
-- ===================================================================

-- 13. Positive control for the inter-state layout: one IGST line.
insert into _tap_results select lives_ok(
  $$ select public.issue_invoice(
       pg_temp.invoice_json('pay_b1', '00000000-0000-0000-0000-00000000000b', '2026-10-21T10:00:00Z', 399900, '27')) $$,
  'an inter-state invoice (customer in Maharashtra) is issued with a single IGST line'
);

insert into _tap_results select throws_ok(
  $$ select public.issue_invoice(
       pg_temp.invoice_json('pay_x1', '00000000-0000-0000-0000-00000000000b', '2026-10-21T10:00:00Z', 399900, '27')
         || '{"supply_type": "intra-state"}'::jsonb) $$,
  '23514',
  null,
  'supply type must agree with the states: a Maharashtra customer cannot be charged CGST+SGST'
);

insert into _tap_results select throws_ok(
  $$ select public.issue_invoice(
       pg_temp.invoice_json('pay_x2', '00000000-0000-0000-0000-00000000000b', '2026-10-21T10:00:00Z', 399900)
         || '{"igst_paise": 61002, "cgst_paise": null, "sgst_paise": null}'::jsonb) $$,
  '23514',
  null,
  'an intra-state invoice cannot carry an IGST line instead of CGST+SGST'
);

insert into _tap_results select throws_ok(
  $$ select public.issue_invoice(
       pg_temp.invoice_json('pay_x3', '00000000-0000-0000-0000-00000000000b', '2026-10-21T10:00:00Z', 399900)
         || '{"customer_gstin": "27AAAAA0000A1Z5"}'::jsonb) $$,
  '23514',
  null,
  'a customer GSTIN whose state digits disagree with the customer state is refused'
);

-- ===================================================================
-- 17-19. Immutability, as the connecting role (the trigger's job)
-- ===================================================================
--
-- This session is `postgres`, which holds every privilege -- so what stops
-- these is the trigger alone, not a missing grant.

insert into _tap_results select throws_ok(
  $$ update public.invoices set customer_name = 'Renamed Ltd' where razorpay_payment_id = 'pay_a1' $$,
  '23001',
  null,
  'an invoice cannot be UPDATEd, even by the table owner (trigger)'
);

insert into _tap_results select throws_ok(
  $$ delete from public.invoices where razorpay_payment_id = 'pay_a1' $$,
  '23001',
  null,
  'an invoice cannot be DELETEd, even by the table owner (trigger)'
);

insert into _tap_results select throws_ok(
  $$ truncate public.invoices cascade $$,
  '23001',
  null,
  'invoices cannot be TRUNCATEd, even by the table owner (trigger)'
);

-- ===================================================================
-- 20. Grants: nobody but the issue function writes
-- ===================================================================

-- 20. Positive control: the roles that SHOULD read can.
insert into _tap_results select ok(
  has_table_privilege('authenticated', 'public.invoices', 'select')
  and has_table_privilege('service_role', 'public.invoices', 'select'),
  'authenticated and service_role can SELECT invoices'
);

insert into _tap_results select ok(
  not has_table_privilege('authenticated', 'public.invoices', 'insert')
  and not has_table_privilege('authenticated', 'public.invoices', 'update')
  and not has_table_privilege('authenticated', 'public.invoices', 'delete')
  and not has_table_privilege('authenticated', 'public.invoices', 'truncate')
  and not has_table_privilege('anon', 'public.invoices', 'select'),
  'authenticated has no write privileges on invoices and anon has none at all'
);

insert into _tap_results select ok(
  not has_table_privilege('service_role', 'public.invoices', 'insert')
  and not has_table_privilege('service_role', 'public.invoices', 'update')
  and not has_table_privilege('service_role', 'public.invoices', 'delete')
  and not has_table_privilege('service_role', 'public.invoices', 'truncate'),
  'even the service role cannot INSERT, UPDATE, DELETE or TRUNCATE invoices directly (it must use issue_invoice)'
);

-- ===================================================================
-- 23-26. Tenant isolation, as an authenticated org_a user
-- ===================================================================
--
-- The hostile call's payload is built here, as the connecting role: the
-- temporary fixture function is not reachable from the authenticated role,
-- and a permission error about THAT would pass the assertion for the wrong
-- reason.
select set_config(
  'test.hack_invoice',
  pg_temp.invoice_json('pay_hack', '00000000-0000-0000-0000-00000000000a', '2026-10-25T10:00:00Z', 149900)::text,
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'user_test_a',
    'role', 'authenticated',
    'o', json_build_object('id', 'org_a')
  )::text,
  true
);

insert into _tap_results select ok(
  (select count(*) from public.invoices where business_id = '00000000-0000-0000-0000-00000000000a') >= 4
  and (select count(*) from public.invoices where business_id = '00000000-0000-0000-0000-00000000000b') = 0,
  'org_a sees its own invoices and none of org_b''s'
);

insert into _tap_results select throws_ok(
  $$ select public.issue_invoice(current_setting('test.hack_invoice')::jsonb) $$,
  '42501',
  null,
  'a tenant cannot call issue_invoice() -- it would be minting legal documents'
);

insert into _tap_results select throws_ok(
  $$ update public.invoices set total_paise = 1 where business_id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'a tenant cannot rewrite its own invoice amount (no UPDATE grant)'
);

-- Back to the connecting role: delete the business and prove the invoice
-- is a statutory record that outlives it (no FK, nothing cascades).
reset role;

delete from public.businesses where id = '00000000-0000-0000-0000-00000000000b';

insert into _tap_results select is(
  (select count(*)::int from public.invoices where razorpay_payment_id = 'pay_b1'),
  1,
  'deleting a business does not delete its invoice -- the supplier must keep its tax records'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
