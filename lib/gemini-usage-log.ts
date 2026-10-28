import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";

/**
 * Per-raw-API-call Gemini usage log (token-burn audit, 2026-10-28). This is
 * deliberately a separate table from `ai_response_metrics`
 * (lib/ai-response-metrics.ts): that table is one row per successful
 * `askSalesEmployee()`/`streamSalesEmployee()` *turn*, has NOT NULL
 * `business_id`/`conversation_id` foreign keys, and `lib/analytics.ts` and
 * `lib/usage-limit.ts` already depend on "one row = one billable reply" --
 * widening it to "one row per raw Gemini call" (a turn can be 1-5 calls:
 * the tool loop, the concurrent streaming metadata call, embeddings) or
 * making its FKs nullable (for cron sweeps, scripts and embedding calls
 * that have no conversation) would silently change what every existing
 * reader of that table means. This table's grain is "one row per Gemini
 * API call, from anywhere" -- chat, embeddings, knowledge extraction,
 * summaries, cron sweeps, dev scripts included -- which is a different
 * question (where do tokens actually go) from what `ai_response_metrics`
 * answers (how is a business's own usage trending). The two coexist; this
 * one is not read by any tenant-facing dashboard.
 */

export type GeminiUsageTrigger =
  | "user"
  | "webhook_whatsapp"
  | "webhook_instagram"
  | "widget"
  | "dashboard"
  | "cron"
  | "script";

export type GeminiUsageEnvironment = "development" | "preview" | "production";

export type GeminiUsageEntry = {
  /** Short tag naming the call site, e.g. "chat_json", "chat_stream", "embed_query". Open-ended -- not a DB enum, so a new feature never needs a migration. */
  feature: string;
  trigger: GeminiUsageTrigger;
  model: string;
  durationMs: number;
  success: boolean;
  /** Truncated to 500 chars before insert. Never the prospect's message or any secret -- just the SDK's own error text. */
  errorMessage?: string | null;
  businessId?: string | null;
  conversationId?: string | null;
  /** Free-form correlation id (e.g. the streaming request id) when there's no conversation row to key on. */
  requestId?: string | null;
  promptTokens?: number | null;
  candidatesTokens?: number | null;
  thoughtsTokens?: number | null;
  cachedContentTokens?: number | null;
  totalTokens?: number | null;
};

function resolveEnvironment(): GeminiUsageEnvironment {
  // Vercel sets VERCEL_ENV to exactly one of these on every deploy
  // (https://vercel.com/docs/environment-variables/system-environment-variables).
  // Falls back to "development" for local runs and scripts, where it is unset.
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production" || vercelEnv === "preview" || vercelEnv === "development") {
    return vercelEnv;
  }
  return "development";
}

/**
 * Fire-and-forget insert into `public.gemini_api_calls`. Never awaited by
 * the caller and never throws -- a logging failure must never affect a
 * real Gemini call's result, latency, or error handling (same contract as
 * `lib/logger.ts`'s `logEvent` and `lib/ai-response-metrics.ts`'s writes).
 */
export function recordGeminiUsage(entry: GeminiUsageEntry): void {
  const row = {
    feature: entry.feature,
    trigger: entry.trigger,
    environment: resolveEnvironment(),
    model: entry.model,
    prompt_tokens: entry.promptTokens ?? null,
    candidates_tokens: entry.candidatesTokens ?? null,
    thoughts_tokens: entry.thoughtsTokens ?? null,
    cached_content_tokens: entry.cachedContentTokens ?? null,
    total_tokens: entry.totalTokens ?? null,
    duration_ms: entry.durationMs,
    success: entry.success,
    error_message: entry.errorMessage ? entry.errorMessage.slice(0, 500) : null,
    business_id: entry.businessId ?? null,
    conversation_id: entry.conversationId ?? null,
    request_id: entry.requestId ?? null,
  };

  (async () => {
    try {
      const { error } = await createServiceSupabaseClient().from("gemini_api_calls").insert(row);
      if (error) {
        logEvent("gemini_usage_log_write_failed", entry.businessId ?? "unknown", { feature: entry.feature }, "error");
      }
    } catch {
      // Never throw from logging -- see this module's doc comment.
    }
  })();
}

/**
 * Times an async Gemini call and logs it via `recordGeminiUsage`, whatever
 * the outcome, then returns (or rethrows) exactly what `fn` did -- this
 * wrapper changes no caller's control flow. `extractUsage` reads the
 * SDK-specific token fields off a successful result; on failure no usage
 * is known, only duration and the error message.
 *
 * Not used for the streaming tool-calling loop in lib/rag.ts: that loop
 * consumes an async generator chunk-by-chunk and yields to its own caller
 * mid-call, which this wrapper's single await cannot express. That call
 * site logs via `recordGeminiUsage` directly instead, right next to the
 * `timer.record()` call it already makes for the same reason.
 */
export async function withGeminiUsageLog<T>(
  base: Pick<GeminiUsageEntry, "feature" | "trigger" | "model" | "businessId" | "conversationId" | "requestId">,
  fn: () => Promise<T>,
  extractUsage: (
    result: T,
  ) => Partial<Pick<GeminiUsageEntry, "promptTokens" | "candidatesTokens" | "thoughtsTokens" | "cachedContentTokens" | "totalTokens">>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    recordGeminiUsage({ ...base, ...extractUsage(result), durationMs: Date.now() - start, success: true });
    return result;
  } catch (error) {
    recordGeminiUsage({
      ...base,
      durationMs: Date.now() - start,
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
