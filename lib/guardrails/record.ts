import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";
import type { GuardrailSignal } from "@/lib/guardrails/prepare-message";

export type GuardrailChannel = "chat_widget" | "whatsapp" | "instagram" | "sandbox";

/**
 * Logs each signal as a structured `guardrail_signal` event and persists it to
 * `guardrail_events` (the log alone is not enough -- see that migration).
 * Metadata only, never message text. `businessId` must already be a trusted
 * value (widget auth / webhook lookup / Clerk session).
 *
 * Meant to run inside `after()`, off the prospect's critical path. Never
 * throws and never fails the caller: a recording failure is itself logged.
 */
export async function recordGuardrailSignals(
  businessId: string,
  conversationId: string | null,
  channel: GuardrailChannel,
  signals: GuardrailSignal[],
): Promise<void> {
  if (signals.length === 0) return;

  for (const signal of signals) {
    logEvent("guardrail_signal", businessId, {
      type: signal.type,
      rule: signal.rule,
      action: signal.action,
      mode: signal.mode,
      channel,
    });
  }

  try {
    // Service role: this runs on unauthenticated paths. business_id is set
    // explicitly from the trusted argument -- it is the tenant boundary here.
    const supabase = createServiceSupabaseClient();
    const { error } = await supabase.from("guardrail_events").insert(
      signals.map((signal) => ({
        business_id: businessId,
        conversation_id: conversationId,
        channel,
        signal: signal.type,
        rule: signal.rule,
        action: signal.action,
        mode: signal.mode,
      })),
    );
    if (error) logEvent("guardrail_event_write_failed", businessId, { code: error.code ?? "unknown" }, "error");
  } catch {
    logEvent("guardrail_event_write_failed", businessId, { code: "exception" }, "error");
  }
}
