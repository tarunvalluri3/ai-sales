/**
 * Business currency and catalog price display (bug, 2026-11-20: an Indian
 * clinic's "Rs 6,500" was rejected, and its 6500 showed as "$6500"). Pure --
 * shared by the dashboard, onboarding, the widget's product cards, the AI
 * tools and the catalog the model is shown, so every surface formats the same
 * price the same way.
 *
 * Rules:
 *  - `products.price` / `services.price` is the owner's DISPLAY text ("Rs
 *    6,500", "From ₹1,200", "₹500/session", "Contact us"). A price that is
 *    only a number ("6500", "6,500", "1,20,000") is shown in the business's
 *    currency ("₹6,500"); anything else is shown exactly as typed.
 *  - `price_amount` (budget matching) is derived from the display text only
 *    when it holds exactly one plain number. Ranges ("₹500-₹800"), shorthand
 *    ("₹1.2 lakh", "6.5k") and anything ambiguous are left blank, never
 *    guessed.
 */

export const SUPPORTED_CURRENCIES = [
  { code: "INR", label: "Indian rupee (₹)" },
  { code: "USD", label: "US dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British pound (£)" },
  { code: "AED", label: "UAE dirham (AED)" },
  { code: "SGD", label: "Singapore dollar (S$)" },
  { code: "AUD", label: "Australian dollar (A$)" },
  { code: "CAD", label: "Canadian dollar (CA$)" },
  { code: "NZD", label: "New Zealand dollar (NZ$)" },
  { code: "SAR", label: "Saudi riyal (SAR)" },
  { code: "JPY", label: "Japanese yen (¥)" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

export const DEFAULT_CURRENCY: CurrencyCode = "INR";

export function isSupportedCurrency(code: unknown): code is CurrencyCode {
  return typeof code === "string" && SUPPORTED_CURRENCIES.some((currency) => currency.code === code);
}

const EURO_ZONES = /^Europe\/(?!London$|Moscow$|Istanbul$|Kyiv$|Zurich$|Oslo$|Stockholm$|Copenhagen$|Warsaw$|Prague$|Budapest$|Bucharest$|Sofia$|Belgrade$|Minsk$|Jersey$|Guernsey$|Isle_of_Man$|Gibraltar$)/;

/**
 * Default currency for a new business from its (normalised) time zone. India
 * is the home market, so anything not mapped -- including UTC -- is INR.
 * Always editable by the owner.
 */
export function currencyForTimezone(timezone: string): CurrencyCode {
  if (timezone === "Asia/Kolkata") return "INR";
  if (timezone === "America/Toronto" || timezone === "America/Vancouver" || timezone === "America/Edmonton" || timezone === "America/Winnipeg" || timezone === "America/Halifax" || timezone === "America/St_Johns" || timezone === "America/Regina") return "CAD";
  if (/^(America\/|Pacific\/Honolulu$)/.test(timezone) && !/^America\/(Sao_Paulo|Argentina|Bogota|Lima|Santiago|Mexico_City|Caracas|Montevideo|La_Paz|Asuncion|Guayaquil)/.test(timezone)) return "USD";
  if (timezone === "Europe/London" || timezone === "Europe/Jersey" || timezone === "Europe/Guernsey" || timezone === "Europe/Isle_of_Man") return "GBP";
  if (EURO_ZONES.test(timezone)) return "EUR";
  if (timezone === "Asia/Dubai") return "AED";
  if (timezone === "Asia/Singapore") return "SGD";
  if (timezone === "Asia/Riyadh") return "SAR";
  if (timezone === "Asia/Tokyo") return "JPY";
  if (timezone.startsWith("Australia/")) return "AUD";
  if (timezone === "Pacific/Auckland") return "NZD";
  return DEFAULT_CURRENCY;
}

/** Western (1,234,567) or Indian (12,34,567) digit grouping, or none; optional decimals. */
const GROUPED_NUMBER = /^(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3}|\d+)(?:\.\d+)?$/;

function toNumber(token: string): number | null {
  if (!GROUPED_NUMBER.test(token)) return null;
  const value = Number(token.replace(/,/g, ""));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** A price that is nothing but a number (optionally grouped): "6500", "6,500", "1,20,000.50". */
export function plainNumericPrice(text: string): number | null {
  return toNumber(text.trim());
}

const NUMBER_TOKEN = /\d[\d,]*(?:\.\d+)?/g;
const MULTIPLIER_AFTER = /^\s*(?:k|m|b|l|cr|mn|bn|lakhs?|lacs?|crores?|thousand|million|billion)\b/i;
const RANGE_WORDS = /\b(?:to|or|between)\b|[-–—]\s*(?:₹|rs\.?|inr|\$|€|£)?\s*\d/i;

/**
 * The budget-matching amount for a display price, or null when it can't be
 * read unambiguously: exactly one number, no multiplier, not a range.
 * "Rs 6,500" -> 6500; "From ₹1,200" -> 1200; "₹500/session" -> 500;
 * "₹1,20,000" -> 120000; "₹500-₹800", "₹1.2 lakh", "6.5k" -> null.
 */
export function parsePriceAmount(text: string | null | undefined): number | null {
  if (!text) return null;
  const tokens = [...text.matchAll(NUMBER_TOKEN)];
  if (tokens.length !== 1) return null;
  if (RANGE_WORDS.test(text)) return null;
  const [match] = tokens;
  const after = text.slice((match.index ?? 0) + match[0].length);
  if (MULTIPLIER_AFTER.test(after)) return null;
  // A trailing comma/period is punctuation, not part of the number ("Rs 6,500.").
  return toNumber(match[0].replace(/[.,]+$/, ""));
}

function localeFor(currency: string): string {
  return currency === "INR" ? "en-IN" : "en-US";
}

/** 120000 INR -> "₹1,20,000"; 19.99 USD -> "$19.99". Whole amounts show no decimals. */
export function formatMoney(amount: number, currency: string): string {
  const whole = Number.isInteger(amount);
  try {
    return new Intl.NumberFormat(localeFor(currency), {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

/**
 * What every surface shows for a catalog price. A plain number gets the
 * business's currency; text is the owner's own wording, shown as typed.
 * Accepts the snapshot's legacy numeric form too.
 */
export function formatCatalogPrice(price: string | number | null | undefined, currency: string): string | null {
  if (price === null || price === undefined) return null;
  const text = String(price).trim();
  if (text === "") return null;
  const numeric = plainNumericPrice(text);
  return numeric === null ? text : formatMoney(numeric, currency);
}

/** The placeholder for the price field, in the business's own currency. */
export function pricePlaceholder(currency: string): string {
  return currency === "INR" ? "e.g. ₹6,500 or From ₹1,200" : `e.g. ${formatMoney(65, currency)} or From ${formatMoney(12, currency)}`;
}
