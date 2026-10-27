/**
 * Untrusted-content tagging for the system prompt (guardrails Phase 2). Pure,
 * no I/O, not `server-only`, so scripts/run-guardrail-tests.mjs imports it
 * directly.
 *
 * Retrieved knowledge, tool results and the business profile are DATA the
 * model reads, never instructions. They are fenced in tags so the prompt can
 * say so with a literal boundary. A fixed tag name is a weak fence: anyone who
 * controls any of that content (a poisoned document, an ingested web page, a
 * profile field) can type the closing tag and then write "instructions" that
 * appear to sit outside it. So:
 *
 *  1. every tag carries a random per-request suffix -- the attacker cannot
 *     know it, so no content can ever contain a matching closing tag; and
 *  2. any tag-looking text is also scrubbed out of the content itself, so a
 *     forged tag does not even reach the model as a confusing near-miss.
 *
 * The suffix is drawn from the platform CSPRNG (Web Crypto) per request, never
 * derived from anything a visitor or a business controls.
 */

import { sanitizeShortField } from "@/lib/guardrails/sanitize";

export type UntrustedTags = {
  /** The random suffix itself (12 hex chars = 48 bits). */
  nonce: string;
  /** Tag name wrapping the passively retrieved knowledge + catalog. */
  context: string;
  /** Tag name wrapping every tool result. */
  toolResult: string;
  /** Tag name wrapping the business-supplied profile fields. */
  profile: string;
};

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A fresh set of tag names. Call once per request; never reuse across requests. */
export function newUntrustedTags(): UntrustedTags {
  const nonce = randomHex(6);
  return {
    nonce,
    context: `retrieved_context_${nonce}`,
    toolResult: `tool_result_${nonce}`,
    profile: `business_profile_${nonce}`,
  };
}

// Any open/close/self-closing tag whose name is one the prompt uses (with or
// without a suffix) or a role/instruction look-alike. Deliberately limited to
// those names: ordinary markup a business might legitimately have in a
// description is not our business to rewrite.
const TAG_LIKE_RE = /<\s*\/?\s*(?:retrieved_context|tool_result|business_profile|system|assistant|user|human|instructions?|prompt)[\w-]*[^>]*>?/gi;

/** Removes tag-looking text that could imitate (or close) a prompt boundary. */
export function neutralizeTagText(text: string): string {
  return text.replace(TAG_LIKE_RE, " ");
}

/**
 * For a short business-supplied value interpolated into the prompt (name,
 * description, website, contact fields): invisible/control characters out,
 * forged tags out, one line, hard length cap.
 */
export function cleanUntrustedLine(text: string, maxChars: number): string {
  return sanitizeShortField(neutralizeTagText(text), maxChars);
}

/** A tool result fenced with this request's tag. The content is scrubbed first. */
export function wrapToolResult(tags: UntrustedTags, json: string): string {
  return `<${tags.toolResult}>${neutralizeTagText(json)}</${tags.toolResult}>`;
}
