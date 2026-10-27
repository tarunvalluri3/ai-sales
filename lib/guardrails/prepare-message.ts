import { sanitizeVisitorText, MAX_PROSPECT_MESSAGE_CHARS } from "@/lib/guardrails/sanitize";
import { maskSensitiveNumbers } from "@/lib/guardrails/mask";
import { classifyMessage, type ClassifierSignalType } from "@/lib/guardrails/classify";
import { GUARDRAIL_MODES, type GuardrailMode } from "@/lib/guardrails/config";

export type GuardrailSignalType =
  | ClassifierSignalType
  | "sensitive_data"
  | "invisible_characters"
  | "message_truncated"
  | "output_canary_leak"
  | "output_verbatim_leak"
  | "output_unlisted_url"
  | "output_unlisted_email"
  | "output_unlisted_phone"
  | "output_unbacked_promise";

/** What was done about a signal: only recorded (`logged`), or the text was actually changed. */
export type GuardrailAction = "logged" | "masked" | "sanitized" | "truncated" | "blocked" | "replaced" | "removed";

export type GuardrailSignal = {
  type: GuardrailSignalType;
  /** Stable rule id for classifier hits, or the sensitive kind for masking. */
  rule: string;
  action: GuardrailAction;
  mode: GuardrailMode;
};

export type PreparedProspectMessage = {
  /** The text every downstream consumer (database, model, notifications) must use. */
  text: string;
  /** True when nothing visible survived sanitising -- the caller rejects the message. */
  empty: boolean;
  signals: GuardrailSignal[];
};

/**
 * The single entry point for a prospect's message on every channel (widget,
 * WhatsApp, Instagram, dashboard sandbox): sanitise -> classify -> mask ->
 * final length cap. Pure and synchronous; costs microseconds.
 *
 * Order matters. The classifier sees the sanitised-but-unmasked text (masking
 * could remove words it keys on, e.g. "my OTP is ..."), but only the MASKED
 * text is ever returned, so an unmasked card/Aadhaar/OTP can reach neither the
 * database nor the model. The cap runs last because a placeholder can be
 * longer than the digits it replaces.
 */
export function prepareProspectMessage(raw: string): PreparedProspectMessage {
  const signals: GuardrailSignal[] = [];

  const cleaned = sanitizeVisitorText(raw);
  if (cleaned.removedCount > 0) {
    signals.push({ type: "invisible_characters", rule: `removed_${Math.min(cleaned.removedCount, 99)}`, action: "sanitized", mode: "enforce" });
  }

  for (const hit of classifyMessage(cleaned.text)) {
    const check = hit.type === "abuse" ? "abuse" : "injection";
    signals.push({ type: hit.type, rule: hit.rule, action: "logged", mode: GUARDRAIL_MODES[check] });
  }

  const masked = maskSensitiveNumbers(cleaned.text);
  for (const kind of masked.kinds) {
    signals.push({ type: "sensitive_data", rule: kind, action: "masked", mode: "enforce" });
  }

  const final = sanitizeVisitorText(masked.text, MAX_PROSPECT_MESSAGE_CHARS);
  if (cleaned.truncated || final.truncated) {
    signals.push({ type: "message_truncated", rule: "max_length", action: "truncated", mode: "enforce" });
  }

  return { text: final.text, empty: final.text.length === 0, signals };
}
