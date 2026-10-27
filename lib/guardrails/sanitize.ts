/**
 * Input sanitising for visitor-controlled text (guardrails Phase 1). Pure --
 * no I/O, not `server-only` -- so scripts/run-guardrail-tests.mjs can import
 * it directly, like lib/abuse-limits.ts.
 *
 * What it removes is only ever *invisible or unrenderable*: control
 * characters (including NUL, which Postgres rejects -- a message containing
 * one used to fail with an HTTP 500 and was lost), zero-width and bidi
 * formatting characters (used to hide or reorder text from a human reviewer
 * while the model still reads it), the Unicode "tag" block, BOM, soft
 * hyphen and lone surrogates. Visible text is kept as typed apart from NFKC
 * normalisation, which folds look-alike forms (full-width letters, ligatures)
 * onto their plain equivalents.
 *
 * ZWJ/ZWNJ are the one subtle case: they are invisible, but they are also
 * load-bearing in Indic scripts (conjuncts in Telugu, Hindi, ...) and in
 * emoji sequences. They are kept only when they sit between such characters,
 * and stripped when they sit between ASCII letters, where they can only be
 * obfuscation ("i<ZWJ>gnore").
 */

/** The one place the per-message ceiling lives; every channel uses it. */
export const MAX_PROSPECT_MESSAGE_CHARS = 2000;

// Soft hyphen, zero-width space, LRM/RLM, bidi embeddings/overrides/isolates,
// word joiner and invisible operators, Mongolian vowel separator, BOM,
// interlinear annotation, and the Unicode tag block (used for invisible
// "ASCII smuggling").
const INVISIBLE_RE = /[­​‎‏‪-‮⁠-⁤⁦-⁩᠎﻿￹-￻]|[\u{E0000}-\u{E007F}]/gu;
// C0 and C1 controls except tab and newline (carriage returns are folded to
// newlines first).
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const JOINER_RE = /[‌‍]/g;
const JOINABLE_NEIGHBOUR_RE = /[\p{L}\p{M}\p{Extended_Pictographic}️]/u;

export type SanitizeResult = {
  text: string;
  /** Characters removed as invisible/control/joiner noise (not counting truncation). */
  removedCount: number;
  truncated: boolean;
};

function stripJoinersBetweenAscii(text: string): string {
  return text.replace(JOINER_RE, (joiner, offset: number, whole: string) => {
    const before = Array.from(whole.slice(Math.max(0, offset - 2), offset)).pop() ?? "";
    const after = Array.from(whole.slice(offset + 1, offset + 3))[0] ?? "";
    const bothSides = before !== "" && after !== "";
    const nonAsciiSide = [before, after].some((ch) => ch !== "" && ch.codePointAt(0)! > 0x7f);
    const keep = bothSides && nonAsciiSide && JOINABLE_NEIGHBOUR_RE.test(before) && JOINABLE_NEIGHBOUR_RE.test(after);
    return keep ? joiner : "";
  });
}

/** Cuts to `max` UTF-16 units without leaving half of a surrogate pair. */
function truncateSafely(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/**
 * Sanitises and length-caps visitor text. Never throws. The result is
 * trimmed; an empty `text` means nothing visible was left.
 */
export function sanitizeVisitorText(raw: string, maxChars: number = MAX_PROSPECT_MESSAGE_CHARS): SanitizeResult {
  let text = raw.replace(/\r\n?/g, "\n");
  const normalisedLength = text.length;
  text = text.replace(LONE_SURROGATE_RE, "").replace(INVISIBLE_RE, "").replace(CONTROL_RE, "");
  text = stripJoinersBetweenAscii(text);
  const removedCount = normalisedLength - text.length;
  text = text.normalize("NFKC");
  // NFKC can itself produce characters from the sets above (e.g. a compatibility
  // form of a control), so the cheap passes run once more.
  text = text.replace(INVISIBLE_RE, "").replace(CONTROL_RE, "").trim();
  const capped = truncateSafely(text, maxChars).trim();
  return { text: capped, removedCount, truncated: capped.length < text.length };
}

/**
 * For short visitor-supplied fields that are stored but not conversational
 * (visitor id, page path): same cleaning, flattened onto one line.
 */
export function sanitizeShortField(raw: string, maxChars: number): string {
  return sanitizeVisitorText(raw, maxChars).text.replace(/\s+/g, " ");
}
