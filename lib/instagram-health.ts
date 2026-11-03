import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { graphRequest } from "@/lib/meta-graph";
import { getInstagramAccessToken, markInstagramConnectionRevoked } from "@/lib/instagram";
import { alertOwnerIntegrationDisconnected } from "@/lib/integration-alerts";
import { PAGE_SUBSCRIBED_FIELDS } from "@/lib/meta-instagram-rules";
import { judgeHealthProbe, type HealthProbe } from "@/lib/instagram-health-rules";
import { logEvent } from "@/lib/logger";

/**
 * Instagram connection health check (production readiness, item 7), run by
 * the scheduler every 6 hours. For every connected account:
 *  - Facebook Login: GET /<PAGE_ID>/subscribed_apps with the stored Page
 *    token. That one call proves the token still works AND that our app is
 *    still subscribed to the Page (without it Meta silently stops delivering
 *    Instagram DMs). A missing subscription is restored with the same
 *    `subscribed_fields=feed` call the connect flow makes.
 *  - Unified Login: GET /<IG_ID>?fields=id with the system-user token.
 *  - A revoked token -> the connection is marked disconnected and the owner
 *    emailed (once), before the next prospect message goes unanswered.
 *  - Network/5xx/throttling -> nothing changes; the next run retries.
 * Tokens are only ever sent in the Authorization header and never logged.
 */

const MAX_PER_RUN = 100;

type ConnectionRow = {
  business_id: string;
  login_mode: "facebook" | "unified";
  facebook_page_id: string | null;
  instagram_business_account_id: string;
};

export type InstagramHealthResult = {
  checked: number;
  healthy: number;
  resubscribed: number;
  revoked: number;
  transient: number;
  errors: number;
};

export async function runInstagramConnectionHealthCheck(): Promise<InstagramHealthResult> {
  const supabase = createServiceSupabaseClient();
  const result: InstagramHealthResult = { checked: 0, healthy: 0, resubscribed: 0, revoked: 0, transient: 0, errors: 0 };
  const appId = process.env.META_APP_ID;

  const { data, error } = await supabase
    .from("instagram_connections")
    .select("business_id, login_mode, facebook_page_id, instagram_business_account_id")
    .eq("status", "connected")
    .order("last_verified_at", { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN);
  if (error) {
    logEvent("instagram_health_read_failed", "unknown", {}, "error");
    return result;
  }

  for (const connection of (data ?? []) as ConnectionRow[]) {
    result.checked++;
    try {
      const token = await getInstagramAccessToken(supabase, connection.business_id);
      if (!token) {
        // Connected but no usable token (deleted, or undecryptable after a key change).
        await markInstagramConnectionRevoked(supabase, connection.business_id);
        result.revoked++;
        continue;
      }

      const facebook = connection.login_mode === "facebook" && connection.facebook_page_id;
      const probe: HealthProbe = facebook
        ? await graphRequest("GET", `/${connection.facebook_page_id}/subscribed_apps`, { token })
        : await graphRequest("GET", `/${connection.instagram_business_account_id}`, { token, query: { fields: "id" } });
      const verdict = judgeHealthProbe(probe, { checkSubscription: Boolean(facebook), appId });

      if (verdict === "revoked") {
        await markInstagramConnectionRevoked(supabase, connection.business_id);
        result.revoked++;
        continue;
      }
      if (verdict === "transient") {
        result.transient++;
        continue;
      }
      if (verdict === "error") {
        result.errors++;
        logEvent(
          "instagram_health_check_error",
          connection.business_id,
          { status: probe.ok ? 200 : probe.status, metaCode: probe.ok ? null : (probe.error?.code ?? null) },
          "error",
        );
        continue;
      }
      if (verdict === "resubscribe") {
        const subscribed = await graphRequest("POST", `/${connection.facebook_page_id}/subscribed_apps`, {
          token,
          form: { subscribed_fields: PAGE_SUBSCRIBED_FIELDS.join(",") },
        });
        if (!subscribed.ok) {
          result.errors++;
          logEvent("instagram_page_subscription_missing", connection.business_id, { status: subscribed.status }, "error");
          await supabase
            .from("instagram_connections")
            .update({ last_error: "subscription_missing", updated_at: new Date().toISOString() })
            .eq("business_id", connection.business_id);
          await alertOwnerIntegrationDisconnected(supabase, connection.business_id, "instagram", "subscription_missing");
          continue;
        }
        result.resubscribed++;
        logEvent("instagram_page_resubscribed", connection.business_id, { pageId: connection.facebook_page_id });
      } else {
        result.healthy++;
      }

      await supabase
        .from("instagram_connections")
        .update({ last_verified_at: new Date().toISOString(), last_error: null })
        .eq("business_id", connection.business_id)
        .eq("status", "connected");
    } catch {
      result.errors++;
      logEvent("instagram_health_check_failed", connection.business_id, {}, "error");
    }
  }
  return result;
}
