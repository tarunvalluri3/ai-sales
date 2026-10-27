import { tokenize } from "@/lib/answer-bank/normalize";

/**
 * Output checks for stored answers. Pure.
 *
 * Two layers:
 *  - at STORE time (generation): `findUngroundedFacts` -- every link, email
 *    address, phone number and number in a generated answer must appear in the
 *    business's own text the answer was built from, so a model cannot smuggle
 *    an invented URL, phone number or price into a stored answer;
 *  - at SERVE time: `servableFormatRefusal` -- a cheap format check on
 *    whatever is about to be sent, so a corrupted row can never reach a visitor.
 *
 * Note: the live AI path has no post-generation output filter in this
 * codebase (verified 2026-10-28), so there is no shared "AI output check" to
 * reuse; these are the checks the stored answers get, and they are stricter
 * than the AI path's because a stored answer is served many times.
 */

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?<![\d.])\+?\d[\d\s().-]{7,}\d(?![\d])/g;

function canonicalUrl(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[.,;:!?)]+$/, "")
    .replace(/\/+$/, "");
}

function digitsOnly(text: string): string {
  return text.replace(/\D/g, "");
}

/** Facts in `answer` that are not present in `sourceText` (the business's own context). An empty array means the answer is grounded. */
export function findUngroundedFacts(answer: string, sourceText: string): string[] {
  const problems: string[] = [];
  const sourceLower = sourceText.toLowerCase();
  const sourceCanonical = sourceLower.replace(/https?:\/\//g, "").replace(/www\./g, "");
  const sourceDigits = digitsOnly(sourceText);

  for (const url of answer.match(URL_PATTERN) ?? []) {
    if (!sourceCanonical.includes(canonicalUrl(url))) problems.push(`link:${url}`);
  }
  for (const email of answer.match(EMAIL_PATTERN) ?? []) {
    if (!sourceLower.includes(email.toLowerCase())) problems.push(`email:${email}`);
  }
  for (const phone of answer.match(PHONE_PATTERN) ?? []) {
    const digits = digitsOnly(phone);
    if (digits.length >= 8 && !sourceDigits.includes(digits)) problems.push(`phone:${phone}`);
  }

  // Numbers (prices, quantities, years): each must appear as a token in the source.
  const sourceTokens = new Set(tokenize(sourceText));
  for (const token of tokenize(answer)) {
    if (/\p{N}/u.test(token) && !sourceTokens.has(token)) problems.push(`number:${token}`);
  }
  return problems;
}

const MAX_SERVABLE_CHARS = 4000;

/** Reason a stored answer must not be sent as-is, or null. */
export function servableFormatRefusal(answer: string): string | null {
  if (answer.trim().length === 0) return "empty";
  if (answer.length > MAX_SERVABLE_CHARS) return "too_long";
  if (/<\s*\/?\s*(script|iframe|style|object|embed)\b/i.test(answer)) return "markup";
  if (/\bjavascript:/i.test(answer)) return "script_url";
  return null;
}
