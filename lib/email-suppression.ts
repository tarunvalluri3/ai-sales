import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";

/**
 * The global do-not-send list, fed by Resend's bounce/complaint webhook
 * (app/api/webhooks/resend/route.ts).
 *
 * **Why this is global and not tenant-scoped**, unlike every other table in
 * this app: an address that hard-bounced or reported spam is bad for the
 * *sending domain*, which is shared by every tenant. Scoping suppression
 * per business would let business B keep mailing an address business A
 * already burned, and the reputation damage would land on the one domain
 * both of them send through. `email_suppressions` therefore has RLS on and
 * no policies at all -- it is reachable only by the service-role client,
 * and no tenant can read it (it holds other businesses' prospect
 * addresses, so tenant-readable would itself be a leak).
 *
 * This matters more here than for most products: the stalled-lead
 * follow-up mails prospect addresses an AI captured from live chat, typos
 * and throwaways included, and every one of those sends carries the
 * proprietor's own business domain.
 */

export type SuppressionReason = "hard_bounce" | "complaint";

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Whether this address must not be mailed.
 *
 * **Fails open**, deliberately, matching this codebase's standing
 * degrade-safely convention: a transient Supabase error here would
 * otherwise silence every email in the run. One bad send to a burned
 * address costs less than a day of total email loss, and the error is
 * logged at `error` level so Sentry surfaces it rather than it passing
 * unnoticed.
 */
export async function isEmailSuppressed(email: string): Promise<boolean> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("email_suppressions")
    .select("email")
    .eq("email", normalize(email))
    .maybeSingle();

  if (error) {
    logEvent("email_suppression_lookup_failed", "unknown", {}, "error");
    return false;
  }

  return Boolean(data);
}

/**
 * Records a hard bounce or spam complaint. Idempotent -- the webhook can
 * legitimately deliver the same event twice, so a repeat upsert must not
 * error. `detail` is Resend's own short reason string; never a message
 * body.
 */
export async function recordEmailSuppression(
  email: string,
  reason: SuppressionReason,
  detail: string | null,
): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("email_suppressions")
    .upsert({ email: normalize(email), reason, detail }, { onConflict: "email" });

  if (error) {
    logEvent("email_suppression_write_failed", "unknown", { reason }, "error");
    return;
  }

  logEvent("email_suppressed", "unknown", { reason });
}
