import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email-sender";
import { renderBrandedEmail } from "@/lib/email-template";
import { getAppUrl } from "@/lib/app-url";
import { logEvent } from "@/lib/logger";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Tells a business owner that a channel integration stopped working
 * (production readiness, item 7). Emailed to the business's contact address;
 * the dashboard's channel page shows the same state ("Reconnect"). Callers
 * send this only on the transition (connected -> disconnected), never on
 * every failed send. Never throws.
 */
export async function alertOwnerIntegrationDisconnected(
  supabase: ServiceSupabaseClient,
  businessId: string,
  integration: "instagram",
  reason: "token_revoked" | "subscription_missing",
): Promise<void> {
  try {
    const { data: business } = await supabase
      .from("businesses")
      .select("name, contact_email")
      .eq("id", businessId)
      .maybeSingle<{ name: string; contact_email: string | null }>();
    if (!business?.contact_email) {
      logEvent("integration_alert_no_contact_email", businessId, { integration, reason });
      return;
    }
    const paragraphs =
      reason === "token_revoked"
        ? [
            "Meta told us our access to your Instagram account was removed or expired, so your AI assistant can no longer read or answer Instagram messages.",
            "Reconnect Instagram from your dashboard to start answering again. Messages that arrive in the meantime are not answered.",
          ]
        : [
            "Your Facebook Page stopped sending us Instagram messages (our app's subscription to the Page was removed), and we couldn't restore it automatically.",
            "Reconnect Instagram from your dashboard to start answering again.",
          ];
    await sendEmail({
      to: business.contact_email,
      subject: `Action needed: reconnect Instagram for ${business.name}`,
      email: renderBrandedEmail({
        heading: "Instagram is disconnected",
        paragraphs,
        cta: { label: "Reconnect Instagram", url: `${getAppUrl()}/dashboard/instagram` },
      }),
    });
    logEvent("integration_alert_sent", businessId, { integration, reason });
  } catch {
    logEvent("integration_alert_failed", businessId, { integration, reason }, "error");
  }
}
