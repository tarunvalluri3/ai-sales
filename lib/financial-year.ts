/**
 * Indian financial years and GST document numbers, for Phase 17c.
 *
 * A financial year runs 1 April - 31 March **in IST**, and an invoice's
 * year is decided by its date in IST, never UTC. The difference is real: a
 * payment taken at 23:00 IST on 31 March is 17:30 UTC on 31 March (still
 * the old year either way), but one taken at 00:30 IST on 1 April is
 * 19:00 UTC on 31 March -- a UTC calendar would file it in the year that
 * had already ended.
 *
 * India has no daylight saving, so IST is a fixed UTC+05:30 and the offset
 * is applied arithmetically. That is deliberate: it needs no ICU timezone
 * database, behaves identically on Vercel, in CI and in a local script,
 * and cannot be changed by a platform timezone setting.
 *
 * Pure and NOT "server-only". The database holds the same rule as a CHECK
 * constraint (`invoices_financial_year_matches_date`), so if this file ever
 * disagrees with it, the insert fails instead of filing the invoice in the
 * wrong year; supabase/tests/database/050 asserts both sides of the
 * boundary against the real constraint.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export type IstDate = { readonly year: number; readonly month: number; readonly day: number };

/** The calendar date, in IST, of an instant. `month` is 1-12. */
export function istDateOf(instant: Date): IstDate {
  const ms = instant.getTime();
  if (!Number.isFinite(ms)) throw new Error("istDateOf: invalid date");
  // Shifting by the offset and reading the UTC fields yields the IST fields.
  const shifted = new Date(ms + IST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** 'YYYY-MM-DD' of the IST date, the format the `date` columns take. */
export function istDateString(instant: Date): string {
  const { year, month, day } = istDateOf(instant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The financial year containing an instant, as '2026-27'. April starts a
 * new year; January-March belong to the year that began the previous April.
 */
export function financialYearForInstant(instant: Date): string {
  const { year, month } = istDateOf(instant);
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export type DocumentSeries = "invoice" | "credit_note";

/**
 * Document-number prefixes. A GST document number may not exceed 16
 * characters, which is why the credit-note series is `WAC` and not
 * `WAP/CN`: 'WAP/CN/2026-27/0001' is 19 characters, 'WAC/2026-27/0001' is
 * exactly 16. The same limit is why a series tops out at 9,999 a year -- a
 * fifth digit would make the number illegal -- and why the database
 * refuses the 10,000th.
 */
export const DOCUMENT_PREFIX: Readonly<Record<DocumentSeries, string>> = {
  invoice: "WAP",
  credit_note: "WAC",
};

/**
 * Documents for Razorpay TEST-mode payments are numbered in their own
 * series, so they can never enter the real one or use up its numbers (see
 * the migration's "Test-mode documents" note). Same length as the real
 * prefixes, so the 16-character limit holds for them too.
 */
export const TEST_DOCUMENT_PREFIX: Readonly<Record<DocumentSeries, string>> = {
  invoice: "TST",
  credit_note: "TSC",
};

export const MAX_DOCUMENTS_PER_YEAR = 9_999;
export const MAX_DOCUMENT_NUMBER_LENGTH = 16;

/**
 * 'WAP/2026-27/0001'. The database builds the real number inside
 * issue_invoice()/issue_credit_note() (under the counter lock); this is the
 * same string for the tests' in-memory store, which is pinned to the
 * database's own output by supabase/tests/database/050 and 051.
 */
export function formatDocumentNumber(
  series: DocumentSeries,
  financialYear: string,
  sequence: number,
  options: { isTest?: boolean } = {},
): string {
  if (!/^\d{4}-\d{2}$/.test(financialYear)) throw new Error(`formatDocumentNumber: bad financial year ${financialYear}`);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_DOCUMENTS_PER_YEAR) {
    throw new Error(`formatDocumentNumber: sequence ${sequence} is outside 1-${MAX_DOCUMENTS_PER_YEAR}`);
  }
  const prefix = options.isTest ? TEST_DOCUMENT_PREFIX[series] : DOCUMENT_PREFIX[series];
  return `${prefix}/${financialYear}/${String(sequence).padStart(4, "0")}`;
}
