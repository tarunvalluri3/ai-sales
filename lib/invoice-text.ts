/**
 * Which text may appear on a tax document (Phase 17c). Pure, NOT
 * "server-only".
 *
 * The invoice PDF embeds one font (Geist, the product's own typeface, in
 * lib/invoice-pdf-fonts.ts). A character that font has no glyph for would
 * print as an empty box on a legal document -- and since an issued invoice
 * is immutable, that box could never be corrected. So the customer's name
 * and address are held to an explicit allow-list at the point they are
 * entered AND again when the invoice is built, and
 * scripts/run-invoice-tests.mjs proves, glyph by glyph, that both
 * embedded fonts cover every code point on it.
 *
 * The list is Basic Latin, Latin-1 Supplement, Latin Extended-A (covers
 * every accented letter that appears in Indian business names written in
 * Roman script), typographic dashes and quotes, the bullet, and the rupee
 * sign. Names written only in an Indian script are not supported on a
 * document we cannot render faithfully; the form says so rather than
 * letting a box through.
 */

/** Inclusive code-point ranges. */
export const INVOICE_TEXT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0020, 0x007e], // Basic Latin (printable)
  [0x00a0, 0x00ff], // Latin-1 Supplement
  [0x0100, 0x017f], // Latin Extended-A
  [0x2013, 0x2014], // en dash, em dash
  [0x2018, 0x2019], // single quotes
  [0x201c, 0x201d], // double quotes
  [0x2022, 0x2022], // bullet
  [0x20b9, 0x20b9], // rupee sign
];

/**
 * Code points inside the ranges above that the embedded fonts have NO glyph
 * for -- found by the exhaustive glyph test in scripts/run-invoice-tests.mjs,
 * which fails if this list is incomplete. None occurs in an Indian business
 * name or address written in Roman script (the soft hyphen, and a handful of
 * rare Latin Extended-A letters).
 */
export const INVOICE_TEXT_EXCLUDED: ReadonlySet<number> = new Set([
  0x00ad, 0x0114, 0x0115, 0x012c, 0x012d, 0x0138, 0x013f, 0x0140, 0x0149, 0x014e, 0x014f, 0x017f,
]);

function isAllowedCodePoint(codePoint: number): boolean {
  if (INVOICE_TEXT_EXCLUDED.has(codePoint)) return false;
  return INVOICE_TEXT_RANGES.some(([low, high]) => codePoint >= low && codePoint <= high);
}

/**
 * An address may run to this many lines. Indian postal addresses are four to
 * six; the cap keeps a document's layout bounded -- a 600-character address
 * made of 300 one-letter lines would otherwise run off the page.
 */
export const ADDRESS_MAX_LINES = 8;

/** The distinct characters in `text` that may not appear on a document. Newlines are allowed. */
export function unsupportedInvoiceCharacters(text: string): string[] {
  const bad = new Set<string>();
  for (const char of text) {
    if (char === "\n") continue;
    if (!isAllowedCodePoint(char.codePointAt(0) as number)) bad.add(char);
  }
  return [...bad];
}

/**
 * Tidies free text before it is validated or stored: line endings to `\n`,
 * other control characters and the soft hyphen dropped, runs of spaces and
 * tabs collapsed, each line trimmed, blank lines removed, and (for a
 * single-line field) the lines joined with a space. It never changes which
 * letters there are, only the whitespace around them.
 */
export function normalizeInvoiceText(input: string, options: { multiline: boolean }): string {
  const lines = input
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\ufeff]/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((line) => line !== "");

  return lines.join(options.multiline ? "\n" : " ");
}
