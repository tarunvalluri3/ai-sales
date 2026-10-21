/**
 * Money and date formatting for GST documents (Phase 17c). Pure, NOT
 * "server-only".
 *
 * **Why this is not `formatPaiseAsInr` from lib/plans.ts.** That helper
 * rounds to whole rupees, which is correct for the GST-inclusive GROSS
 * prices (all whole rupees) and wrong for everything an invoice shows: a
 * taxable value of 8,473.73 or a CGST of 762.63 would silently print as
 * 8,474 and 763. Every figure on a tax document carries exactly two
 * decimals, formatted by hand here with Indian digit grouping (1,23,456.00)
 * rather than via `toLocaleString`, so the output does not depend on which
 * ICU build the runtime happens to ship.
 */

export const RUPEE_SIGN = "₹";

function assertPaise(paise: number): void {
  if (!Number.isSafeInteger(paise) || paise < 0) {
    throw new Error(`invoice-format: expected a non-negative integer number of paise, got ${paise}`);
  }
}

/**
 * Indian digit grouping of a non-negative integer string: the last three
 * digits, then groups of two. '123456' -> '1,23,456'.
 */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${lastThree}`;
}

/** '1,23,456.00' -- two decimals, Indian grouping, no currency symbol. */
export function formatPaiseAmount(paise: number): string {
  assertPaise(paise);
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  return `${groupIndian(String(rupees))}.${String(remainder).padStart(2, "0")}`;
}

/** '₹1,23,456.00'. */
export function formatPaiseAsInr2dp(paise: number): string {
  return `${RUPEE_SIGN}${formatPaiseAmount(paise)}`;
}

const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 1-99 in words. */
function wordsBelowHundred(n: number): string {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  return n % 10 === 0 ? tens : `${tens}-${ONES[n % 10]}`;
}

/** 1-999 in words. */
function wordsBelowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest > 0) parts.push(wordsBelowHundred(rest));
  return parts.join(" ");
}

/**
 * A whole number in the Indian system (crore, lakh, thousand), as invoices
 * write it: 123456 -> 'One Lakh Twenty-Three Thousand Four Hundred
 * Fifty-Six'. Zero is 'Zero'.
 */
export function integerInIndianWords(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`invoice-format: cannot spell ${value}`);
  }
  if (value === 0) return "Zero";

  const units: Array<[number, string]> = [
    [10_000_000, "Crore"],
    [100_000, "Lakh"],
    [1_000, "Thousand"],
  ];

  const parts: string[] = [];
  let remaining = value;
  for (const [size, name] of units) {
    const count = Math.floor(remaining / size);
    if (count > 0) {
      // 'Crore' can itself be large (>= 100 crore): spell the count with the
      // same routine rather than assuming it is below one hundred.
      parts.push(`${size === 10_000_000 ? integerInIndianWords(count) : wordsBelowHundred(count)} ${name}`);
      remaining -= count * size;
    }
  }
  if (remaining > 0) parts.push(wordsBelowThousand(remaining));
  return parts.join(" ");
}

/**
 * The amount in words, as a tax invoice prints it:
 * 149900 -> 'Rupees One Thousand Four Hundred Ninety-Nine Only';
 * 152527 -> 'Rupees One Thousand Five Hundred Twenty-Five and Twenty-Seven Paise Only'.
 */
export function paiseInWords(paise: number): string {
  assertPaise(paise);
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  const rupeeWords = `Rupees ${integerInIndianWords(rupees)}`;
  return remainder === 0
    ? `${rupeeWords} Only`
    : `${rupeeWords} and ${integerInIndianWords(remainder)} Paise Only`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** '2026-10-21' (a stored IST date) -> '21 Oct 2026'. */
export function formatIsoDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) throw new Error(`invoice-format: not an ISO date: ${isoDate}`);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`invoice-format: bad month in ${isoDate}`);
  return `${Number(match[3])} ${MONTHS[month - 1]} ${match[1]}`;
}
