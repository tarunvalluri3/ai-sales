import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";
import { sendEmail } from "@/lib/email-sender";
import { recordSystemAuditLogEntry } from "@/lib/audit-log-system";
import { SUPPLIER } from "@/lib/invoice-config";
import { razorpayKeyMode } from "@/lib/razorpay";
import { istDateString } from "@/lib/financial-year";
import type { CreditedSoFar, CreditNoteDraft, CreditNoteRow, InvoiceDraft, InvoiceRow, PaymentForInvoice } from "@/lib/invoice-core";
import {
  DocumentRejectedError,
  holdToPayment,
  issueCreditNoteForRefund,
  issueInvoiceForPayment,
  type CreditNoteServiceDeps,
  type HoldReason,
  type InvoiceHold,
  type InvoiceServiceDeps,
  type IssueCreditNoteOutcome,
  type IssueInvoiceOutcome,
} from "@/lib/invoice-service";
import {
  invoiceHoldRowSchema,
  parseCreditNoteRow,
  parseInvoiceRow,
  type InvoiceHoldRow,
} from "@/lib/invoice-schemas";
import { creditNoteToView, invoiceToView, renderTaxDocumentPdf } from "@/lib/invoice-pdf";
import { buildCreditNoteEmail, buildInvoiceEmail, buildInvoiceHeldEmail } from "@/lib/invoice-emails";
import type { PlanKey } from "@/lib/plans";

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * The database/mail/audit wiring for Phase 17c's invoices and credit notes.
 * The decisions live in lib/invoice-service.ts (pure, unit-tested); this is
 * the only place they are connected to Postgres, Resend and the audit log,
 * mirroring how lib/billing-store.ts wraps lib/razorpay-webhook.ts.
 *
 * **Service-role client, explicit tenant filters.** There is no Clerk
 * session on the paths that run here (the Razorpay webhook, the daily
 * sweep, the credit-note script), so every query below filters by the
 * business or by a unique external id (a Razorpay payment or refund id,
 * which resolves to exactly one document). That filter is the tenant
 * boundary on this path, not defence in depth on top of RLS
 * (docs/security.md section 3). Dashboard reads go through
 * lib/invoice-queries.ts with the Clerk-session client instead.
 *
 * **Writes go through the two SECURITY DEFINER functions** and nowhere
 * else: the service role has no INSERT grant on either table, so a
 * numbering bypass is not something this file could do by accident.
 */

const UNIQUE_VIOLATION = "23505";

/** Postgres error classes 22 (data exception) and 23 (integrity violation): the document itself was refused. */
function isDocumentRefusal(code: string | undefined): boolean {
  return code !== undefined && (code.startsWith("22") || code.startsWith("23"));
}

/* ------------------------------------------------------------------ *
 * Once-only side effects (email + audit), claimed in billing_notice_sends
 * ------------------------------------------------------------------ */

/**
 * Claims "this document's email has been sent" in the existing
 * at-most-once ledger. Same mechanism as lib/billing-store.ts's
 * `claimBillingNotice`, with a key that includes the document id, so one
 * claim covers exactly one document.
 */
async function claimDocumentNotice(
  supabase: ServiceClient,
  businessId: string,
  noticeKey: string,
  atIso: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("billing_notice_sends")
    .insert({ business_id: businessId, notice_key: noticeKey, period_end: atIso });
  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return false;
  logEvent("document_notice_claim_failed", businessId, { noticeKey }, "error");
  return false;
}

/** Undoes a claim whose email then failed to send, so a later replay can try again. */
async function releaseDocumentNotice(
  supabase: ServiceClient,
  businessId: string,
  noticeKey: string,
  atIso: string,
): Promise<void> {
  const { error } = await supabase
    .from("billing_notice_sends")
    .delete()
    .eq("business_id", businessId)
    .eq("notice_key", noticeKey)
    .eq("period_end", atIso);
  if (error) logEvent("document_notice_release_failed", businessId, { noticeKey }, "error");
}

async function contactEmailFor(
  supabase: ServiceClient,
  businessId: string,
): Promise<{ email: string | null; found: boolean }> {
  const { data, error } = await supabase.from("businesses").select("contact_email").eq("id", businessId).maybeSingle();
  if (error || !data) return { email: null, found: false };
  return { email: data.contact_email ?? null, found: true };
}

/** Renders the PDF for an attachment. A render failure drops the attachment, never the email. */
async function pdfAttachment(
  render: () => Promise<Uint8Array>,
  filename: string,
  businessId: string,
): Promise<{ filename: string; content: Uint8Array; contentType: string }[]> {
  try {
    return [{ filename, content: await render(), contentType: "application/pdf" }];
  } catch (error) {
    logEvent("document_pdf_render_failed", businessId, { filename }, "error");
    console.error(error);
    return [];
  }
}

function safeFilename(documentNumber: string): string {
  return `${documentNumber.replace(/[^A-Za-z0-9-]+/g, "_")}.pdf`;
}

async function emailInvoice(supabase: ServiceClient, invoice: InvoiceRow): Promise<void> {
  const noticeKey = `invoice:${invoice.id}`;
  const { email: to } = await contactEmailFor(supabase, invoice.business_id);
  if (!to) {
    // Skipped WITHOUT claiming, so it still goes once a contact email is set.
    logEvent("invoice_email_skipped_no_contact_email", invoice.business_id, { invoiceNumber: invoice.invoice_number });
    return;
  }
  if (!(await claimDocumentNotice(supabase, invoice.business_id, noticeKey, invoice.issued_at))) return;

  const { subject, email } = buildInvoiceEmail(invoice);
  const attachments = await pdfAttachment(
    () => renderTaxDocumentPdf(invoiceToView(invoice)),
    safeFilename(invoice.invoice_number),
    invoice.business_id,
  );
  const outcome = await sendEmail({ to, subject, email, attachments });

  if (outcome === "failed" || outcome === "skipped_no_api_key") {
    await releaseDocumentNotice(supabase, invoice.business_id, noticeKey, invoice.issued_at);
  }
  logEvent(
    outcome === "sent" ? "invoice_email_sent" : `invoice_email_${outcome}`,
    invoice.business_id,
    { invoiceNumber: invoice.invoice_number },
    outcome === "failed" ? "error" : "info",
  );
}

async function emailCreditNote(supabase: ServiceClient, note: CreditNoteRow): Promise<void> {
  const noticeKey = `credit_note:${note.id}`;
  const { email: to } = await contactEmailFor(supabase, note.business_id);
  if (!to) {
    logEvent("credit_note_email_skipped_no_contact_email", note.business_id, { creditNoteNumber: note.credit_note_number });
    return;
  }
  if (!(await claimDocumentNotice(supabase, note.business_id, noticeKey, note.issued_at))) return;

  const { subject, email } = buildCreditNoteEmail(note);
  const attachments = await pdfAttachment(
    () => renderTaxDocumentPdf(creditNoteToView(note)),
    safeFilename(note.credit_note_number),
    note.business_id,
  );
  const outcome = await sendEmail({ to, subject, email, attachments });

  if (outcome === "failed" || outcome === "skipped_no_api_key") {
    await releaseDocumentNotice(supabase, note.business_id, noticeKey, note.issued_at);
  }
  logEvent(
    outcome === "sent" ? "credit_note_email_sent" : `credit_note_email_${outcome}`,
    note.business_id,
    { creditNoteNumber: note.credit_note_number },
    outcome === "failed" ? "error" : "info",
  );
}

/* ------------------------------------------------------------------ *
 * Invoice dependencies
 * ------------------------------------------------------------------ */

function holdFromRow(row: InvoiceHoldRow): InvoiceHold {
  return {
    paymentId: row.razorpay_payment_id,
    businessId: row.business_id,
    reason: row.reason,
    detail: row.detail,
    amountPaise: row.amount_paise,
    currency: row.currency,
    purpose: row.purpose,
    planKey: (row.plan_key ?? "starter") as PlanKey,
    orderId: row.razorpay_order_id,
    subscriptionId: row.razorpay_subscription_id,
    paidAt: row.payment_at,
    periodStart: row.service_period_start,
    periodEnd: row.service_period_end,
  };
}

async function notifyCustomerOfHold(supabase: ServiceClient, hold: InvoiceHold): Promise<void> {
  // Only the customer's own details are theirs to fix. A supplier-config or
  // defect hold is ours, and telling the customer about it would only worry
  // them.
  if (hold.reason !== "missing_customer_details" && hold.reason !== "invalid_customer_details") return;

  const { email: to } = await contactEmailFor(supabase, hold.businessId);
  if (!to) return;
  const noticeKey = `invoice_hold:${hold.paymentId}`;
  if (!(await claimDocumentNotice(supabase, hold.businessId, noticeKey, hold.paidAt))) return;

  const { subject, email } = buildInvoiceHeldEmail({
    amountPaise: hold.amountPaise,
    paidOnDate: istDateString(new Date(hold.paidAt)),
    detail: hold.detail ?? "some billing details are missing",
  });
  const outcome = await sendEmail({ to, subject, email });
  if (outcome === "failed" || outcome === "skipped_no_api_key") {
    await releaseDocumentNotice(supabase, hold.businessId, noticeKey, hold.paidAt);
  }
}

export function createInvoiceServiceDeps(supabase: ServiceClient): InvoiceServiceDeps {
  return {
    supplier: SUPPLIER,
    // Test unless the configured Razorpay key is a LIVE one.
    livemode: razorpayKeyMode() === "live",

    async loadCustomer(businessId) {
      const [business, billing] = await Promise.all([
        supabase.from("businesses").select("name").eq("id", businessId).maybeSingle(),
        supabase
          .from("subscriptions")
          .select("billing_name, billing_address, billing_state_code, gstin")
          .eq("business_id", businessId)
          .maybeSingle(),
      ]);
      if (business.error || billing.error) {
        // Transient: throw so the webhook retries, rather than parking a
        // payment as "missing details" because a read blipped.
        throw new Error("invoice_customer_read_failed");
      }
      if (!business.data) return null;
      return {
        businessName: business.data.name as string,
        details: {
          name: billing.data?.billing_name ?? null,
          address: billing.data?.billing_address ?? null,
          stateCode: billing.data?.billing_state_code ?? null,
          gstin: billing.data?.gstin ?? null,
        },
      };
    },

    async findInvoiceByPaymentId(paymentId) {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("razorpay_payment_id", paymentId)
        .maybeSingle();
      if (error) throw new Error("invoice_lookup_failed");
      return data ? parseInvoiceRow(data) : null;
    },

    async issue(draft: InvoiceDraft) {
      const { data, error } = await supabase.rpc("issue_invoice", { p_invoice: draft });
      if (error) {
        logEvent("invoice_issue_rpc_failed", draft.business_id, { code: error.code ?? "unknown" }, "error");
        if (isDocumentRefusal(error.code)) {
          throw new DocumentRejectedError(`the database refused the invoice (${error.code})`);
        }
        throw new Error(`invoice_issue_rpc_failed ${error.code ?? "unknown"}`);
      }
      // `created` is for logging only: the service already returned any
      // existing invoice before getting here, so a row coming back from this
      // call is new except in a lost race, which hands back the winner's.
      return { invoice: parseInvoiceRow(data), created: true };
    },

    async recordHold(hold: InvoiceHold) {
      const row = {
        razorpay_payment_id: hold.paymentId,
        business_id: hold.businessId,
        reason: hold.reason,
        detail: hold.detail,
        amount_paise: hold.amountPaise,
        currency: hold.currency,
        purpose: hold.purpose,
        plan_key: hold.planKey,
        razorpay_order_id: hold.orderId,
        razorpay_subscription_id: hold.subscriptionId,
        payment_at: hold.paidAt,
        service_period_start: hold.periodStart,
        service_period_end: hold.periodEnd,
      };
      const { error } = await supabase.from("invoice_holds").insert(row);
      if (error && error.code === UNIQUE_VIOLATION) {
        const existing = await supabase
          .from("invoice_holds")
          .select("attempts")
          .eq("razorpay_payment_id", hold.paymentId)
          .maybeSingle();
        const attempts = (existing.data?.attempts as number | undefined) ?? 1;
        const { error: updateError } = await supabase
          .from("invoice_holds")
          .update({
            reason: hold.reason,
            detail: hold.detail,
            attempts: attempts + 1,
            last_attempt_at: new Date().toISOString(),
          })
          .eq("razorpay_payment_id", hold.paymentId);
        if (updateError) throw new Error("invoice_hold_update_failed");
      } else if (error) {
        throw new Error(`invoice_hold_insert_failed ${error.code ?? "unknown"}`);
      }
      await notifyCustomerOfHold(supabase, hold);
    },

    async clearHold(paymentId) {
      const { error } = await supabase.from("invoice_holds").delete().eq("razorpay_payment_id", paymentId);
      if (error) logEvent("invoice_hold_clear_failed", "unknown", { paymentId }, "error");
    },

    async afterIssued(invoice) {
      // Audit once per document: gated by the same claim ledger as the
      // email would be, but recorded even when there is no contact email.
      const auditKey = `invoice_audit:${invoice.id}`;
      if (await claimDocumentNotice(supabase, invoice.business_id, auditKey, invoice.issued_at)) {
        await recordSystemAuditLogEntry(invoice.business_id, "invoice.issued", "invoice", invoice.id, {
          invoiceNumber: invoice.invoice_number,
          totalPaise: invoice.total_paise,
          supplyType: invoice.supply_type,
          purpose: invoice.purpose,
        });
      }
      await emailInvoice(supabase, invoice);
    },

    log: logEvent,
  };
}

/** Issues the invoice a payment is owed, against the real database. */
export async function issueInvoiceForPaymentNow(payment: PaymentForInvoice): Promise<IssueInvoiceOutcome> {
  return issueInvoiceForPayment(createInvoiceServiceDeps(createServiceSupabaseClient()), payment);
}

/* ------------------------------------------------------------------ *
 * Holds: retried by the daily sweep and by saving billing details
 * ------------------------------------------------------------------ */

/** The statutory limit for issuing an invoice for a service is 30 days from supply; warn well before it. */
const HOLD_AGING_DAYS = 20;

export async function listInvoiceHolds(supabase: ServiceClient, businessId?: string): Promise<InvoiceHold[]> {
  let query = supabase.from("invoice_holds").select("*").order("created_at", { ascending: true }).limit(500);
  if (businessId) query = query.eq("business_id", businessId);
  const { data, error } = await query;
  if (error) {
    logEvent("invoice_hold_list_failed", businessId ?? "unknown", { code: error.code ?? "unknown" }, "error");
    return [];
  }
  const holds: InvoiceHold[] = [];
  for (const row of data ?? []) {
    const parsed = invoiceHoldRowSchema.safeParse(row);
    if (parsed.success) holds.push(holdFromRow(parsed.data));
    else logEvent("invoice_hold_row_invalid", businessId ?? "unknown", {}, "error");
  }
  return holds;
}

export type HoldResolution = { attempted: number; issued: number; stillHeld: number; failed: number };

/**
 * Retries every held payment (optionally only one business's). Called by
 * the daily sweep -- which is what issues the invoices parked because the
 * supplier config was not ready, once it is -- and by the billing-details
 * Server Action, which is what turns "we need your state" into an invoice
 * within seconds of the customer providing it.
 *
 * One hold failing never stops the others, and nothing here throws.
 */
export async function resolveInvoiceHolds(
  supabase: ServiceClient,
  options: { businessId?: string; now?: Date } = {},
): Promise<HoldResolution> {
  const now = options.now ?? new Date();
  const deps = createInvoiceServiceDeps(supabase);
  const holds = await listInvoiceHolds(supabase, options.businessId);
  const result: HoldResolution = { attempted: 0, issued: 0, stillHeld: 0, failed: 0 };

  for (const hold of holds) {
    result.attempted += 1;
    try {
      const outcome = await issueInvoiceForPayment(deps, holdToPayment(hold));
      if (outcome.status === "issued") result.issued += 1;
      else result.stillHeld += 1;
    } catch {
      result.failed += 1;
      logEvent("invoice_hold_retry_failed", hold.businessId, { paymentId: hold.paymentId }, "error");
    }

    const ageDays = (now.getTime() - new Date(hold.paidAt).getTime()) / 86_400_000;
    if (ageDays > HOLD_AGING_DAYS) {
      logEvent(
        "invoice_hold_aging",
        hold.businessId,
        { paymentId: hold.paymentId, reason: hold.reason as HoldReason, ageDays: Math.floor(ageDays) },
        "error",
      );
    }
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * Credit-note dependencies
 * ------------------------------------------------------------------ */

export function createCreditNoteServiceDeps(supabase: ServiceClient): CreditNoteServiceDeps {
  return {
    async findCreditNoteByRefundId(refundId) {
      const { data, error } = await supabase
        .from("credit_notes")
        .select("*")
        .eq("razorpay_refund_id", refundId)
        .maybeSingle();
      if (error) throw new Error("credit_note_lookup_failed");
      return data ? parseCreditNoteRow(data) : null;
    },

    async findInvoiceByPaymentId(paymentId) {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("razorpay_payment_id", paymentId)
        .maybeSingle();
      if (error) throw new Error("invoice_lookup_failed");
      return data ? parseInvoiceRow(data) : null;
    },

    async creditedSoFar(invoiceId): Promise<CreditedSoFar> {
      const { data, error } = await supabase
        .from("credit_notes")
        .select("total_paise, taxable_paise, tax_paise, cgst_paise, sgst_paise, igst_paise")
        .eq("invoice_id", invoiceId);
      if (error) throw new Error("credit_note_sum_failed");
      const totals: CreditedSoFar = { totalPaise: 0, taxablePaise: 0, taxPaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
      for (const row of data ?? []) {
        totals.totalPaise += Number(row.total_paise);
        totals.taxablePaise += Number(row.taxable_paise);
        totals.taxPaise += Number(row.tax_paise);
        totals.cgstPaise += Number(row.cgst_paise ?? 0);
        totals.sgstPaise += Number(row.sgst_paise ?? 0);
        totals.igstPaise += Number(row.igst_paise ?? 0);
      }
      return totals;
    },

    async issue(draft: CreditNoteDraft) {
      const { data, error } = await supabase.rpc("issue_credit_note", { p_credit_note: draft });
      if (error) {
        logEvent("credit_note_issue_rpc_failed", draft.business_id, { code: error.code ?? "unknown" }, "error");
        if (isDocumentRefusal(error.code)) {
          throw new DocumentRejectedError(`the database refused the credit note (${error.code})`);
        }
        throw new Error(`credit_note_issue_rpc_failed ${error.code ?? "unknown"}`);
      }
      return { note: parseCreditNoteRow(data), created: true };
    },

    async afterIssued(note) {
      const auditKey = `credit_note_audit:${note.id}`;
      if (await claimDocumentNotice(supabase, note.business_id, auditKey, note.issued_at)) {
        await recordSystemAuditLogEntry(note.business_id, "credit_note.issued", "credit_note", note.id, {
          creditNoteNumber: note.credit_note_number,
          invoiceNumber: note.original_invoice_number,
          totalPaise: note.total_paise,
          reason: note.reason,
        });
      }
      await emailCreditNote(supabase, note);
    },

    log: logEvent,
  };
}

export async function issueCreditNoteForRefundNow(
  refund: Parameters<typeof issueCreditNoteForRefund>[1],
): Promise<IssueCreditNoteOutcome> {
  return issueCreditNoteForRefund(createCreditNoteServiceDeps(createServiceSupabaseClient()), refund);
}

