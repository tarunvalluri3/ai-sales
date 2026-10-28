/**
 * What happens when a guardrail fires in ENFORCING mode (guardrails Phase 5).
 * Pure, no I/O, not `server-only`.
 *
 * One consistent path, whichever check fired and whichever channel it fired
 * on: a fixed safe reply (never model output), the conversation flagged
 * `needs_attention`, and the existing handover/notification flow -- no model
 * call at all for the input-side cases. Repeated abuse in one conversation
 * ends the AI's replies for good and hands the conversation to a human.
 *
 * Until a check is switched to "enforce" in lib/guardrails/config.ts this
 * returns `none` for it (log-only), so adding this path changes no behaviour
 * on its own.
 */

import { GUARDRAIL_MODES, type GuardrailMode } from "@/lib/guardrails/config";
import { GUARDRAIL_SAFE_REPLY } from "@/lib/guardrails/output-check";
import type { GuardrailSignal } from "@/lib/guardrails/prepare-message";

/** Abusive messages in one conversation after which the AI stops replying. */
export const ABUSE_STRIKE_LIMIT = 3;

/** Fixed text once the AI has stopped replying because of repeated abuse. */
export const ABUSE_HANDOVER_MESSAGE =
  "I'm going to pause this chat here and ask a member of our team to take over. They'll follow up with you shortly.";

const INJECTION_SIGNALS = new Set<GuardrailSignal["type"]>([
  "instruction_override",
  "prompt_extraction",
  "role_hijack",
  "tag_forgery",
  "encoded_payload",
]);

/** True when the classifier flagged this message (injection or abuse), whatever the rollout mode. */
export function hasClassifierFlag(signals: GuardrailSignal[]): boolean {
  return signals.some((signal) => signal.type === "abuse" || INJECTION_SIGNALS.has(signal.type));
}

export type InputGuardrailAction =
  | { kind: "none" }
  | { kind: "safe_reply"; reply: string; reason: string }
  | { kind: "end_ai_replies"; reply: string; reason: string };

export type InputPolicyModes = { injection: GuardrailMode; abuse: GuardrailMode };

/**
 * Decides what to do with a message BEFORE the model is called.
 *
 * - injection (enforce): a classifier hit gets the fixed safe reply + handover;
 * - abuse (enforce): once `priorAbuseStrikes` (abusive messages already recorded
 *   in this conversation) plus this message reaches the limit, the AI stops
 *   replying -- and stays stopped for every later message in the conversation,
 *   abusive or not, because the prior count never goes down.
 */
export function resolveInputGuardrailAction(
  signals: GuardrailSignal[],
  priorAbuseStrikes: number,
  modes: InputPolicyModes = GUARDRAIL_MODES,
): InputGuardrailAction {
  if (modes.abuse === "enforce") {
    const strikes = priorAbuseStrikes + (signals.some((signal) => signal.type === "abuse") ? 1 : 0);
    if (strikes >= ABUSE_STRIKE_LIMIT) {
      return { kind: "end_ai_replies", reply: ABUSE_HANDOVER_MESSAGE, reason: "guardrail:repeated_abuse" };
    }
  }
  if (modes.injection === "enforce") {
    const hit = signals.find((signal) => INJECTION_SIGNALS.has(signal.type));
    if (hit) return { kind: "safe_reply", reply: GUARDRAIL_SAFE_REPLY, reason: `guardrail:${hit.type}` };
  }
  return { kind: "none" };
}

// ------------------------------------------------------------- owner's marker

/** Signals that mean "a guardrail caught something" -- shown to the owner. Masking/sanitising and tool bookkeeping are not flags. */
export const FLAG_SIGNALS = [
  "instruction_override",
  "prompt_extraction",
  "role_hijack",
  "tag_forgery",
  "encoded_payload",
  "abuse",
  "output_canary_leak",
  "output_verbatim_leak",
  "output_unlisted_url",
  "output_unlisted_email",
  "output_unlisted_phone",
  "output_unbacked_promise",
  "write_tool_cap",
] as const;

const FLAG_LABELS: Record<string, [string, string]> = {
  instruction_override: ["prompt-injection attempt", "prompt-injection attempts"],
  prompt_extraction: ["attempt to extract the instructions", "attempts to extract the instructions"],
  role_hijack: ["attempt to change the AI's role", "attempts to change the AI's role"],
  tag_forgery: ["forged system text", "forged system text"],
  encoded_payload: ["encoded instruction", "encoded instructions"],
  abuse: ["abusive message", "abusive messages"],
  output_canary_leak: ["reply blocked (instruction leak)", "replies blocked (instruction leak)"],
  output_verbatim_leak: ["reply blocked (instruction leak)", "replies blocked (instruction leak)"],
  output_unlisted_url: ["link not in your business data", "links not in your business data"],
  output_unlisted_email: ["email not in your business data", "emails not in your business data"],
  output_unlisted_phone: ["phone number not in your business data", "phone numbers not in your business data"],
  output_unbacked_promise: ["unbacked discount/refund/guarantee promise", "unbacked discount/refund/guarantee promises"],
  write_tool_cap: ["repeated booking/callback request stopped", "repeated booking/callback requests stopped"],
};

/** "2 prompt-injection attempts, 1 abusive message" from a list of recorded signal names; empty when nothing was flagged. */
export function describeGuardrailFlags(signals: string[]): string[] {
  const merged = new Map<string, { count: number; label: [string, string] }>();
  for (const signal of signals) {
    const label = FLAG_LABELS[signal];
    if (!label) continue;
    const key = label[0];
    const entry = merged.get(key) ?? { count: 0, label };
    entry.count += 1;
    merged.set(key, entry);
  }
  return [...merged.values()].map(({ count, label }) => `${count} ${count === 1 ? label[0] : label[1]}`);
}
