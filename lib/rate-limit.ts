import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";

export type RateLimitScope =
  | "ip"
  | "key"
  | "conversation"
  | "poll_ip"
  | "poll_conversation"
  | "restore_ip"
  | "recent_chats_ip";

/**
 * Atomically increments the fixed-window counter for (scope, identifier)
 * via public.increment_rate_limit_counter() and returns whether this
 * request is still within `limit`. Always increments, even when the
 * result is over the limit -- a retry can't reset the count for the
 * current window. See docs/security.md §4 (rate limiting per key/IP/
 * conversation) and STATE.md §4's resolved D4.
 */
export async function checkAndIncrementRateLimit(
  scope: RateLimitScope,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("increment_rate_limit_counter", {
    p_scope: scope,
    p_identifier: identifier,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    // Fail closed: an infra error here should not silently disable rate
    // limiting. businessId is not yet known at this layer, and the raw
    // identifier (ip/widgetKey/conversationId) is deliberately never
    // logged here -- same "never log a raw IP" precedent as
    // app/api/chat/route.ts's ip-scope 429 logging (Phase 19b,
    // docs/phase-19-audit-findings.md §6/§12).
    logEvent("rate_limit_check_failed", "unknown", { scope }, "error");
    return false;
  }

  return (data as number) <= limit;
}
