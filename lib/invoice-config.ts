import { validateGstin } from "@/lib/gstin";
import { stateNameForCode } from "@/lib/india-states";

/**
 * THE ONE PLACE the supplier's legal identity is written down (Phase 17c).
 * Invoices, credit notes, their PDFs and their emails all read it from here
 * and nowhere else; no template contains a name, an address, a GSTIN or a
 * tax code of its own.
 *
 * Pure and NOT "server-only": the PDF layout and the tests import it.
 *
 * **Two values here are placeholders the owner has not confirmed yet** --
 * `address` and `sacCode` -- and they are written as `TODO:` strings on
 * purpose, not as plausible-looking guesses. A wrong address or tax code on
 * a tax invoice is a legal defect, and because issued invoices are
 * immutable it could never be corrected afterwards. So
 * `assertSupplierConfigReady()` refuses outright while any `TODO` remains,
 * and the issue path calls it before it snapshots anything. The refusal is
 * deliberately NOT limited to production: this repo's `.env.local` points at
 * the production database, so a "production only" guard would not protect a
 * local run from writing a placeholder into a real legal record. The
 * invoice generator therefore does nothing, anywhere, until both are filled
 * in. (Rendering a PDF from an already-issued invoice does not consult this
 * file at all -- it prints the supplier details frozen into that invoice.)
 *
 * What a refusal does to a customer: nothing visible. The payment is parked
 * in `invoice_holds` (reason `supplier_config_incomplete`), logged at error
 * level so it reaches Sentry, and issued automatically by the daily sweep
 * once this file is correct and deployed -- see lib/invoice-service.ts.
 */

export type SupplierConfig = {
  readonly name: string;
  readonly address: string;
  readonly gstin: string;
  /** Two-digit GST state code of the supplier: decides CGST+SGST versus IGST. */
  readonly stateCode: string;
  readonly stateName: string;
  /** Service Accounting Code printed against the line. */
  readonly sacCode: string;
};

export const SUPPLIER: SupplierConfig = {
  name: "Waves Web Studio",
  // TODO: replace with the registered principal place of business exactly as
  // it appears on the GST registration certificate.
  address: "TODO: registered address of Waves Web Studio, Hyderabad, Telangana",
  gstin: "36BYQPT2686E1ZR",
  stateCode: "36",
  stateName: "Telangana",
  // TODO: replace with the SAC code the owner confirms with their CA for
  // this service (a 4-8 digit code beginning 99).
  sacCode: "TODO: SAC code",
};

/** What is sold, printed on the invoice line. */
export const SERVICE_NAME = "Waves AI Pilot";

/** The name that appears in the PDF footer and the email subject. */
export const DOCUMENT_BRAND = "Waves AI Pilot";

export class SupplierConfigIncompleteError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`Supplier details in lib/invoice-config.ts are not ready: ${problems.join("; ")}`);
    this.name = "SupplierConfigIncompleteError";
    this.problems = problems;
  }
}

/**
 * Every reason the supplier config is not fit to print on a tax invoice.
 * Empty means ready. Checks more than the TODO markers: a GSTIN with a bad
 * check digit, a state code that disagrees with the GSTIN, or a SAC that is
 * not a SAC are just as wrong on a legal document as a placeholder.
 */
export function supplierConfigProblems(config: SupplierConfig = SUPPLIER): string[] {
  const problems: string[] = [];

  for (const [field, value] of Object.entries(config)) {
    if (typeof value !== "string" || value.trim() === "") problems.push(`${field} is empty`);
    else if (/\bTODO\b/i.test(value)) problems.push(`${field} is still a TODO placeholder`);
  }

  if (!/\bTODO\b/i.test(config.sacCode) && !/^99[0-9]{2,6}$/.test(config.sacCode)) {
    problems.push("sacCode must be a numeric SAC code starting 99");
  }

  const gstin = validateGstin(config.gstin, config.stateCode);
  if (!gstin.ok) problems.push(`gstin is not valid (${gstin.problem})`);

  if (stateNameForCode(config.stateCode) !== config.stateName) {
    problems.push("stateName does not match stateCode");
  }

  return problems;
}

/** Throws `SupplierConfigIncompleteError` unless the config is ready. Returns it for chaining. */
export function assertSupplierConfigReady(config: SupplierConfig = SUPPLIER): SupplierConfig {
  const problems = supplierConfigProblems(config);
  if (problems.length > 0) throw new SupplierConfigIncompleteError(problems);
  return config;
}
