import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type RateLimitScope = "ip" | "key" | "conversation";

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
    // limiting.
    console.error("checkAndIncrementRateLimit failed", error);
    return false;
  }

  return (data as number) <= limit;
}
