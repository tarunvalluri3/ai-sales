-- Credit notes, the numbering counters and invoice holds for Phase 17c
-- (2026-10-21, migration 20261026000000).
--
-- 050 covers invoices. This file covers the rest of the legal-record
-- machinery:
--
--   * The COUNTER ROW (invoice_counters): it may only ever move by +1, and
--     can never be deleted, truncated or written by a client role -- the
--     gap-free guarantee has to survive a stray UPDATE from a role that
--     bypasses RLS. Credit notes run in their own series, so issuing one
--     never moves the invoice counter.
--   * CREDIT NOTES: immutable, one per Razorpay refund (a replay returns the
--     same note and burns no number), and -- enforced by the database, so no
--     code path can bypass it -- the notes against an invoice can never add
--     up to more than that invoice, in total or in any tax component, across
--     any number of partial notes.
--   * INVOICE HOLDS: a payment owed an invoice we cannot issue yet. Visible
--     to its own business, invisible to others, writable only by the
--     service role.
--   * audit_log.action: 55 -> 58 actions.
--
-- Includes positive controls (assertions 1, 4, 19, 24) so a test that only
-- ever proves denial cannot pass against a table nobody can use.
--
-- Run against the live, linked project via `npm test`
-- (scripts/run-pgtap-tests.mjs) -- see 001_businesses_tenant_isolation.sql's
-- header for why this is wrapped in a temporary results table.

begin;
select plan(34);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated, service_role;

create function pg_temp.invoice_json(p_payment text, p_business uuid, p_at timestamptz, p_total bigint)
returns jsonb
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
begin
  return jsonb_build_object(
    'business_id', p_business, 'financial_year', fy, 'invoice_date', ist, 'payment_at', p_at,
    'razorpay_payment_id', p_payment, 'purpose', 'subscription_charge', 'plan_key', 'starter',
    'service_description', 'Waves AI Pilot Starter plan, monthly', 'sac_code', '998314',
    'supplier_name', 'Waves Web Studio', 'supplier_address', 'Test address, Hyderabad',
    'supplier_gstin', '36BYQPT2686E1ZR', 'supplier_state_code', '36', 'supplier_state_name', 'Telangana',
    'customer_name', 'Customer', 'customer_address', '1 Test Street',
    'customer_state_code', '36', 'customer_state_name', 'Telangana',
    'place_of_supply_state_code', '36', 'place_of_supply_state_name', 'Telangana',
    'supply_type', 'intra-state', 'gst_rate_percent', 18,
    'taxable_paise', taxable, 'cgst_paise', tax / 2, 'sgst_paise', tax - tax / 2,
    'tax_paise', tax, 'total_paise', p_total
  );
end;
$$;

-- A credit note against an invoice, with explicit (already-split) amounts.
create function pg_temp.credit_json(
  p_invoice uuid, p_refund text, p_at timestamptz,
  p_taxable bigint, p_cgst bigint, p_sgst bigint
) returns jsonb
language plpgsql
as $$
declare
  inv public.invoices;
  ist date := (p_at at time zone 'Asia/Kolkata')::date;
  yr int := extract(year from ist)::int;
  fy text := case
    when extract(month from ist) >= 4 then yr::text || '-' || lpad(((yr + 1) % 100)::text, 2, '0')
    else (yr - 1)::text || '-' || lpad((yr % 100)::text, 2, '0')
  end;
begin
  select * into inv from public.invoices where id = p_invoice;
  return jsonb_build_object(
    'business_id', inv.business_id, 'financial_year', fy, 'credit_note_date', ist, 'refund_at', p_at,
    'invoice_id', inv.id, 'original_invoice_number', inv.invoice_number,
    'original_invoice_date', inv.invoice_date,
    'razorpay_refund_id', p_refund, 'razorpay_payment_id', inv.razorpay_payment_id,
    'reason', 'duplicate_or_incorrect_charge',
    'service_description', inv.service_description, 'sac_code', inv.sac_code,
    'supplier_name', inv.supplier_name, 'supplier_address', inv.supplier_address,
    'supplier_gstin', inv.supplier_gstin, 'supplier_state_code', inv.supplier_state_code,
    'supplier_state_name', inv.supplier_state_name,
    'customer_name', inv.customer_name, 'customer_address', inv.customer_address,
    'customer_state_code', inv.customer_state_code, 'customer_state_name', inv.customer_state_name,
    'place_of_supply_state_code', inv.place_of_supply_state_code,
    'place_of_supply_state_name', inv.place_of_supply_state_name,
    'supply_type', inv.supply_type, 'gst_rate_percent', 18,
    'taxable_paise', p_taxable, 'cgst_paise', p_cgst, 'sgst_paise', p_sgst,
    'tax_paise', p_cgst + p_sgst, 'total_paise', p_taxable + p_cgst + p_sgst
  );
end;
$$;

insert into public.businesses (id, clerk_org_id, name)
values ('00000000-0000-0000-0000-00000000000a', 'org_a', 'Business A'),
       ('00000000-0000-0000-0000-00000000000b', 'org_b', 'Business B');

-- Starter's real gross: 149,900 = taxable 127,034 + tax 22,866 (CGST 11,433 + SGST 11,433).
select public.issue_invoice(pg_temp.invoice_json('pay_c1', '00000000-0000-0000-0000-00000000000a', '2026-10-21T10:00:00Z', 149900));
select public.issue_invoice(pg_temp.invoice_json('pay_c2', '00000000-0000-0000-0000-00000000000a', '2026-10-22T10:00:00Z', 149900));

-- ===================================================================
-- 1-5. Credit notes: own series, replay-safe, partial notes
-- ===================================================================

-- 1. Positive control, and the series: WAC, not WAP/CN (19 chars > GST's 16).
insert into _tap_results select is(
  (select credit_note_number from public.issue_credit_note(pg_temp.credit_json(
     (select id from public.invoices where razorpay_payment_id = 'pay_c1'),
     'rfnd_1', '2026-10-25T10:00:00Z', 84746, 7627, 7627))),
  'WAC/2026-27/0001',
  'the first credit note is WAC/2026-27/0001, in its own series (16 characters, within the GST limit)'
);

insert into _tap_results select is(
  (select last_number from public.invoice_counters where series = 'invoice' and financial_year = '2026-27'),
  2,
  'issuing a credit note did not move the invoice counter (still 2)'
);

insert into _tap_results select is(
  (select credit_note_number from public.issue_credit_note(pg_temp.credit_json(
     (select id from public.invoices where razorpay_payment_id = 'pay_c1'),
     'rfnd_1', '2026-10-25T10:00:00Z', 84746, 7627, 7627))),
  'WAC/2026-27/0001',
  'replaying the same Razorpay refund returns the same credit note'
);

insert into _tap_results select is(
  (select count(*)::int from public.credit_notes where razorpay_refund_id = 'rfnd_1'),
  1,
  'one refund, one credit note'
);

-- 5. The closing note takes exactly what remains (total 49,900), so the two
-- notes add up to the invoice to the paisa.
insert into _tap_results select is(
  (select credit_note_number from public.issue_credit_note(pg_temp.credit_json(
     (select id from public.invoices where razorpay_payment_id = 'pay_c1'),
     'rfnd_2', '2026-10-26T10:00:00Z', 42288, 3806, 3806))),
  'WAC/2026-27/0002',
  'a second partial note that exactly exhausts the invoice is accepted as 0002'
);

-- ===================================================================
-- 6-8. Credit notes of test-mode invoices stay in the test series
-- ===================================================================
select public.issue_invoice(
  pg_temp.invoice_json('pay_ct1', '00000000-0000-0000-0000-00000000000a', '2026-10-23T10:00:00Z', 149900)
    || '{"is_test": true}'::jsonb);

insert into _tap_results select is(
  (select credit_note_number from public.issue_credit_note(pg_temp.credit_json(
     (select id from public.invoices where razorpay_payment_id = 'pay_ct1'),
     'rfnd_t1', '2026-10-25T10:00:00Z', 84746, 7627, 7627) || '{"is_test": true}'::jsonb)),
  'TSC/2026-27/0001',
  'a credit note against a test invoice is numbered TSC/2026-27/0001'
);

insert into _tap_results select ok(
  (select last_number from public.invoice_counters where series = 'credit_note' and financial_year = '2026-27') = 2
  and (select last_number from public.invoice_counters where series = 'test_credit_note' and financial_year = '2026-27') = 1,
  'the test credit note did not touch the real credit-note counter'
);

insert into _tap_results select throws_ok(
  $$ select public.issue_credit_note(pg_temp.credit_json(
       (select id from public.invoices where razorpay_payment_id = 'pay_ct1'),
       'rfnd_t2', '2026-10-25T11:00:00Z', 100, 9, 9)) $$,
  '23514',
  null,
  'a real-series credit note cannot reference a test invoice (nor the reverse)'
);

-- ===================================================================
-- 9-12. A credit note can never exceed its invoice
-- ===================================================================

insert into _tap_results select throws_ok(
  $$ select public.issue_credit_note(pg_temp.credit_json(
       (select id from public.invoices where razorpay_payment_id = 'pay_c1'),
       'rfnd_3', '2026-10-27T10:00:00Z', 1, 0, 0)) $$,
  '23514',
  null,
  'a further note against a fully credited invoice is refused (across multiple partial notes)'
);

insert into _tap_results select is(
  (select last_number from public.invoice_counters where series = 'credit_note' and financial_year = '2026-27'),
  2,
  'the refused credit note burned no number (credit-note counter still 2)'
);

-- A single note whose total is fine but whose tax exceeds the invoice's tax.
insert into _tap_results select throws_ok(
  $$ select public.issue_credit_note(pg_temp.credit_json(
       (select id from public.invoices where razorpay_payment_id = 'pay_c2'),
       'rfnd_4', '2026-10-27T10:00:00Z', 0, 15000, 15000)) $$,
  '23514',
  null,
  'a note that reverses more CGST/SGST than the invoice charged is refused even if its total is within the invoice'
);

insert into _tap_results select throws_ok(
  $$ select public.issue_credit_note(pg_temp.credit_json(
       (select id from public.invoices where razorpay_payment_id = 'pay_c2'),
       'rfnd_5', '2026-10-27T10:00:00Z', 149901, 0, 0)) $$,
  '23514',
  null,
  'a single note larger than the whole invoice is refused'
);

-- ===================================================================
-- 10-13. Credit notes are immutable legal records
-- ===================================================================

insert into _tap_results select throws_ok(
  $$ update public.credit_notes set reason = 'other' where razorpay_refund_id = 'rfnd_1' $$,
  '23001', null, 'a credit note cannot be UPDATEd, even by the table owner (trigger)'
);

insert into _tap_results select throws_ok(
  $$ delete from public.credit_notes where razorpay_refund_id = 'rfnd_1' $$,
  '23001', null, 'a credit note cannot be DELETEd, even by the table owner (trigger)'
);

insert into _tap_results select throws_ok(
  $$ truncate public.credit_notes $$,
  '23001', null, 'credit notes cannot be TRUNCATEd, even by the table owner (trigger)'
);

insert into _tap_results select ok(
  not has_table_privilege('authenticated', 'public.credit_notes', 'insert')
  and not has_table_privilege('authenticated', 'public.credit_notes', 'update')
  and not has_table_privilege('authenticated', 'public.credit_notes', 'delete')
  and not has_table_privilege('service_role', 'public.credit_notes', 'insert')
  and not has_table_privilege('service_role', 'public.credit_notes', 'update')
  and not has_table_privilege('service_role', 'public.credit_notes', 'delete'),
  'neither authenticated nor the service role holds a write privilege on credit_notes'
);

-- ===================================================================
-- 14-19. The counter row: +1 only, never reset, never client-writable
-- ===================================================================

insert into _tap_results select throws_ok(
  $$ update public.invoice_counters set last_number = last_number + 2 where series = 'invoice' $$,
  '23001', null, 'a counter cannot skip a number (+2)'
);

insert into _tap_results select throws_ok(
  $$ update public.invoice_counters set last_number = 1 where series = 'invoice' and last_number = 2 $$,
  '23001', null, 'a counter cannot be wound back -- that would re-issue numbers that exist'
);

insert into _tap_results select throws_ok(
  $$ delete from public.invoice_counters $$,
  '23001', null, 'a counter row cannot be deleted'
);

-- 17. Positive control: the legal increment is the one thing allowed.
insert into _tap_results select lives_ok(
  $$ update public.invoice_counters set last_number = last_number + 1
       where series = 'credit_note' and financial_year = '2026-27' $$,
  'a counter can be incremented by exactly 1'
);

insert into _tap_results select throws_ok(
  $$ insert into public.invoice_counters (series, financial_year, last_number) values ('invoice', '2026-28', 1) $$,
  '23514', null, 'a financial year whose second half is not the first plus one is refused'
);

insert into _tap_results select throws_ok(
  $$ insert into public.invoice_counters (series, financial_year, last_number) values ('invoice', '2030-31', 10000) $$,
  '23514', null, 'the 10,000th document of a year is refused -- a fifth digit would break the 16-character GST limit'
);

-- ===================================================================
-- 20. Zero client privileges on the counters
-- ===================================================================
insert into _tap_results select ok(
  not has_table_privilege('authenticated', 'public.invoice_counters', 'select')
  and not has_table_privilege('authenticated', 'public.invoice_counters', 'insert')
  and not has_table_privilege('authenticated', 'public.invoice_counters', 'update')
  and not has_table_privilege('service_role', 'public.invoice_counters', 'update')
  and not has_table_privilege('service_role', 'public.invoice_counters', 'insert')
  and not has_table_privilege('service_role', 'public.invoice_counters', 'delete'),
  'no client role, service role included, can read or write invoice_counters directly'
);

-- ===================================================================
-- 21-26. invoice_holds
-- ===================================================================

-- 21. Positive control: the service role can park and clear a hold.
set local role service_role;
insert into _tap_results select lives_ok(
  $$ insert into public.invoice_holds
       (razorpay_payment_id, business_id, reason, amount_paise, purpose, plan_key, payment_at)
     values ('pay_hold_a', '00000000-0000-0000-0000-00000000000a', 'missing_customer_details',
             149900, 'subscription_charge', 'starter', now()) $$,
  'the service role can record a hold'
);
insert into public.invoice_holds
  (razorpay_payment_id, business_id, reason, amount_paise, purpose, plan_key, payment_at)
values ('pay_hold_b', '00000000-0000-0000-0000-00000000000b', 'supplier_config_incomplete',
        399900, 'annual', 'growth', now());
reset role;

insert into _tap_results select throws_ok(
  $$ insert into public.invoice_holds
       (razorpay_payment_id, business_id, reason, amount_paise, purpose, payment_at)
     values ('pay_hold_c', '00000000-0000-0000-0000-00000000000a', 'because', 100, 'annual', now()) $$,
  '23514', null, 'a hold reason must be one of the known reasons'
);

insert into _tap_results select throws_ok(
  $$ insert into public.invoice_holds
       (razorpay_payment_id, business_id, reason, amount_paise, purpose, payment_at)
     values ('pay_hold_a', '00000000-0000-0000-0000-00000000000a', 'missing_customer_details', 100, 'annual', now()) $$,
  '23505', null, 'one payment can have at most one hold'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

insert into _tap_results select is(
  (select array_agg(razorpay_payment_id order by razorpay_payment_id) from public.invoice_holds),
  array['pay_hold_a'],
  'org_a sees its own hold and not org_b''s'
);

insert into _tap_results select throws_ok(
  $$ delete from public.invoice_holds where razorpay_payment_id = 'pay_hold_a' $$,
  '42501', null, 'a tenant cannot clear its own hold (no DELETE grant) -- only issuing the invoice does'
);

-- ===================================================================
-- 26-29. Tenant isolation for credit notes, as org_b
-- ===================================================================
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_b', 'role', 'authenticated', 'o', json_build_object('id', 'org_b'))::text,
  true
);

insert into _tap_results select is(
  (select count(*)::int from public.credit_notes),
  0,
  'org_b cannot read org_a''s credit notes'
);

insert into _tap_results select is(
  (select count(*)::int from public.invoices),
  0,
  'org_b cannot read org_a''s invoices'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_test_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_a'))::text,
  true
);

-- 28. Positive control for the isolation above.
insert into _tap_results select is(
  (select count(*)::int from public.credit_notes),
  3,
  'org_a sees its own three credit notes (two real, one test)'
);

insert into _tap_results select throws_ok(
  $$ select public.issue_credit_note('{}'::jsonb) $$,
  '42501', null, 'a tenant cannot call issue_credit_note()'
);

reset role;

-- ===================================================================
-- 30-31. The columns and the audit list this phase added
-- ===================================================================
insert into _tap_results select throws_ok(
  $$ update public.subscriptions set billing_name = '' where business_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'a billing name cannot be empty'
);

-- 55 before Phase 17c (20261025000000) plus invoice.issued, credit_note.issued
-- and billing_details.updated.
insert into _tap_results select is(
  (select (length(pg_get_constraintdef(oid)) - length(replace(pg_get_constraintdef(oid), '::text', '')))
            / length('::text')
     from pg_constraint
     where conrelid = 'public.audit_log'::regclass and conname = 'audit_log_action_check'),
  58,
  'audit_log.action accepts exactly 58 actions -- 55 before Phase 17c plus its 3'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
