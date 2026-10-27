/**
 * Message normalization for the instant-answer path. Pure -- no I/O, no
 * `server-only` -- so the unit tests (scripts/run-answer-bank-tests.mjs) can
 * import it directly, same convention as lib/abuse-limits.ts.
 */

/** Longest message the instant path will even consider. Longer text is a real, specific question and goes to the AI. */
export const MAX_INSTANT_MESSAGE_CHARS = 200;

const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff]/g;

/**
 * The key a message (or a stored question) is compared by: NFKC, lowercase,
 * zero-width characters removed, smart quotes straightened, whitespace
 * collapsed, surrounding quotes and trailing sentence punctuation dropped.
 * Deliberately conservative -- internal punctuation and every digit survive,
 * so "Is it 499?" and "Is it 4.99?" never collapse to the same key. Two
 * messages share a key only if they are the same words.
 */
export function normalizeQuestionKey(text: string): string {
  return text
    .normalize("NFKC")
    .replace(ZERO_WIDTH, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/[?.!\u0964\u061f]+$/u, "")
    .trim();
}

/** Letter, combining-mark and digit runs of a text, lowercased -- the unit the lexical guards compare. Marks are kept so Indic words (whose vowel signs are marks) are not split apart. */
export function tokenize(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

/** Business-authored text embedded in a generated welcome: no control characters or angle brackets, one line, capped. */
export function cleanInline(text: string, maxChars: number): string {
  return text.replace(/[<>\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxChars);
}
