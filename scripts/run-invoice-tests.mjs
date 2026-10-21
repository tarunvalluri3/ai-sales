// Tests for Phase 17c's GST invoices and credit notes: the financial-year
// boundary, GSTIN validation, tax arithmetic for every plan in both layouts,
// idempotent issuing (the same payment twice is one invoice), credit-note
// limits, supplier-config refusal, the PDF itself (fonts, the rupee sign,
// Indian digit grouping, long text) and the webhook wiring.
//
// Node's built-in test runner, same approach as run-plan-tax-tests.mjs and
// run-razorpay-webhook-tests.mjs. Everything under test is pure and takes
// its I/O as arguments, so this file drives the REAL issue logic against an
// in-memory store that mimics the database's counter and unique keys. The
// database's own behaviour (the counter lock, immutability, the
// can't-exceed-the-invoice trigger) is asserted against real Postgres by
// supabase/tests/database/050 and 051; the in-memory store here is only
// trusted for what those files pin down.
//
// Run: npm run test:invoices
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

register("./alias-resolver-hooks.mjs", import.meta.url);

const load = (rel) => import(new URL(rel, import.meta.url).href);
const { PLANS, ORDERED_PLANS, gstBreakdown } = await load("../lib/plans.ts");
const FY = await load("../lib/financial-year.ts");
const { validateGstin, gstinCheckCharacter } = await load("../lib/gstin.ts");
const FMT = await load("../lib/invoice-format.ts");
const CFG = await load("../lib/invoice-config.ts");
const CORE = await load("../lib/invoice-core.ts");
const SVC = await load("../lib/invoice-service.ts");
const TEXT = await load("../lib/invoice-text.ts");
const IDENT = await load("../lib/billing-identity.ts");
const PDF = await load("../lib/invoice-pdf.ts");
const FONTS = await load("../lib/invoice-pdf-fonts.ts");
const { processRazorpayEvent } = await load("../lib/razorpay-webhook.ts");
const { proRataUpgradeQuote } = await load("../lib/billing-prorata.ts");
const fontkit = (await import("@pdf-lib/fontkit")).default;

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const BUSINESS_ID = "00000000-0000-0000-0000-00000000000a";
const SUBSCRIPTION_ID = "sub_test_17c";

/** A complete, valid supplier -- the real config still has TODO placeholders on purpose. */
const SUPPLIER = {
  name: "Test Supplier Studio",
  address: "12 Test Road, Hyderabad 500001, Telangana",
  gstin: "36BYQPT2686E1ZR",
  stateCode: "36",
  stateName: "Telangana",
  sacCode: "998314",
};

const CUSTOMER_TELANGANA = {
  name: "Acme Traders Pvt Ltd",
  address: "1 Market Street\nSecunderabad 500003",
  stateCode: "36",
  gstin: null,
};
const CUSTOMER_MAHARASHTRA = {
  name: "Mumbai Buyers LLP",
  address: "9 Example Park, Andheri East, Mumbai 400093",
  stateCode: "27",
  gstin: "27AAPFU0939F1ZV",
};

function paymentFixture(overrides = {}) {
  return {
    businessId: BUSINESS_ID,
    paymentId: "pay_1",
    orderId: null,
    subscriptionId: SUBSCRIPTION_ID,
    amountPaise: PLANS.growth.monthlyPricePaise,
    currency: "INR",
    paidAt: new Date("2026-10-21T10:00:00Z"),
    purpose: "subscription_charge",
    planKey: "growth",
    period: { start: "2026-10-21T10:00:00.000Z", end: "2026-11-21T10:00:00.000Z" },
    ...overrides,
  };
}

/**
 * An in-memory stand-in for the database that mimics what issue_invoice() /
 * issue_credit_note() do: one counter per (mode, financial year), a unique
 * payment id, the invoice table's arithmetic and financial-year constraints,
 * and -- the property under test -- a failed insert rolls its counter
 * increment back.
 */
function makeStore({ supplier = SUPPLIER, customer = CUSTOMER_TELANGANA, livemode = true, failNextInsert = false } = {}) {
  const state = {
    counters: new Map(),
    invoices: [],
    notes: [],
    holds: new Map(),
    afterIssued: [],
    logs: [],
    customer,
    failNextInsert,
  };

  function checkInvoice(draft) {
    const intra = draft.supply_type === "intra-state";
    const sum = draft.taxable_paise + draft.tax_paise;
    if (sum !== draft.total_paise) throw new SVC.DocumentRejectedError("total does not add up");
    const layoutOk = intra
      ? draft.cgst_paise !== null && draft.sgst_paise !== null && draft.igst_paise === null && draft.tax_paise === draft.cgst_paise + draft.sgst_paise
      : draft.igst_paise !== null && draft.cgst_paise === null && draft.sgst_paise === null && draft.tax_paise === draft.igst_paise;
    if (!layoutOk) throw new SVC.DocumentRejectedError("tax layout");
    if (intra !== (draft.place_of_supply_state_code === draft.supplier_state_code)) {
      throw new SVC.DocumentRejectedError("supply type disagrees with states");
    }
    const start = Number(draft.financial_year.slice(0, 4));
    if (!(draft.invoice_date >= `${start}-04-01` && draft.invoice_date < `${start + 1}-04-01`)) {
      throw new SVC.DocumentRejectedError("financial year does not match the invoice date");
    }
  }

  const deps = {
    supplier,
    livemode,
    async loadCustomer() {
      return state.customer ? { details: state.customer, businessName: "Fallback Business Name" } : null;
    },
    async findInvoiceByPaymentId(paymentId) {
      return state.invoices.find((i) => i.razorpay_payment_id === paymentId) ?? null;
    },
    async issue(draft) {
      const existing = state.invoices.find((i) => i.razorpay_payment_id === draft.razorpay_payment_id);
      if (existing) return { invoice: existing, created: false };

      const key = `${draft.is_test}|${draft.financial_year}`;
      const before = state.counters.get(key) ?? 0;
      state.counters.set(key, before + 1); // incremented under the "lock"...
      try {
        if (state.failNextInsert) {
          state.failNextInsert = false;
          throw new SVC.DocumentRejectedError("simulated insert failure");
        }
        checkInvoice(draft);
        const sequence = before + 1;
        const invoice = {
          ...draft,
          id: `inv-${state.invoices.length + 1}`,
          sequence_number: sequence,
          invoice_number: FY.formatDocumentNumber("invoice", draft.financial_year, sequence, { isTest: draft.is_test }),
          issued_at: "2026-10-21T10:00:01.000Z",
          reverse_charge: false,
          currency: "INR",
        };
        state.invoices.push(invoice);
        return { invoice, created: true };
      } catch (error) {
        state.counters.set(key, before); // ...and rolled back with the failed insert
        throw error;
      }
    },
    async recordHold(hold) {
      state.holds.set(hold.paymentId, hold);
    },
    async clearHold(paymentId) {
      state.holds.delete(paymentId);
    },
    async afterIssued(invoice) {
      state.afterIssued.push(invoice.invoice_number);
    },
    log(event, businessId, metadata, level) {
      state.logs.push({ event, businessId, metadata, level });
    },
  };
  return { deps, state };
}

function makeCreditDeps(store, { extraNotes = [] } = {}) {
  const state = { notes: [...extraNotes], counters: new Map(), logs: [], afterIssued: [] };
  const deps = {
    async findCreditNoteByRefundId(refundId) {
      return state.notes.find((n) => n.razorpay_refund_id === refundId) ?? null;
    },
    async findInvoiceByPaymentId(paymentId) {
      return store.state.invoices.find((i) => i.razorpay_payment_id === paymentId) ?? null;
    },
    async creditedSoFar(invoiceId) {
      const mine = state.notes.filter((n) => n.invoice_id === invoiceId);
      const sum = (key) => mine.reduce((total, n) => total + (n[key] ?? 0), 0);
      return {
        totalPaise: sum("total_paise"),
        taxablePaise: sum("taxable_paise"),
        taxPaise: sum("tax_paise"),
        cgstPaise: sum("cgst_paise"),
        sgstPaise: sum("sgst_paise"),
        igstPaise: sum("igst_paise"),
      };
    },
    async issue(draft) {
      const existing = state.notes.find((n) => n.razorpay_refund_id === draft.razorpay_refund_id);
      if (existing) return { note: existing, created: false };
      const key = `${draft.is_test}|${draft.financial_year}`;
      const sequence = (state.counters.get(key) ?? 0) + 1;
      state.counters.set(key, sequence);
      const note = {
        ...draft,
        id: `cn-${state.notes.length + 1}`,
        sequence_number: sequence,
        credit_note_number: FY.formatDocumentNumber("credit_note", draft.financial_year, sequence, { isTest: draft.is_test }),
        issued_at: "2026-10-25T10:00:00.000Z",
        reverse_charge: false,
        currency: "INR",
      };
      state.notes.push(note);
      return { note, created: true };
    },
    async afterIssued(note) {
      state.afterIssued.push(note.credit_note_number);
    },
    log(event, businessId, metadata, level) {
      state.logs.push({ event, businessId, metadata, level });
    },
  };
  return { deps, state };
}

/* ================================================================== *
 * 1. Financial year and numbering
 * ================================================================== */

test("the financial year changes at midnight IST on 1 April, not at midnight UTC", () => {
  // 23:59:59 IST on 31 March 2027 is 18:29:59 UTC: still 2026-27.
  assert.equal(FY.financialYearForInstant(new Date("2027-03-31T18:29:59Z")), "2026-27");
  assert.equal(FY.istDateString(new Date("2027-03-31T18:29:59Z")), "2027-03-31");
  // 00:00:00 IST on 1 April is 18:30:00 UTC the day before: already 2027-28.
  assert.equal(FY.financialYearForInstant(new Date("2027-03-31T18:30:00Z")), "2027-28");
  assert.equal(FY.istDateString(new Date("2027-03-31T18:30:00Z")), "2027-04-01");
  // 11pm IST on 31 March (17:30 UTC) is the old year -- the case the brief names.
  assert.equal(FY.financialYearForInstant(new Date("2027-03-31T17:30:00Z")), "2026-27");
  // A UTC calendar would call this 31 March; IST has already rolled over.
  assert.equal(FY.financialYearForInstant(new Date("2027-03-31T20:00:00Z")), "2027-28");
});

test("financial-year arithmetic across a century and every month", () => {
  assert.equal(FY.financialYearForInstant(new Date("2026-04-01T00:00:00+05:30")), "2026-27");
  assert.equal(FY.financialYearForInstant(new Date("2026-03-31T23:59:59+05:30")), "2025-26");
  assert.equal(FY.financialYearForInstant(new Date("2026-01-15T12:00:00+05:30")), "2025-26");
  assert.equal(FY.financialYearForInstant(new Date("2026-12-31T12:00:00+05:30")), "2026-27");
  // The century rollover is two digits wrapping, not a bug.
  assert.equal(FY.financialYearForInstant(new Date("2099-10-01T12:00:00+05:30")), "2099-00");
  assert.throws(() => FY.financialYearForInstant(new Date("not a date")));
});

test("document numbers are at most 16 characters, in two series plus their test twins", () => {
  assert.equal(FY.formatDocumentNumber("invoice", "2026-27", 1), "WAP/2026-27/0001");
  assert.equal(FY.formatDocumentNumber("credit_note", "2026-27", 1), "WAC/2026-27/0001");
  assert.equal(FY.formatDocumentNumber("invoice", "2026-27", 1, { isTest: true }), "TST/2026-27/0001");
  assert.equal(FY.formatDocumentNumber("credit_note", "2026-27", 42, { isTest: true }), "TSC/2026-27/0042");
  assert.equal(FY.formatDocumentNumber("invoice", "2026-27", 9999).length, 16);
  assert.ok(FY.formatDocumentNumber("invoice", "2026-27", 9999).length <= FY.MAX_DOCUMENT_NUMBER_LENGTH);
  // The brief's example 'WAP/CN/2026-27/0001' would be 19 characters: over the GST limit.
  assert.equal("WAP/CN/2026-27/0001".length, 19);
  assert.throws(() => FY.formatDocumentNumber("invoice", "2026-27", 10000), /outside/);
  assert.throws(() => FY.formatDocumentNumber("invoice", "2026-27", 0), /outside/);
});

test("numbers are sequential and gap-free within a year, and restart on 1 April IST", async () => {
  const { deps } = makeStore();
  const numbers = [];
  const dates = [
    "2027-03-31T17:30:00Z", // 23:00 IST 31 March -> 2026-27
    "2027-03-31T18:29:59Z", // 23:59:59 IST 31 March -> 2026-27
    "2027-03-31T18:30:00Z", // 00:00:00 IST 1 April -> 2027-28, restarts at 0001
    "2027-04-02T05:00:00Z", // 2027-28
  ];
  for (const [index, paidAt] of dates.entries()) {
    const outcome = await SVC.issueInvoiceForPayment(deps, paymentFixture({ paymentId: `pay_${index}`, paidAt: new Date(paidAt) }));
    assert.equal(outcome.status, "issued");
    numbers.push(outcome.invoice.invoice_number);
  }
  assert.deepEqual(numbers, ["WAP/2026-27/0001", "WAP/2026-27/0002", "WAP/2027-28/0001", "WAP/2027-28/0002"]);
});

test("a failed insert does not burn a number: the next invoice takes it", async () => {
  const { deps, state } = makeStore();
  await SVC.issueInvoiceForPayment(deps, paymentFixture({ paymentId: "pay_a" }));

  state.failNextInsert = true;
  const failed = await SVC.issueInvoiceForPayment(deps, paymentFixture({ paymentId: "pay_b" }));
  assert.equal(failed.status, "held", "a refused insert parks the payment instead of failing the webhook");
  assert.equal(failed.reason, "issue_failed");
  assert.equal(state.counters.get("false|2026-27"), 1, "the counter was rolled back with the failed insert");

  const next = await SVC.issueInvoiceForPayment(deps, paymentFixture({ paymentId: "pay_c" }));
  assert.equal(next.invoice.invoice_number, "WAP/2026-27/0002", "no gap where the failed one was");
});

test("test-mode payments are numbered in their own series and never use up a real number", async () => {
  const test = makeStore({ livemode: false });
  const live = makeStore({ livemode: true });
  const a = await SVC.issueInvoiceForPayment(test.deps, paymentFixture({ paymentId: "pay_t1" }));
  const b = await SVC.issueInvoiceForPayment(live.deps, paymentFixture({ paymentId: "pay_l1" }));
  assert.equal(a.invoice.invoice_number, "TST/2026-27/0001");
  assert.equal(a.invoice.is_test, true);
  assert.equal(b.invoice.invoice_number, "WAP/2026-27/0001");
  assert.equal(b.invoice.is_test, false);
});

/* ================================================================== *
 * 2. GSTIN validation
 * ================================================================== */

test("a valid GSTIN passes, and lower case is accepted", () => {
  assert.deepEqual(validateGstin("36BYQPT2686E1ZR"), { ok: true, gstin: "36BYQPT2686E1ZR", stateCode: "36" });
  assert.deepEqual(validateGstin("27AAPFU0939F1ZV"), { ok: true, gstin: "27AAPFU0939F1ZV", stateCode: "27" });
  assert.equal(validateGstin("  36byqpt2686e1zr ").ok, true);
  assert.equal(validateGstin("36BYQPT2686E1ZR", "36").ok, true);
});

test("a GSTIN with a wrong check digit is rejected, every position of it", () => {
  const good = "36BYQPT2686E1ZR";
  assert.equal(gstinCheckCharacter(good.slice(0, 14)), "R");
  let rejected = 0;
  for (const wrong of "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (wrong === "R") continue;
    const result = validateGstin(good.slice(0, 14) + wrong);
    assert.deepEqual(result, { ok: false, problem: "check_digit" }, `check digit ${wrong}`);
    rejected++;
  }
  assert.equal(rejected, 35);
  // A single-character typo elsewhere also breaks the check digit.
  assert.equal(validateGstin("36BYQPT2687E1ZR").ok, false);
  // The conventional documentation example is NOT a valid GSTIN: it has no valid check digit.
  assert.deepEqual(validateGstin("22AAAAA0000A1Z5"), { ok: false, problem: "check_digit" });
});

test("a GSTIN must agree with the state it is declared in", () => {
  assert.deepEqual(validateGstin("27AAPFU0939F1ZV", "36"), { ok: false, problem: "state_mismatch" });
  assert.equal(validateGstin("27AAPFU0939F1ZV", "27").ok, true);
});

test("malformed GSTINs are rejected for format before anything else", () => {
  for (const bad of ["", "36BYQPT2686E1Z", "36BYQPT2686E1ZRR", "36BYQPT2686E0ZR", "36BYQPT2686E1XR", "XXBYQPT2686E1ZR", "3-BYQPT2686E1ZR"]) {
    assert.deepEqual(validateGstin(bad), { ok: false, problem: "format" }, JSON.stringify(bad));
  }
});

test("the billing form schema applies the same rules at the boundary", () => {
  const form = (fields) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return IDENT.parseBillingIdentityForm(data);
  };
  const base = { billingName: "Acme Traders", billingAddress: "1 Market Street, Secunderabad 500003", stateCode: "36", gstin: "" };

  assert.equal(form(base).ok, true);
  assert.equal(form({ ...base, gstin: "36byqpt2686e1zr" }).identity.gstin, "36BYQPT2686E1ZR");
  assert.match(form({ ...base, gstin: "36BYQPT2686E1ZS" }).error, /not valid/);
  assert.match(form({ ...base, stateCode: "27", gstin: "36BYQPT2686E1ZR" }).error, /does not match the state/);
  assert.match(form({ ...base, stateCode: "" }).error, /Select your state/);
  assert.match(form({ ...base, billingName: "  " }).error, /name/);
  assert.match(form({ ...base, billingAddress: "short" }).error, /address/);
  // Text the invoice font cannot print is refused at the form, not at the PDF.
  assert.match(form({ ...base, billingName: "ఆంధ్ర" }).error, /English/);
  assert.match(form({ ...base, billingName: "Acme \u{1F600}" }).error, /English/);
});

/* ================================================================== *
 * 3. Tax arithmetic on invoices
 * ================================================================== */

const GROSSES = ORDERED_PLANS.flatMap((plan) => [
  { label: `${plan.key} monthly`, gross: plan.monthlyPricePaise, planKey: plan.key, purpose: "subscription_charge" },
  { label: `${plan.key} annual`, gross: plan.annualPricePaise, planKey: plan.key, purpose: "annual" },
]);

for (const { label, gross, planKey, purpose } of GROSSES) {
  for (const [layout, customer, expectedLayout] of [
    ["CGST+SGST", CUSTOMER_TELANGANA, "intra-state"],
    ["IGST", CUSTOMER_MAHARASHTRA, "inter-state"],
  ]) {
    test(`${label} (${layout}): taxable + tax = the gross charged, to the paisa`, async () => {
      const { deps, state } = makeStore({ customer });
      const outcome = await SVC.issueInvoiceForPayment(
        deps,
        paymentFixture({ paymentId: `pay_${label}_${layout}`, amountPaise: gross, planKey, purpose }),
      );
      assert.equal(outcome.status, "issued");
      const invoice = outcome.invoice;
      assert.equal(invoice.supply_type, expectedLayout);
      assert.equal(invoice.total_paise, gross);
      assert.equal(invoice.taxable_paise + invoice.tax_paise, gross);

      if (layout === "CGST+SGST") {
        assert.equal(invoice.igst_paise, null);
        assert.equal(invoice.cgst_paise + invoice.sgst_paise, invoice.tax_paise);
        assert.ok(invoice.sgst_paise - invoice.cgst_paise === 0 || invoice.sgst_paise - invoice.cgst_paise === 1);
      } else {
        assert.equal(invoice.cgst_paise, null);
        assert.equal(invoice.sgst_paise, null);
        assert.equal(invoice.igst_paise, invoice.tax_paise);
      }
      // The figures are exactly gstBreakdown()'s -- there is no second implementation.
      const reference = gstBreakdown(gross, expectedLayout);
      assert.equal(invoice.taxable_paise, reference.taxablePaise);
      assert.equal(invoice.tax_paise, reference.taxPaise);
      assert.equal(state.invoices.length, 1);
    });
  }
}

test("hand-checked figures for the three monthly plans (intra-state)", async () => {
  const expected = {
    starter: { taxable: 127_034, cgst: 11_433, sgst: 11_433 },
    growth: { taxable: 338_898, cgst: 30_501, sgst: 30_501 },
    // Scale is the half-paisa case: 762.635 each way -> CGST 762.63 + SGST 762.64, never both rounded up.
    scale: { taxable: 847_373, cgst: 76_263, sgst: 76_264 },
  };
  for (const [planKey, want] of Object.entries(expected)) {
    const { deps } = makeStore();
    const outcome = await SVC.issueInvoiceForPayment(
      deps,
      paymentFixture({ paymentId: `pay_${planKey}`, planKey, amountPaise: PLANS[planKey].monthlyPricePaise }),
    );
    assert.equal(outcome.invoice.taxable_paise, want.taxable, planKey);
    assert.equal(outcome.invoice.cgst_paise, want.cgst, planKey);
    assert.equal(outcome.invoice.sgst_paise, want.sgst, planKey);
  }
});

test("the tax is taken from the amount actually PAID: a pro-rated upgrade is not a plan price", async () => {
  const quote = proRataUpgradeQuote({
    fromPlanKey: "starter",
    toPlanKey: "growth",
    interval: "monthly",
    periodStartIso: "2026-10-01T00:00:00.000Z",
    periodEndIso: "2026-10-31T00:00:00.000Z",
    now: new Date("2026-10-12T08:00:00Z"),
  });
  const allPrices = ORDERED_PLANS.flatMap((p) => [p.monthlyPricePaise, p.annualPricePaise]);
  assert.ok(quote.amountPaise > 0, "a real mid-period quote");
  assert.ok(!allPrices.includes(quote.amountPaise), `${quote.amountPaise} must not be any plan's list price`);

  const { deps } = makeStore();
  const outcome = await SVC.issueInvoiceForPayment(
    deps,
    paymentFixture({
      paymentId: "pay_prorata",
      amountPaise: quote.amountPaise,
      planKey: "growth",
      purpose: "upgrade_prorata",
      subscriptionId: null,
      orderId: "order_prorata",
    }),
  );
  const invoice = outcome.invoice;
  assert.equal(invoice.total_paise, quote.amountPaise, "the invoice states what was collected");
  assert.notEqual(invoice.total_paise, PLANS.growth.monthlyPricePaise);
  assert.equal(invoice.taxable_paise + invoice.tax_paise, quote.amountPaise);
  assert.equal(invoice.taxable_paise, gstBreakdown(quote.amountPaise, "intra-state").taxablePaise);
  assert.match(invoice.service_description, /upgrade/i);
});

test("nothing charged means no invoice; a non-INR payment is refused, loudly", async () => {
  const { deps, state } = makeStore();
  const zero = await SVC.issueInvoiceForPayment(deps, paymentFixture({ amountPaise: 0 }));
  assert.deepEqual(zero, { status: "skipped", reason: "nothing_charged" });
  const usd = await SVC.issueInvoiceForPayment(deps, paymentFixture({ paymentId: "pay_usd", currency: "USD" }));
  assert.deepEqual(usd, { status: "skipped", reason: "unsupported_currency" });
  assert.equal(state.invoices.length, 0);
  assert.ok(state.logs.some((l) => l.event === "invoice_skipped_unsupported_currency" && l.level === "error"));
});

test("the service period is shown in IST, ending the day before the next period starts", () => {
  const line = CORE.describeInvoiceLine(paymentFixture({ period: { start: "2026-10-21T10:00:00.000Z", end: "2026-11-21T10:00:00.000Z" } }));
  assert.equal(line, "Waves AI Pilot Growth plan - monthly subscription (21 Oct 2026 to 21 Nov 2026)");
  // Razorpay's current_end is the instant the NEXT period starts; midnight IST on the 21st is the 20th's last second.
  const midnight = CORE.describeInvoiceLine(
    paymentFixture({ period: { start: "2026-10-20T18:30:00.000Z", end: "2026-11-20T18:30:00.000Z" } }),
  );
  assert.match(midnight, /\(21 Oct 2026 to 20 Nov 2026\)$/);
});

/* ================================================================== *
 * 4. Idempotency: one payment, one invoice
 * ================================================================== */

test("replaying the same payment twice yields exactly one invoice and one number", async () => {
  const { deps, state } = makeStore();
  const first = await SVC.issueInvoiceForPayment(deps, paymentFixture());
  const second = await SVC.issueInvoiceForPayment(deps, paymentFixture());

  assert.equal(first.status, "issued");
  assert.equal(first.created, true);
  assert.equal(second.status, "issued");
  assert.equal(second.created, false, "the replay found the existing invoice");
  assert.equal(second.invoice.invoice_number, first.invoice.invoice_number);
  assert.equal(state.invoices.length, 1);
  assert.equal(state.counters.get("false|2026-27"), 1, "the replay took no number");

  const next = await SVC.issueInvoiceForPayment(deps, paymentFixture({ paymentId: "pay_2" }));
  assert.equal(next.invoice.invoice_number, "WAP/2026-27/0002", "the next payment gets 0002, not 0003");
});

test("a replay after the customer's details changed is NOT parked as a hold", async () => {
  const { deps, state } = makeStore();
  await SVC.issueInvoiceForPayment(deps, paymentFixture());
  state.customer = { name: "Renamed", address: "", stateCode: null, gstin: null }; // now unusable
  const replay = await SVC.issueInvoiceForPayment(deps, paymentFixture());
  assert.equal(replay.status, "issued");
  assert.equal(state.holds.size, 0);
});

test("a replay re-runs the once-only email step, repairing a crash between insert and email", async () => {
  const { deps, state } = makeStore();
  await SVC.issueInvoiceForPayment(deps, paymentFixture());
  await SVC.issueInvoiceForPayment(deps, paymentFixture());
  assert.equal(state.afterIssued.length, 2, "afterIssued is called on the replay too; it is at-most-once on its own");
});

/* ================================================================== *
 * 5. Missing details never produce a guessed invoice
 * ================================================================== */

test("a missing state parks the payment as a hold: no invoice, an error log, no fabricated place of supply", async () => {
  const { deps, state } = makeStore({ customer: { name: "Acme", address: "1 Market Street, Secunderabad", stateCode: null, gstin: null } });
  const outcome = await SVC.issueInvoiceForPayment(deps, paymentFixture());

  assert.equal(outcome.status, "held");
  assert.equal(outcome.reason, "missing_customer_details");
  assert.equal(state.invoices.length, 0, "nothing was issued");
  assert.equal(state.counters.size, 0, "and no number was taken");
  assert.ok(state.holds.has("pay_1"));
  assert.ok(state.logs.some((l) => l.event === "invoice_held" && l.level === "error"), "visible: logged at error level");

  // Once the customer provides it, the held payment becomes the invoice it was owed.
  state.customer = CUSTOMER_TELANGANA;
  const resolved = await SVC.issueInvoiceForPayment(deps, SVC.holdToPayment(state.holds.get("pay_1")));
  assert.equal(resolved.status, "issued");
  assert.equal(state.holds.size, 0, "the hold is cleared once the invoice exists");
  assert.equal(resolved.invoice.invoice_date, "2026-10-21", "dated by the PAYMENT, not by when it was finally issued");
});

test("a missing address, or a GSTIN that does not match the state, also parks the payment", async () => {
  for (const [customer, reason] of [
    [{ name: "Acme", address: null, stateCode: "36", gstin: null }, "missing_customer_details"],
    [{ name: "Acme", address: "1 Market Street, Hyderabad", stateCode: "36", gstin: "27AAPFU0939F1ZV" }, "invalid_customer_details"],
    [{ name: "Acme", address: "1 Market Street, Hyderabad", stateCode: "36", gstin: "36BYQPT2686E1ZS" }, "invalid_customer_details"],
    [{ name: "Acme ఆ", address: "1 Market Street, Hyderabad", stateCode: "36", gstin: null }, "invalid_customer_details"],
  ]) {
    const { deps, state } = makeStore({ customer });
    const outcome = await SVC.issueInvoiceForPayment(deps, paymentFixture());
    assert.equal(outcome.status, "held");
    assert.equal(outcome.reason, reason);
    assert.equal(state.invoices.length, 0);
  }
});

test("the billing name falls back to the business name, which is a real fact we hold", async () => {
  const { deps } = makeStore({ customer: { name: null, address: "1 Market Street, Hyderabad", stateCode: "36", gstin: null } });
  const outcome = await SVC.issueInvoiceForPayment(deps, paymentFixture());
  assert.equal(outcome.invoice.customer_name, "Fallback Business Name");
});

test("the real supplier config still has TODO placeholders, so the generator refuses to issue anything", async () => {
  const problems = CFG.supplierConfigProblems(CFG.SUPPLIER);
  assert.ok(problems.some((p) => p.startsWith("address")), "the address placeholder is detected");
  assert.ok(problems.some((p) => p.startsWith("sacCode")), "the SAC placeholder is detected");
  assert.throws(() => CFG.assertSupplierConfigReady(CFG.SUPPLIER), CFG.SupplierConfigIncompleteError);

  // The supplier facts that ARE known are right: a regression guard on the one place they live.
  assert.equal(CFG.SUPPLIER.gstin, "36BYQPT2686E1ZR");
  assert.equal(CFG.SUPPLIER.stateCode, "36");
  assert.equal(CFG.SUPPLIER.name, "Waves Web Studio");
  assert.equal(validateGstin(CFG.SUPPLIER.gstin, CFG.SUPPLIER.stateCode).ok, true);

  // Through the real service: nothing is issued, nothing is snapshotted, the payment is parked.
  const { deps, state } = makeStore({ supplier: CFG.SUPPLIER });
  const outcome = await SVC.issueInvoiceForPayment(deps, paymentFixture());
  assert.equal(outcome.status, "held");
  assert.equal(outcome.reason, "supplier_config_incomplete");
  assert.equal(state.invoices.length, 0);
  assert.throws(
    () => CORE.buildInvoiceDraft({ payment: paymentFixture(), customer: { ...CUSTOMER_TELANGANA, stateName: "Telangana" }, supplier: CFG.SUPPLIER, isTest: false }),
    CFG.SupplierConfigIncompleteError,
    "building a draft refuses too, so no caller can route around the service",
  );
});

test("supplier config is also refused for a bad GSTIN, a mismatched state or a non-SAC", () => {
  const ready = { ...SUPPLIER };
  assert.deepEqual(CFG.supplierConfigProblems(ready), []);
  assert.ok(CFG.supplierConfigProblems({ ...ready, gstin: "36BYQPT2686E1ZS" }).some((p) => p.startsWith("gstin")));
  assert.ok(CFG.supplierConfigProblems({ ...ready, stateCode: "27", stateName: "Maharashtra" }).some((p) => p.startsWith("gstin")));
  assert.ok(CFG.supplierConfigProblems({ ...ready, stateName: "Karnataka" }).some((p) => p.includes("stateName")));
  assert.ok(CFG.supplierConfigProblems({ ...ready, sacCode: "ABC" }).some((p) => p.startsWith("sacCode")));
  assert.ok(CFG.supplierConfigProblems({ ...ready, address: "   " }).some((p) => p.startsWith("address")));
});

/* ================================================================== *
 * 6. Credit notes
 * ================================================================== */

async function issuedInvoice(overrides = {}, storeOptions = {}) {
  const store = makeStore(storeOptions);
  const outcome = await SVC.issueInvoiceForPayment(store.deps, paymentFixture(overrides));
  return { store, invoice: outcome.invoice };
}

function refund(overrides = {}) {
  return {
    paymentId: "pay_1",
    refundId: "rfnd_1",
    amountPaise: 100_000,
    refundedAt: new Date("2026-10-25T10:00:00Z"),
    reason: "duplicate_or_incorrect_charge",
    ...overrides,
  };
}

test("a full refund reverses the invoice exactly: taxable, CGST, SGST and total", async () => {
  const { store, invoice } = await issuedInvoice();
  const { deps } = makeCreditDeps(store);
  const outcome = await SVC.issueCreditNoteForRefund(deps, refund({ amountPaise: invoice.total_paise }));
  assert.equal(outcome.status, "issued");
  const note = outcome.note;
  assert.equal(note.credit_note_number, "WAC/2026-27/0001");
  assert.equal(note.original_invoice_number, invoice.invoice_number);
  assert.equal(note.total_paise, invoice.total_paise);
  assert.equal(note.taxable_paise, invoice.taxable_paise);
  assert.equal(note.cgst_paise, invoice.cgst_paise);
  assert.equal(note.sgst_paise, invoice.sgst_paise);
  assert.equal(note.igst_paise, null);
});

test("partial notes reverse the tax proportionally and the notes add up to the invoice to the paisa", async () => {
  for (const planKey of ["starter", "growth", "scale"]) {
    for (const customer of [CUSTOMER_TELANGANA, CUSTOMER_MAHARASHTRA]) {
      const gross = PLANS[planKey].monthlyPricePaise;
      const { store, invoice } = await issuedInvoice({ planKey, amountPaise: gross }, { customer });
      const { deps, state } = makeCreditDeps(store);

      // Awkward, uneven partial amounts that force rounding at every step.
      const parts = [1, 7, 333, 12_345, 50_001];
      const used = parts.reduce((a, b) => a + b, 0);
      let n = 0;
      for (const amountPaise of parts) {
        const outcome = await SVC.issueCreditNoteForRefund(deps, refund({ refundId: `rfnd_p${n++}`, amountPaise }));
        assert.equal(outcome.status, "issued", `${planKey} part ${amountPaise}`);
      }
      // The closing note takes exactly what is left.
      const closing = await SVC.issueCreditNoteForRefund(deps, refund({ refundId: "rfnd_last", amountPaise: gross - used }));
      assert.equal(closing.status, "issued");

      const sum = (key) => state.notes.reduce((t, note) => t + (note[key] ?? 0), 0);
      assert.equal(sum("total_paise"), gross, `${planKey}: totals add up`);
      assert.equal(sum("taxable_paise"), invoice.taxable_paise, `${planKey}: taxable adds up`);
      assert.equal(sum("tax_paise"), invoice.tax_paise, `${planKey}: tax adds up`);
      assert.equal(sum("cgst_paise"), invoice.cgst_paise ?? 0);
      assert.equal(sum("sgst_paise"), invoice.sgst_paise ?? 0);
      assert.equal(sum("igst_paise"), invoice.igst_paise ?? 0);

      for (const note of state.notes) {
        assert.equal(note.taxable_paise + note.tax_paise, note.total_paise, "each note adds up on its own");
        assert.ok(note.taxable_paise >= 0 && note.tax_paise >= 0);
      }
    }
  }
});

test("a credit note larger than the invoice is refused", async () => {
  const { store, invoice } = await issuedInvoice();
  const { deps, state } = makeCreditDeps(store);
  const outcome = await SVC.issueCreditNoteForRefund(deps, refund({ amountPaise: invoice.total_paise + 1 }));
  assert.equal(outcome.status, "refused");
  assert.equal(outcome.reason, "exceeds_invoice");
  assert.equal(outcome.remainingPaise, invoice.total_paise);
  assert.equal(state.notes.length, 0);
  assert.ok(state.logs.some((l) => l.event === "credit_note_refused" && l.level === "error"));
});

test("credit notes that together exceed the invoice are refused, across partial notes", async () => {
  const { store, invoice } = await issuedInvoice();
  const { deps, state } = makeCreditDeps(store);

  const first = await SVC.issueCreditNoteForRefund(deps, refund({ refundId: "rfnd_1", amountPaise: 100_000 }));
  assert.equal(first.status, "issued");
  const tooMuch = await SVC.issueCreditNoteForRefund(deps, refund({ refundId: "rfnd_2", amountPaise: invoice.total_paise - 100_000 + 1 }));
  assert.equal(tooMuch.status, "refused");
  assert.equal(tooMuch.remainingPaise, invoice.total_paise - 100_000);

  const rest = await SVC.issueCreditNoteForRefund(deps, refund({ refundId: "rfnd_3", amountPaise: invoice.total_paise - 100_000 }));
  assert.equal(rest.status, "issued", "exactly the remainder is fine");
  const beyond = await SVC.issueCreditNoteForRefund(deps, refund({ refundId: "rfnd_4", amountPaise: 1 }));
  assert.equal(beyond.status, "refused", "a fully credited invoice accepts nothing more");
  assert.equal(state.notes.length, 2);
});

test("zero, negative and fractional refund amounts are refused", async () => {
  const { store } = await issuedInvoice();
  const { deps } = makeCreditDeps(store);
  for (const amountPaise of [0, -5, 12.5, Number.NaN]) {
    const outcome = await SVC.issueCreditNoteForRefund(deps, refund({ refundId: `rfnd_${amountPaise}`, amountPaise }));
    assert.equal(outcome.status, "refused", String(amountPaise));
    assert.equal(outcome.reason, "not_positive");
  }
});

test("a refund for a payment we never invoiced has no credit note, and is not an error", async () => {
  const { store } = await issuedInvoice();
  const { deps, state } = makeCreditDeps(store);
  const outcome = await SVC.issueCreditNoteForRefund(deps, refund({ paymentId: "pay_never_invoiced" }));
  assert.deepEqual(outcome, { status: "no_invoice" });
  assert.equal(state.notes.length, 0);
});

test("a refund replayed is one credit note: the script, the webhook and a dashboard refund can all arrive", async () => {
  const { store, invoice } = await issuedInvoice();
  const { deps, state } = makeCreditDeps(store);
  const a = await SVC.issueCreditNoteForRefund(deps, refund({ amountPaise: invoice.total_paise }));
  const b = await SVC.issueCreditNoteForRefund(deps, refund({ amountPaise: invoice.total_paise }));
  assert.equal(a.status, "issued");
  assert.equal(b.status, "issued");
  assert.equal(b.created, false, "the second arrival found the first's note instead of tripping the can't-exceed rule");
  assert.equal(state.notes.length, 1);
});

test("a credit note belongs to the year of the REFUND and shows the invoice's own snapshot", async () => {
  const { store, invoice } = await issuedInvoice({ paidAt: new Date("2027-03-30T10:00:00Z") });
  assert.equal(invoice.financial_year, "2026-27");
  // The customer has since moved state and renamed itself; the note must still show the original.
  store.state.customer = { name: "Renamed Co", address: "New address, Chennai", stateCode: "33", gstin: null };
  const { deps } = makeCreditDeps(store);
  const outcome = await SVC.issueCreditNoteForRefund(
    deps,
    refund({ amountPaise: 50_000, refundedAt: new Date("2027-04-02T10:00:00Z") }),
  );
  assert.equal(outcome.note.financial_year, "2027-28");
  assert.equal(outcome.note.credit_note_number, "WAC/2027-28/0001");
  assert.equal(outcome.note.customer_name, invoice.customer_name);
  assert.equal(outcome.note.customer_state_code, invoice.customer_state_code);
  assert.equal(outcome.note.original_invoice_date, invoice.invoice_date);
});

test("a credit note against a test invoice is a test credit note", async () => {
  const { store } = await issuedInvoice({}, { livemode: false });
  const { deps } = makeCreditDeps(store);
  const outcome = await SVC.issueCreditNoteForRefund(deps, refund({ amountPaise: 1000 }));
  assert.equal(outcome.note.is_test, true);
  assert.equal(outcome.note.credit_note_number, "TSC/2026-27/0001");
});

/* ================================================================== *
 * 7. Formatting: two decimals, Indian grouping, words
 * ================================================================== */

test("money has two decimals and Indian digit grouping", () => {
  assert.equal(FMT.formatPaiseAmount(12_345_600), "1,23,456.00");
  assert.equal(FMT.formatPaiseAmount(847_373), "8,473.73");
  assert.equal(FMT.formatPaiseAmount(76_263), "762.63");
  assert.equal(FMT.formatPaiseAmount(5), "0.05");
  assert.equal(FMT.formatPaiseAmount(0), "0.00");
  assert.equal(FMT.formatPaiseAmount(100_00), "100.00");
  assert.equal(FMT.formatPaiseAmount(999_999_999_00), "99,99,99,999.00");
  assert.equal(FMT.formatPaiseAsInr2dp(149_900), "₹1,499.00");
  assert.equal(FMT.formatPaiseAsInr2dp(1_000_000_000), "₹1,00,00,000.00");
  assert.equal(FMT.formatPaiseAsInr2dp(100_000_000), "₹10,00,000.00");
  assert.throws(() => FMT.formatPaiseAmount(1.5));
  assert.throws(() => FMT.formatPaiseAmount(-1));
});

test("the whole-rupee formatter is NOT used for tax lines: it would print 8,474 for 8,473.73", async () => {
  const { formatPaiseAsInr } = await load("../lib/plans.ts");
  assert.equal(formatPaiseAsInr(847_373), "₹8,474", "whole-rupee rounding is wrong for a taxable value");
  assert.equal(FMT.formatPaiseAsInr2dp(847_373), "₹8,473.73");
});

test("amounts in words use the Indian system", () => {
  assert.equal(FMT.paiseInWords(149_900), "Rupees One Thousand Four Hundred Ninety-Nine Only");
  assert.equal(FMT.paiseInWords(152_527), "Rupees One Thousand Five Hundred Twenty-Five and Twenty-Seven Paise Only");
  assert.equal(FMT.paiseInWords(12_345_600), "Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six Only");
  assert.equal(FMT.paiseInWords(10_000_000_00), "Rupees One Crore Only");
  assert.equal(FMT.paiseInWords(9_999_000), "Rupees Ninety-Nine Thousand Nine Hundred Ninety Only");
  assert.equal(FMT.paiseInWords(100), "Rupees One Only");
  assert.equal(FMT.paiseInWords(5), "Rupees Zero and Five Paise Only");
  assert.equal(FMT.paiseInWords(2_100_000_000_00), "Rupees Two Hundred Ten Crore Only");
});

test("dates print as day, month name, year", () => {
  assert.equal(FMT.formatIsoDate("2026-10-21"), "21 Oct 2026");
  assert.equal(FMT.formatIsoDate("2027-04-01"), "1 Apr 2027");
  assert.throws(() => FMT.formatIsoDate("21/10/2026"));
});

/* ================================================================== *
 * 8. Fonts: the rupee sign, and every character a customer may type
 * ================================================================== */

function openFont(bytes) {
  const font = fontkit.create(Buffer.from(bytes));
  return font.fonts ? font.fonts[0] : font;
}

test("both embedded fonts contain the rupee sign -- checked against the font's own glyph table", () => {
  for (const [name, bytes] of [["Geist Regular", FONTS.GEIST_REGULAR_TTF], ["Geist SemiBold", FONTS.GEIST_SEMIBOLD_TTF]]) {
    const font = openFont(bytes);
    assert.equal(font.hasGlyphForCodePoint(0x20b9), true, `${name} has U+20B9`);
  }
});

test("the standard fonts a naive implementation would use do NOT have the rupee sign", () => {
  // Why the font is embedded at all. Liberation Sans ships in node_modules/pdfjs-dist.
  const liberation = path.resolve("node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf");
  if (!fs.existsSync(liberation)) return;
  assert.equal(openFont(fs.readFileSync(liberation)).hasGlyphForCodePoint(0x20b9), false);
});

test("every character the invoice text allow-list admits has a glyph in both fonts", () => {
  const regular = openFont(FONTS.GEIST_REGULAR_TTF);
  const semibold = openFont(FONTS.GEIST_SEMIBOLD_TTF);
  let checked = 0;
  const missing = [];
  for (const [low, high] of TEXT.INVOICE_TEXT_RANGES) {
    for (let cp = low; cp <= high; cp++) {
      if (TEXT.INVOICE_TEXT_EXCLUDED.has(cp)) continue; // deliberately refused: the fonts have no glyph
      for (const [name, font] of [["regular", regular], ["semibold", semibold]]) {
        if (!font.hasGlyphForCodePoint(cp)) missing.push(`U+${cp.toString(16)} (${name})`);
      }
      checked++;
    }
  }
  assert.deepEqual(missing, [], `allow-list characters with no glyph: ${missing.slice(0, 10).join(", ")}`);
  assert.ok(checked > 300);
  // The exclusions are real: each one lacks a glyph in at least one face, and is refused as input.
  for (const cp of TEXT.INVOICE_TEXT_EXCLUDED) {
    assert.ok(!regular.hasGlyphForCodePoint(cp) || !semibold.hasGlyphForCodePoint(cp), `U+${cp.toString(16)} is excluded for a reason`);
    assert.deepEqual(TEXT.unsupportedInvoiceCharacters(String.fromCodePoint(cp)), [String.fromCodePoint(cp)]);
  }
});

test("text outside the allow-list is detected, and normalisation never changes the letters", () => {
  assert.deepEqual(TEXT.unsupportedInvoiceCharacters("Acme & Sons, 12/B ₹ – éü"), []);
  assert.deepEqual(TEXT.unsupportedInvoiceCharacters("ఆం"), ["ఆ", "ం"]);
  assert.deepEqual(TEXT.unsupportedInvoiceCharacters("smile \u{1F600}"), ["\u{1F600}"]);
  assert.equal(TEXT.normalizeInvoiceText("  Acme   \t Sons \r\n\r\n 12 Road ", { multiline: true }), "Acme Sons\n12 Road");
  assert.equal(TEXT.normalizeInvoiceText("Acme\nSons", { multiline: false }), "Acme Sons");
});

/* ================================================================== *
 * 9. The PDF itself
 * ================================================================== */

// A PDF text extractor for assertions: pdf.js in plain Node. pdf.js 6 needs
// two ES features Node 22/24 lack; the same polyfills lib/pdf-page-images.ts
// installs in production.
async function extractPdfText(bytes) {
  if (!Uint8Array.prototype.toHex) {
    Object.defineProperty(Uint8Array.prototype, "toHex", {
      value() { return Array.from(this, (b) => b.toString(16).padStart(2, "0")).join(""); },
      configurable: true, writable: true,
    });
  }
  if (!Map.prototype.getOrInsertComputed) {
    Object.defineProperty(Map.prototype, "getOrInsertComputed", {
      value(key, fn) { if (this.has(key)) return this.get(key); const v = fn(key); this.set(key, v); return v; },
      configurable: true, writable: true,
    });
  }
  if (!Map.prototype.getOrInsert) {
    Object.defineProperty(Map.prototype, "getOrInsert", {
      value(key, v) { if (this.has(key)) return this.get(key); this.set(key, v); return v; },
      configurable: true, writable: true,
    });
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  return { pages, text: pages.join("\n"), compact: pages.join("").replace(/\s+/g, "") };
}

function viewFor(invoice, overrides = {}) {
  return { ...PDF.invoiceToView(invoice), ...overrides };
}

const LONG_NAME =
  "The Extraordinarily Long-Named Sample Trading & Allied Services Private Limited (Formerly Known As Sample Traders)";
const LONG_ADDRESS =
  "Flat No. 1204, Tower C, Example Heights Apartments, Opposite The Very Large Sample Shopping Mall And Cinema Complex, Beside The Old Sample Railway Station Road, Kondapur Main Road, Hitech City Extension, Serilingampally Mandal, Ranga Reddy District, Hyderabad 500084\nLandmark: near the blue water tank\nAcSuperLongTokenWithNoSpacesAtAllToProveThatWrappingBreaksIt1234567890123456789012345678901234567890";

test("an intra-state invoice prints CGST and SGST, every mandated particular, and no IGST line", async () => {
  const { invoice } = await issuedInvoice();
  const bytes = await PDF.renderTaxDocumentPdf(PDF.invoiceToView(invoice));
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  const { text, pages } = await extractPdfText(bytes);
  assert.equal(pages.length, 1);

  for (const expected of [
    "Tax Invoice",
    invoice.invoice_number,
    "21 Oct 2026",
    "Test Supplier Studio",
    "GSTIN: 36BYQPT2686E1ZR",
    "State: Telangana (code 36)",
    "Acme Traders Pvt Ltd",
    "Place of supply: Telangana (code 36)",
    "Reverse charge: No",
    "998314",
    "CGST @ 9%",
    "SGST @ 9%",
    "₹3,388.98",
    "₹305.01",
    "₹3,999.00",
    "Rupees Three Thousand Nine Hundred Ninety-Nine Only",
    "computer-generated",
  ]) {
    assert.ok(text.includes(expected), `PDF should contain "${expected}"`);
  }
  assert.ok(!text.includes("IGST"), "an intra-state invoice has no IGST line");
  assert.ok(!text.includes("GSTIN: 27"), "no recipient GSTIN was given, so none is printed");
});

test("an inter-state invoice prints one IGST line, the recipient's GSTIN and state", async () => {
  const { invoice } = await issuedInvoice({}, { customer: CUSTOMER_MAHARASHTRA });
  const { text } = await extractPdfText(await PDF.renderTaxDocumentPdf(PDF.invoiceToView(invoice)));
  assert.ok(text.includes("IGST @ 18%"));
  assert.ok(text.includes("₹610.02"));
  assert.ok(!text.includes("CGST") && !text.includes("SGST"));
  assert.ok(text.includes("GSTIN: 27AAPFU0939F1ZV"));
  assert.ok(text.includes("State: Maharashtra (code 27)"));
  assert.ok(text.includes("Place of supply: Maharashtra (code 27)"));
});

test("the rupee sign and Indian grouping render: ₹1,23,456.00", async () => {
  const { invoice } = await issuedInvoice();
  const split = gstBreakdown(12_345_600, "intra-state");
  const view = viewFor(invoice, {
    taxablePaise: split.taxablePaise,
    cgstPaise: split.cgstPaise,
    sgstPaise: split.sgstPaise,
    totalPaise: 12_345_600,
  });
  const { text } = await extractPdfText(await PDF.renderTaxDocumentPdf(view));
  assert.ok(text.includes("₹1,23,456.00"), "the rupee sign and lakh grouping both come through the embedded font");
  assert.ok(text.includes("Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six Only"));
});

test("a very long business name and address wrap inside the page and nothing is cut off", async () => {
  const { invoice } = await issuedInvoice();
  const view = viewFor(invoice, {
    recipient: { ...PDF.invoiceToView(invoice).recipient, name: LONG_NAME, address: LONG_ADDRESS },
    description: `${invoice.service_description} - ${"a deliberately long description ".repeat(6)}`,
  });
  const { compact, pages } = await extractPdfText(await PDF.renderTaxDocumentPdf(view));
  assert.equal(pages.length, 1);
  assert.ok(compact.includes(LONG_NAME.replace(/\s+/g, "")), "the whole name is printed");
  assert.ok(compact.includes(LONG_ADDRESS.replace(/\s+/g, "")), "the whole address, including the 80-character unbroken token, is printed");
});

test("the longest name and address the form accepts, in the widest letters, are printed in full across clean pages", async () => {
  const { invoice } = await issuedInvoice();
  // 8 lines (the cap) of 74 'W' (the widest capital): worst case for wrapping within the 600-character limit.
  const address = Array.from({ length: 8 }, () => "W".repeat(74)).join("\n");
  assert.ok(address.length <= 600 && address.split("\n").length === 8);
  const view = viewFor(invoice, { recipient: { ...PDF.invoiceToView(invoice).recipient, name: "M".repeat(200), address } });
  const { pages, compact } = await extractPdfText(await PDF.renderTaxDocumentPdf(view));
  // The absolute worst case does not fit one page; it must flow onto a second, never run off the bottom.
  assert.ok(pages.length <= 2, "at most two pages even for the worst case the validation allows");
  assert.ok(compact.includes("W".repeat(74 * 8)));
  assert.ok(compact.includes("M".repeat(200)));
  assert.ok(compact.includes("Total"), "the totals are still printed");
  assert.ok(pages.every((page, index) => page.includes(`Page ${index + 1} of ${pages.length}`)), "every page carries its footer");
  assert.ok(pages[pages.length - 1].includes("computer-generated"), "the closing line is on the last page");
});

test("an address longer than the line cap is refused at the form and at issue time", async () => {
  const tooMany = Array.from({ length: 9 }, (_, i) => `Line ${i + 1}`).join("\n");
  const data = new FormData();
  data.set("billingName", "Acme Traders");
  data.set("billingAddress", tooMany);
  data.set("stateCode", "36");
  data.set("gstin", "");
  assert.match(IDENT.parseBillingIdentityForm(data).error, /8 lines/);

  const { deps, state } = makeStore({ customer: { name: "Acme", address: tooMany, stateCode: "36", gstin: null } });
  const outcome = await SVC.issueInvoiceForPayment(deps, paymentFixture());
  assert.equal(outcome.status, "held");
  assert.equal(outcome.reason, "invalid_customer_details");
  assert.equal(state.invoices.length, 0);
});

test("the same invoice renders to the same bytes every time", async () => {
  const { invoice } = await issuedInvoice();
  const a = await PDF.renderTaxDocumentPdf(PDF.invoiceToView(invoice));
  const b = await PDF.renderTaxDocumentPdf(PDF.invoiceToView(invoice));
  assert.equal(Buffer.compare(Buffer.from(a), Buffer.from(b)), 0, "a pure function of the stored snapshot");
});

test("an invoice keeps rendering from its own snapshot after the customer renames itself", async () => {
  const { store, invoice } = await issuedInvoice();
  const before = await extractPdfText(await PDF.renderTaxDocumentPdf(PDF.invoiceToView(invoice)));
  store.state.customer = { name: "Totally Different Name", address: "Elsewhere, Chennai", stateCode: "33", gstin: null };
  const after = await extractPdfText(await PDF.renderTaxDocumentPdf(PDF.invoiceToView(invoice)));
  assert.equal(after.text, before.text);
  assert.ok(after.text.includes("Acme Traders Pvt Ltd"));
  assert.ok(!after.text.includes("Totally Different Name"));
});

test("a credit note PDF names the invoice it reverses and the reason", async () => {
  const { store, invoice } = await issuedInvoice();
  const { deps } = makeCreditDeps(store);
  const { note } = await SVC.issueCreditNoteForRefund(deps, refund({ amountPaise: 100_000 }));
  const { text } = await extractPdfText(await PDF.renderTaxDocumentPdf(PDF.creditNoteToView(note)));
  for (const expected of [
    "Credit Note",
    "WAC/2026-27/0001",
    `Against Tax Invoice no. ${invoice.invoice_number} dated 21 Oct 2026`,
    "Reason: Duplicate or incorrect charge",
    "Total credited",
    "₹1,000.00",
    "CGST @ 9%",
  ]) {
    assert.ok(text.includes(expected), `credit note should contain "${expected}"`);
  }
});

test("a test-mode document is stamped and cannot pass for a tax invoice", async () => {
  const { invoice } = await issuedInvoice({}, { livemode: false });
  const { text } = await extractPdfText(await PDF.renderTaxDocumentPdf(PDF.invoiceToView(invoice)));
  assert.ok(text.includes("Test Invoice"));
  assert.ok(text.includes("TEST DOCUMENT - NOT A TAX INVOICE"));
  assert.ok(text.includes("TST/2026-27/0001"));
});

test("the renderer refuses text its font cannot draw instead of printing a box", async () => {
  const { invoice } = await issuedInvoice();
  const view = viewFor(invoice, { recipient: { ...PDF.invoiceToView(invoice).recipient, name: "Acme ఆం" } });
  await assert.rejects(() => PDF.renderTaxDocumentPdf(view), /cannot draw/);
});

/* ================================================================== *
 * 10. The webhook: each payment is invoiced once, from what was paid
 * ================================================================== */

function chargedEvent({ paymentId = "pay_w1", amount = PLANS.growth.monthlyPricePaise, createdAt = 1_792_000_000, status = "captured" } = {}) {
  return {
    event: "subscription.charged",
    created_at: createdAt,
    payload: {
      subscription: {
        entity: {
          id: SUBSCRIPTION_ID,
          status: "active",
          current_start: 1_792_000_000,
          current_end: 1_794_592_000,
          paid_count: 2,
          notes: { business_id: BUSINESS_ID },
        },
      },
      payment: { entity: { id: paymentId, amount, currency: "INR", status, created_at: createdAt } },
    },
  };
}

function orderPaidEvent({ purpose, planKey, amount, paymentId, orderId = "order_w1" }) {
  return {
    event: "order.paid",
    created_at: 1_792_000_000,
    payload: {
      order: { entity: { id: orderId, amount, currency: "INR", status: "paid", notes: { business_id: BUSINESS_ID, purpose, plan_key: planKey } } },
      payment: { entity: { id: paymentId, amount, currency: "INR", status: "captured", order_id: orderId, created_at: 1_792_000_000 } },
    },
  };
}

function rowFixture(overrides = {}) {
  return {
    business_id: BUSINESS_ID,
    plan_key: "growth",
    status: "active",
    trial_started_at: null,
    trial_ends_at: null,
    current_period_start: "2026-10-01T00:00:00.000Z",
    current_period_end: "2026-11-01T00:00:00.000Z",
    cancel_at_period_end: false,
    scheduled_plan_key: null,
    past_due_since: null,
    billing_interval: "monthly",
    razorpay_subscription_id: SUBSCRIPTION_ID,
    razorpay_customer_id: null,
    razorpay_order_id: null,
    ...overrides,
  };
}

/** The webhook state machine wired to the in-memory subscription row AND the real invoice service. */
function makeWebhookWorld({ row = rowFixture(), storeOptions = {} } = {}) {
  const invoiceStore = makeStore(storeOptions);
  const credit = makeCreditDeps(invoiceStore);
  const world = { row: { ...row }, events: new Set(), logs: [], notices: [], credit };

  const deps = {
    async claimEvent(eventId) {
      if (world.events.has(eventId)) return false;
      world.events.add(eventId);
      return true;
    },
    async releaseEvent(eventId) {
      world.events.delete(eventId);
    },
    async findSubscriptionByRazorpayId(id) {
      return world.row.razorpay_subscription_id === id ? { ...world.row } : null;
    },
    async findSubscriptionByBusinessId(id) {
      return world.row.business_id === id ? { ...world.row } : null;
    },
    async updateSubscription(_id, patch) {
      world.row = { ...world.row, ...patch };
    },
    async sendNotice(kind) {
      world.notices.push(kind);
    },
    async recordAudit() {},
    issueInvoice: (payment) => SVC.issueInvoiceForPayment(invoiceStore.deps, payment),
    issueCreditNote: (r) => SVC.issueCreditNoteForRefund(credit.deps, r),
    log(event, businessId, metadata, level) {
      world.logs.push({ event, businessId, metadata, level });
    },
  };
  return { deps, world, invoiceStore };
}

test("subscription.charged issues one invoice for the amount actually collected, not the list price", async () => {
  const { deps, invoiceStore } = makeWebhookWorld();
  const odd = 137_500; // a proration-like charge that is no plan's price
  await processRazorpayEvent(deps, chargedEvent({ amount: odd }), "evt_1");

  assert.equal(invoiceStore.state.invoices.length, 1);
  const invoice = invoiceStore.state.invoices[0];
  assert.equal(invoice.total_paise, odd);
  assert.notEqual(invoice.total_paise, PLANS.growth.monthlyPricePaise);
  assert.equal(invoice.taxable_paise + invoice.tax_paise, odd);
  assert.equal(invoice.razorpay_payment_id, "pay_w1");
  assert.equal(invoice.razorpay_subscription_id, SUBSCRIPTION_ID);
  assert.equal(invoice.invoice_date, FY.istDateString(new Date(1_792_000_000 * 1000)));
});

test("the same payment delivered under two different event ids is still one invoice", async () => {
  const { deps, invoiceStore } = makeWebhookWorld();
  await processRazorpayEvent(deps, chargedEvent(), "evt_a");
  await processRazorpayEvent(deps, chargedEvent(), "evt_b"); // a fresh event id: the event ledger does not catch it
  await processRazorpayEvent(deps, chargedEvent(), "evt_a"); // and the same id again: the ledger does

  assert.equal(invoiceStore.state.invoices.length, 1, "the unique payment id is the second line of defence");
  assert.equal(invoiceStore.state.counters.get("false|2026-27"), 1);
});

test("a different payment on the same subscription is a second invoice with the next number", async () => {
  const { deps, invoiceStore } = makeWebhookWorld();
  await processRazorpayEvent(deps, chargedEvent({ paymentId: "pay_m1" }), "evt_1");
  await processRazorpayEvent(deps, chargedEvent({ paymentId: "pay_m2" }), "evt_2");
  assert.deepEqual(
    invoiceStore.state.invoices.map((i) => i.invoice_number),
    ["WAP/2026-27/0001", "WAP/2026-27/0002"],
  );
});

test("no invoice for a failed payment, a pending retry or a payment that is not captured", async () => {
  const { deps, invoiceStore, world } = makeWebhookWorld();
  await processRazorpayEvent(
    deps,
    { event: "payment.failed", payload: { payment: { entity: { id: "pay_f", amount: 399900, status: "failed", notes: { business_id: BUSINESS_ID } } } } },
    "evt_f",
  );
  await processRazorpayEvent(
    deps,
    { event: "subscription.pending", payload: { subscription: { entity: { id: SUBSCRIPTION_ID, notes: { business_id: BUSINESS_ID } } } } },
    "evt_p",
  );
  await processRazorpayEvent(deps, chargedEvent({ paymentId: "pay_n", status: "authorized" }), "evt_n");
  assert.equal(invoiceStore.state.invoices.length, 0);
  assert.ok(world.logs.some((l) => l.event === "razorpay_payment_not_captured_no_invoice"));
});

test("no invoice for a trial: nothing was charged, and no subscription.charged ever arrives", async () => {
  const { deps, invoiceStore } = makeWebhookWorld({
    row: rowFixture({ status: "trialing", trial_started_at: "2026-10-01T00:00:00Z", trial_ends_at: "2026-10-15T00:00:00Z", current_period_start: null, current_period_end: null }),
  });
  // Authorising the mandate and activating it are not charges.
  await processRazorpayEvent(
    deps,
    { event: "subscription.activated", payload: { subscription: { entity: { id: SUBSCRIPTION_ID, status: "authenticated", notes: { business_id: BUSINESS_ID } } } } },
    "evt_act",
  );
  assert.equal(invoiceStore.state.invoices.length, 0);
  // ...and a zero-amount "charge" would not be invoiced either.
  await processRazorpayEvent(deps, chargedEvent({ paymentId: "pay_zero", amount: 0 }), "evt_zero");
  assert.equal(invoiceStore.state.invoices.length, 0);
});

test("a charge with no payment entity is logged at error level and invoices nothing", async () => {
  const { deps, invoiceStore, world } = makeWebhookWorld();
  const event = chargedEvent();
  delete event.payload.payment;
  const outcome = await processRazorpayEvent(deps, event, "evt_np");
  assert.equal(outcome, "processed", "the subscription state still moved");
  assert.equal(invoiceStore.state.invoices.length, 0);
  assert.ok(world.logs.some((l) => l.event === "razorpay_payment_without_amount_no_invoice" && l.level === "error"));
});

test("order.paid for an annual plan issues the annual invoice", async () => {
  const { deps, invoiceStore } = makeWebhookWorld({ row: rowFixture({ status: "trialing", current_period_start: null, current_period_end: null, trial_started_at: "2026-10-01T00:00:00Z", trial_ends_at: "2026-10-15T00:00:00Z", razorpay_order_id: "order_w1" }) });
  await processRazorpayEvent(
    deps,
    orderPaidEvent({ purpose: "annual", planKey: "scale", amount: PLANS.scale.annualPricePaise, paymentId: "pay_ann" }),
    "evt_ann",
  );
  const invoice = invoiceStore.state.invoices[0];
  assert.equal(invoice.total_paise, PLANS.scale.annualPricePaise);
  assert.equal(invoice.purpose, "annual");
  assert.equal(invoice.plan_key, "scale");
  assert.match(invoice.service_description, /annual subscription/);
});

test("order.paid for a pro-rata upgrade invoices the amount paid", async () => {
  const { deps, invoiceStore } = makeWebhookWorld({ row: rowFixture({ razorpay_order_id: "order_w1" }) });
  await processRazorpayEvent(
    deps,
    orderPaidEvent({ purpose: "upgrade_prorata", planKey: "scale", amount: 187_654, paymentId: "pay_up" }),
    "evt_up",
  );
  const invoice = invoiceStore.state.invoices[0];
  assert.equal(invoice.total_paise, 187_654);
  assert.equal(invoice.purpose, "upgrade_prorata");
});

test("when the Checkout callback already applied the order, the webhook still issues the invoice", async () => {
  const { deps, invoiceStore } = makeWebhookWorld({
    row: rowFixture({ plan_key: "scale", status: "active", razorpay_order_id: "order_w1", billing_interval: "annual", current_period_start: "2026-10-21T00:00:00.000Z", current_period_end: "2027-10-21T00:00:00.000Z" }),
  });
  await processRazorpayEvent(
    deps,
    orderPaidEvent({ purpose: "annual", planKey: "scale", amount: PLANS.scale.annualPricePaise, paymentId: "pay_cb" }),
    "evt_cb",
  );
  assert.equal(invoiceStore.state.invoices.length, 1, "the callback only moves the plan; the invoice must still be issued");
});

test("a payment against a customer with no state is parked, and the webhook still succeeds", async () => {
  const { deps, invoiceStore, world } = makeWebhookWorld({
    storeOptions: { customer: { name: "Acme", address: "1 Market Street, Hyderabad", stateCode: null, gstin: null } },
  });
  const outcome = await processRazorpayEvent(deps, chargedEvent(), "evt_hold");
  assert.equal(outcome, "processed", "a 500 here would be retried for a day and end with Razorpay disabling the endpoint");
  assert.equal(invoiceStore.state.invoices.length, 0);
  assert.equal(invoiceStore.state.holds.size, 1);
  assert.equal(world.row.status, "active", "the subscription state is not held hostage to the invoice");
  assert.ok(invoiceStore.state.logs.some((l) => l.event === "invoice_held" && l.level === "error"));
});

test("refund.processed issues a credit note, once, with the reason from the refund's notes", async () => {
  const { deps, invoiceStore, world } = makeWebhookWorld();
  await processRazorpayEvent(deps, chargedEvent({ paymentId: "pay_r" }), "evt_c");
  const invoice = invoiceStore.state.invoices[0];

  const refundEvent = {
    event: "refund.processed",
    created_at: 1_792_100_000,
    payload: {
      refund: { entity: { id: "rfnd_w1", payment_id: "pay_r", amount: 100_000, currency: "INR", status: "processed", created_at: 1_792_100_000, notes: { credit_note_reason: "sustained_outage" } } },
      payment: { entity: { id: "pay_r", amount: invoice.total_paise, status: "captured" } },
    },
  };
  assert.equal(await processRazorpayEvent(deps, refundEvent, "evt_r1"), "processed");
  assert.equal(await processRazorpayEvent(deps, refundEvent, "evt_r1"), "duplicate");
  assert.equal(await processRazorpayEvent(deps, refundEvent, "evt_r2"), "processed", "a fresh event id for the same refund");

  assert.equal(world.credit.state.notes.length, 1, "one refund, one credit note");
  assert.equal(world.credit.state.notes[0].reason, "sustained_outage");
  assert.equal(world.credit.state.notes[0].total_paise, 100_000);
});

test("a refund of an unrecognised reason becomes 'other'; a refund for an un-invoiced payment is acknowledged quietly", async () => {
  const { deps, world } = makeWebhookWorld();
  await processRazorpayEvent(deps, chargedEvent({ paymentId: "pay_q" }), "evt_c");
  await processRazorpayEvent(
    deps,
    { event: "refund.processed", payload: { refund: { entity: { id: "rfnd_x", payment_id: "pay_q", amount: 5000, notes: { credit_note_reason: "because i said so" } } } } },
    "evt_x",
  );
  assert.equal(world.credit.state.notes[0].reason, "other");

  const outcome = await processRazorpayEvent(
    deps,
    { event: "refund.processed", payload: { refund: { entity: { id: "rfnd_auth", payment_id: "pay_auth_5_rupees", amount: 500 } } } },
    "evt_auth",
  );
  assert.equal(outcome, "processed");
  assert.equal(world.credit.state.notes.length, 1);
});

test("a transient failure while issuing makes the webhook retry, and the retry issues the invoice exactly once", async () => {
  const { deps, world, invoiceStore } = makeWebhookWorld({
    row: rowFixture({ status: "trialing", trial_started_at: "2026-10-01T00:00:00Z", trial_ends_at: "2026-10-15T00:00:00Z", current_period_start: null, current_period_end: null }),
  });
  const realIssue = deps.issueInvoice;
  let failuresLeft = 1;
  deps.issueInvoice = async (payment) => {
    if (failuresLeft-- > 0) throw new Error("database is down");
    return realIssue(payment);
  };

  await assert.rejects(() => processRazorpayEvent(deps, chargedEvent(), "evt_t"), /database is down/);
  assert.equal(world.events.has("evt_t"), false, "the event claim was released so Razorpay's retry does real work");
  assert.equal(invoiceStore.state.invoices.length, 0);
  assert.deepEqual(world.notices, ["subscription_active"], "the once-only notice was sent BEFORE the step that can throw");

  assert.equal(await processRazorpayEvent(deps, chargedEvent(), "evt_t"), "processed");
  assert.equal(invoiceStore.state.invoices.length, 1);
  assert.deepEqual(world.notices, ["subscription_active"], "and is not lost or repeated on the retry (the row is already active)");
});
