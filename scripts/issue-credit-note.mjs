// Refunds a payment through Razorpay and issues the GST credit note for it.
// A hand-run script, not an admin panel -- there is deliberately no
// customer-facing refund button and no admin UI (Phase 17c, STATE.md).
//
//   npm run credit-note -- --payment pay_XXXX --amount 250.00 --reason duplicate_or_incorrect_charge
//   npm run credit-note -- --payment pay_XXXX --full --reason charge_after_cancellation --execute
//   npm run credit-note -- --refund-id rfnd_XXXX --execute     (note for a refund that already happened)
//
// WHAT PROTECTS YOU FROM YOURSELF
//   * It is a DRY RUN unless you pass --execute. The dry run does the same
//     look-ups and arithmetic, prints exactly what it would do, and changes
//     nothing (read-only queries and one Razorpay GET).
//   * It always prints which Supabase project and which Razorpay mode
//     (test/live) it is about to act on. .env.local points at PRODUCTION.
//   * LIVE Razorpay keys are refused unless you also pass
//     --i-understand-this-refunds-real-money.
//   * The invoice's own mode must match the keys: a TEST invoice can only be
//     refunded with test keys and a real one only with live keys.
//   * The refund is attempted FIRST. If Razorpay refuses it, NO credit note
//     is issued -- there is no credit for money that did not go back.
//   * It refuses an amount larger than what remains of the invoice (also
//     across earlier partial notes), and refuses if Razorpay has already
//     refunded more than our credit notes account for (reconcile first).
//   * Idempotent on the Razorpay refund id: the refund.processed webhook
//     issues the same note, and whichever arrives first wins.
//
// The refund carries the reason in its notes, so the webhook path produces
// the same credit note this script would have. If this script dies AFTER the
// refund succeeded, the webhook will still issue the note, and re-running
// with --refund-id rfnd_XXXX --execute is safe.
//
// Run through npm so it gets .env.local and the react-server condition that
// `server-only` modules need (see package.json "credit-note").
import { register } from "node:module";

register("./alias-resolver-hooks.mjs", import.meta.url);

const USAGE = `Usage:
  npm run credit-note -- --payment <pay_id> (--amount <rupees> | --full) --reason <reason> [--execute]
  npm run credit-note -- --refund-id <rfnd_id> [--reason <reason>] [--execute]

Reasons: duplicate_or_incorrect_charge | charge_after_cancellation | sustained_outage | other
Flags:   --execute  actually refund and issue (default is a dry run)
         --i-understand-this-refunds-real-money  required with LIVE Razorpay keys`;

// Exits are thrown rather than calling process.exit(): exiting while fetch
// connections are still closing trips a libuv assertion on Windows.
class Exit extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
  }
}

function parseArgs(argv) {
  const out = { flags: new Set(), values: {} };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) fail(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    if (["execute", "full", "help", "i-understand-this-refunds-real-money"].includes(name)) {
      out.flags.add(name);
    } else if (["payment", "amount", "reason", "refund-id"].includes(name)) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) fail(`--${name} needs a value`);
      out.values[name] = value;
    } else {
      fail(`Unknown option: ${token}`);
    }
  }
  return out;
}

function fail(message, code = 2) {
  console.error(`\n${message}\n`);
  if (code === 2) console.error(USAGE);
  throw new Exit(code);
}

/** "250.00" -> 25000 paise. Strict: at most two decimals, no signs, no exponent. */
function rupeesToPaise(text) {
  if (!/^\d+(\.\d{1,2})?$/.test(text)) fail(`--amount must be rupees with at most two decimals, e.g. 250.00 (got "${text}")`);
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

try {
const args = parseArgs(process.argv.slice(2));
if (args.flags.has("help")) {
  console.log(USAGE);
  throw new Exit(0);
}

const refundIdArg = args.values["refund-id"];
const paymentArg = args.values.payment;
if (!refundIdArg && !paymentArg) fail("Give --payment <pay_id> or --refund-id <rfnd_id>.");
if (refundIdArg && paymentArg) fail("Give either --payment or --refund-id, not both.");
if (paymentArg && !args.flags.has("full") && !args.values.amount) fail("Give --amount <rupees> or --full.");
if (paymentArg && args.flags.has("full") && args.values.amount) fail("--amount and --full are mutually exclusive.");
if (paymentArg && !args.values.reason) fail("--reason is required when creating a refund.");
if (args.values.amount) rupeesToPaise(args.values.amount); // validate the format before touching anything

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]) {
  if (!process.env[name]) fail(`${name} is not set. Run through "npm run credit-note" so .env.local is loaded.`, 1);
}

const load = (relative) => import(new URL(relative, import.meta.url).href);
const rzp = await load("../lib/razorpay.ts");
const { createServiceSupabaseClient } = await load("../lib/supabase/service.ts");
const { createCreditNoteServiceDeps } = await load("../lib/invoice-store.ts");
const { issueCreditNoteForRefund, isCreditNoteReason } = await load("../lib/invoice-service.ts");
const { computeCreditNoteAmounts, CREDIT_NOTE_REASON_LABEL } = await load("../lib/invoice-core.ts");
const { formatPaiseAsInr2dp } = await load("../lib/invoice-format.ts");

const mode = rzp.razorpayKeyMode();
if (!rzp.isRazorpayConfigured() || !mode) fail("Razorpay keys are not configured (or are not rzp_test_/rzp_live_ keys).", 1);

const supabaseRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const execute = args.flags.has("execute");

console.log("-------------------------------------------------------------");
console.log(` Razorpay mode : ${mode.toUpperCase()}`);
console.log(` Supabase      : ${supabaseRef}${supabaseRef === "bykeztxvejpwfcxgsubm" ? "  (PRODUCTION)" : ""}`);
console.log(` Run type      : ${execute ? "EXECUTE -- changes will be made" : "DRY RUN -- nothing will be changed"}`);
console.log("-------------------------------------------------------------");

if (mode === "live" && !args.flags.has("i-understand-this-refunds-real-money")) {
  fail("These are LIVE Razorpay keys. Re-run with --i-understand-this-refunds-real-money if you mean it.", 1);
}

const supabase = createServiceSupabaseClient();
const deps = createCreditNoteServiceDeps(supabase);

/* ---- Work out the payment, refund (if it exists) and reason ---- */
let reason = args.values.reason;
if (reason !== undefined && !isCreditNoteReason(reason)) fail(`Unknown reason "${reason}".`);

let paymentId = paymentArg;
let existingRefund = null;
if (refundIdArg) {
  existingRefund = await rzp.fetchRefund(refundIdArg);
  paymentId = existingRefund.payment_id;
  const noted = existingRefund.notes?.credit_note_reason;
  if (!reason) reason = isCreditNoteReason(noted) ? noted : "other";
  if (existingRefund.status !== "processed" && existingRefund.status !== "pending") {
    fail(`Refund ${existingRefund.id} has status "${existingRefund.status}"; only a pending or processed refund gets a credit note.`, 1);
  }
}

let invoice;
try {
  invoice = await deps.findInvoiceByPaymentId(paymentId);
} catch {
  fail(
    "Could not read the invoices table. Has migration 20261026000000 been applied to this Supabase project?\n" +
      "(This script talks to whichever project .env.local points at.)",
    1,
  );
}
if (!invoice) {
  fail(
    `No invoice exists for payment ${paymentId}, so no credit note can be issued for it.\n` +
      "If it predates invoicing (or is an authentication charge), refund it from the Razorpay dashboard instead.",
    1,
  );
}

if (invoice.is_test && mode === "live") fail(`${invoice.invoice_number} is a TEST invoice but the keys are LIVE.`, 1);
if (!invoice.is_test && mode === "test") fail(`${invoice.invoice_number} is a real invoice but the keys are TEST keys.`, 1);

const credited = await deps.creditedSoFar(invoice.id);
const refundPaise = existingRefund ? existingRefund.amount : args.flags.has("full") ? invoice.total_paise - credited.totalPaise : rupeesToPaise(args.values.amount);

const alreadyNoted = existingRefund ? await deps.findCreditNoteByRefundId(existingRefund.id) : null;
const computed = computeCreditNoteAmounts(invoice, alreadyNoted ? { ...credited, totalPaise: credited.totalPaise - alreadyNoted.total_paise, taxablePaise: credited.taxablePaise - alreadyNoted.taxable_paise, taxPaise: credited.taxPaise - alreadyNoted.tax_paise, cgstPaise: credited.cgstPaise - (alreadyNoted.cgst_paise ?? 0), sgstPaise: credited.sgstPaise - (alreadyNoted.sgst_paise ?? 0), igstPaise: credited.igstPaise - (alreadyNoted.igst_paise ?? 0) } : credited, refundPaise);

console.log(` Invoice       : ${invoice.invoice_number}  (${formatPaiseAsInr2dp(invoice.total_paise)}, ${invoice.customer_name})`);
console.log(` Already credited : ${formatPaiseAsInr2dp(credited.totalPaise)}`);
console.log(` This refund   : ${formatPaiseAsInr2dp(refundPaise)}   reason: ${CREDIT_NOTE_REASON_LABEL[reason]}`);
if (existingRefund) console.log(` Existing refund: ${existingRefund.id} (${existingRefund.status})${alreadyNoted ? `  -- already has credit note ${alreadyNoted.credit_note_number}` : ""}`);

if (!computed.ok) {
  fail(
    `REFUSED: ${computed.reason.replace(/_/g, " ")}. ${formatPaiseAsInr2dp(computed.remainingPaise)} is all that is left to credit on ${invoice.invoice_number}.`,
    1,
  );
}
const a = computed.amounts;
console.log(` Credit note   : taxable ${formatPaiseAsInr2dp(a.taxablePaise)}  ${a.cgstPaise !== null ? `CGST ${formatPaiseAsInr2dp(a.cgstPaise)}  SGST ${formatPaiseAsInr2dp(a.sgstPaise)}` : `IGST ${formatPaiseAsInr2dp(a.igstPaise)}`}  total ${formatPaiseAsInr2dp(a.totalPaise)}`);

/* ---- Cross-check against what Razorpay says ---- */
const payment = await rzp.fetchPayment(paymentId);
if (payment.status !== "captured" && payment.status !== "refunded") {
  fail(`Razorpay says payment ${paymentId} is "${payment.status}"; only a captured payment can be refunded.`, 1);
}
if (payment.amount !== invoice.total_paise) {
  fail(`Razorpay says the payment was ${formatPaiseAsInr2dp(payment.amount)} but the invoice is ${formatPaiseAsInr2dp(invoice.total_paise)}. Investigate before refunding.`, 1);
}
const razorpayRefunded = payment.amount_refunded ?? 0;
const expectedRefunded = credited.totalPaise + (existingRefund && !alreadyNoted ? existingRefund.amount : 0);
if (!existingRefund && razorpayRefunded !== credited.totalPaise) {
  fail(
    `Razorpay has refunded ${formatPaiseAsInr2dp(razorpayRefunded)} on this payment but our credit notes total ${formatPaiseAsInr2dp(credited.totalPaise)}. ` +
      "A refund exists with no credit note (check the webhook, or use --refund-id for it) -- reconcile before refunding again.",
    1,
  );
}
if (!existingRefund && razorpayRefunded + refundPaise > payment.amount) {
  fail("That would refund more than the payment amount at Razorpay.", 1);
}
void expectedRefunded;

if (!execute) {
  console.log("\nDRY RUN complete. Nothing was refunded and nothing was issued. Re-run with --execute to proceed.");
  throw new Exit(0);
}

/* ---- Execute: the refund first, then the note ---- */
let refund = existingRefund;
if (!refund) {
  console.log("\nCalling Razorpay to refund...");
  try {
    refund = await rzp.createRefund({
      paymentId,
      amountPaise: refundPaise,
      receipt: `cn-${Date.now()}`,
      notes: { credit_note_reason: reason, source: "issue-credit-note-script", invoice_number: invoice.invoice_number },
    });
  } catch (error) {
    console.error("\nThe Razorpay refund FAILED. No credit note has been issued, and no money was returned.");
    console.error(error instanceof Error ? error.message : String(error));
    throw new Exit(1);
  }
  console.log(` Refund created: ${refund.id} (${refund.status}) ${formatPaiseAsInr2dp(refund.amount)}`);
}

let outcome;
try {
  outcome = await issueCreditNoteForRefund(deps, {
    paymentId,
    refundId: refund.id,
    amountPaise: refund.amount,
    refundedAt: new Date((refund.created_at ?? Math.floor(Date.now() / 1000)) * 1000),
    reason,
  });
} catch (error) {
  console.error(`\nThe refund ${refund.id} WAS made, but issuing the credit note failed.`);
  console.error("The refund.processed webhook will issue it, or re-run:");
  console.error(`  npm run credit-note -- --refund-id ${refund.id} --execute`);
  console.error(error instanceof Error ? error.message : String(error));
  throw new Exit(1);
}

if (outcome.status !== "issued") {
  console.error(`\nRefund ${refund.id} was made but no credit note was issued: ${JSON.stringify(outcome)}`);
  throw new Exit(1);
}
console.log(`\n${outcome.created ? "Issued" : "Already issued"}: credit note ${outcome.note.credit_note_number} against ${outcome.note.original_invoice_number}`);
console.log("It has been emailed to the business contact (with the PDF) and appears under Billing -> Payment history.");
throw new Exit(0);
} catch (error) {
  if (error instanceof Exit) {
    process.exitCode = error.code;
  } else {
    console.error("\nUnexpected error:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
