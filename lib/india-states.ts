/**
 * India's GST state codes -- the customer's **place of supply**, captured
 * at checkout in Phase 17b (STATE.md) because Phase 17c's tax invoices
 * cannot be issued without it.
 *
 * Why a code and not a name. The code is the thing that decides the tax
 * treatment: when the customer's code equals the supplier's, the supply is
 * intra-state and the invoice carries CGST + SGST; when it differs, the
 * supply is inter-state and the invoice carries one IGST line
 * (`gstBreakdown()` in lib/plans.ts already computes both forms). It is
 * also the first two digits of a GSTIN, so a customer's declared state and
 * their declared GSTIN can be cross-checked against each other without
 * parsing a free-text name.
 *
 * NOT "server-only": the billing page renders this list in a <select>.
 * There is nothing sensitive in it -- it is public statutory data.
 *
 * Codes are from the GST state-code list used on every Indian tax invoice.
 * 'Others' (97) and 'Centre Jurisdiction' (99) are deliberately omitted:
 * neither is a place a customer lives, and this product is India-only for
 * v1 (STATE.md), so a customer who cannot find their state here is one we
 * should be talking to rather than silently invoicing.
 */

export type IndianState = {
  /** Two-digit GST state code, as stored in `subscriptions.billing_state_code`. */
  readonly code: string;
  readonly name: string;
};

export const INDIAN_STATES: readonly IndianState[] = [
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "18", name: "Assam" },
  { code: "10", name: "Bihar" },
  { code: "04", name: "Chandigarh" },
  { code: "22", name: "Chhattisgarh" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "07", name: "Delhi" },
  { code: "30", name: "Goa" },
  { code: "24", name: "Gujarat" },
  { code: "06", name: "Haryana" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "01", name: "Jammu and Kashmir" },
  { code: "20", name: "Jharkhand" },
  { code: "29", name: "Karnataka" },
  { code: "32", name: "Kerala" },
  { code: "38", name: "Ladakh" },
  { code: "31", name: "Lakshadweep" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "27", name: "Maharashtra" },
  { code: "14", name: "Manipur" },
  { code: "17", name: "Meghalaya" },
  { code: "15", name: "Mizoram" },
  { code: "13", name: "Nagaland" },
  { code: "21", name: "Odisha" },
  { code: "34", name: "Puducherry" },
  { code: "03", name: "Punjab" },
  { code: "08", name: "Rajasthan" },
  { code: "11", name: "Sikkim" },
  { code: "33", name: "Tamil Nadu" },
  { code: "36", name: "Telangana" },
  { code: "16", name: "Tripura" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "05", name: "Uttarakhand" },
  { code: "19", name: "West Bengal" },
] as const;

/** Lookup for Zod validation and for the DB check constraint's TypeScript twin. */
const STATE_CODES: ReadonlySet<string> = new Set(INDIAN_STATES.map((state) => state.code));

export function isIndianStateCode(value: unknown): value is string {
  return typeof value === "string" && STATE_CODES.has(value);
}

/**
 * The state's name for display, or null for a code this registry does not
 * know. Null rather than a placeholder: a billing page that shows "Unknown
 * state" next to a GST invoice is worse than one that shows nothing and
 * asks again.
 */
export function stateNameForCode(code: string | null): string | null {
  if (!code) return null;
  return INDIAN_STATES.find((state) => state.code === code)?.name ?? null;
}

/**
 * The first two digits of a GSTIN are its holder's state code. Phase 17c
 * needs the two to agree before it puts both on an invoice; exposed here
 * so that check lives next to the codes it checks.
 */
export function stateCodeFromGstin(gstin: string): string | null {
  const code = gstin.slice(0, 2);
  return STATE_CODES.has(code) ? code : null;
}
