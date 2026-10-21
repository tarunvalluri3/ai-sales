import "server-only";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/logger";
import type { CreditNoteRow, InvoiceRow } from "@/lib/invoice-core";
import {
  invoiceHoldRowSchema,
  parseCreditNoteRow,
  parseInvoiceRow,
  type InvoiceHoldRow,
} from "@/lib/invoice-schemas";

/**
 * Dashboard reads of invoices, credit notes and parked payments (Phase
 * 17c), with the **Clerk-session** client -- i.e. behind the
 * `*_select_own_business` RLS policies, so a business reading its own
 * billing documents is a policy-checked SELECT and not a service-role read.
 *
 * Every query ALSO filters by the `businessId` that came from
 * `requireBusinessContext()`: RLS is the guarantee, the explicit filter is
 * the second line and keeps the intent readable. A document id that
 * belongs to another business therefore comes back as "not found" -- the
 * same answer as an id that does not exist, so the download route never
 * confirms that someone else's invoice exists.
 */

const uuidSchema = z.string().uuid();

export type BillingDocuments = {
  invoices: InvoiceRow[];
  creditNotes: CreditNoteRow[];
  holds: InvoiceHoldRow[];
};

const HISTORY_LIMIT = 200;

export async function listBillingDocuments(businessId: string): Promise<BillingDocuments> {
  const supabase = createServerSupabaseClient();
  const [invoices, creditNotes, holds] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .eq("business_id", businessId)
      .order("invoice_date", { ascending: false })
      .order("sequence_number", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from("credit_notes")
      .select("*")
      .eq("business_id", businessId)
      .order("credit_note_date", { ascending: false })
      .order("sequence_number", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase.from("invoice_holds").select("*").eq("business_id", businessId).order("created_at", { ascending: true }),
  ]);

  if (invoices.error || creditNotes.error || holds.error) {
    logEvent("billing_documents_read_failed", businessId, {}, "error");
    return { invoices: [], creditNotes: [], holds: [] };
  }

  const holdRows: InvoiceHoldRow[] = [];
  for (const row of holds.data ?? []) {
    const parsed = invoiceHoldRowSchema.safeParse(row);
    if (parsed.success) holdRows.push(parsed.data);
  }

  return {
    invoices: (invoices.data ?? []).map(parseInvoiceRow),
    creditNotes: (creditNotes.data ?? []).map(parseCreditNoteRow),
    holds: holdRows,
  };
}

export async function getInvoiceForBusiness(businessId: string, invoiceId: string): Promise<InvoiceRow | null> {
  if (!uuidSchema.safeParse(invoiceId).success) return null;
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) {
    logEvent("invoice_read_failed", businessId, {}, "error");
    return null;
  }
  return data ? parseInvoiceRow(data) : null;
}

export async function getCreditNoteForBusiness(businessId: string, creditNoteId: string): Promise<CreditNoteRow | null> {
  if (!uuidSchema.safeParse(creditNoteId).success) return null;
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("credit_notes")
    .select("*")
    .eq("id", creditNoteId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) {
    logEvent("credit_note_read_failed", businessId, {}, "error");
    return null;
  }
  return data ? parseCreditNoteRow(data) : null;
}
