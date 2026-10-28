import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { createServiceSupabaseClient } from "@/lib/supabase/service";

/**
 * Phase 33 Stop 3 (docs/phases.md): the first-party event-tracking helper
 * for public.analytics_events (20261104000000). Deliberately a SMALL,
 * explicit set of event names -- this is not a generic "track anything"
 * SDK. Most of the Analytics page's numbers (DAU/MAU, activation funnel,
 * channel mix, conversion) are computed directly from
 * conversations/leads/appointments/subscriptions' own timestamps by
 * lib/analytics-rollup.ts, NOT from events -- track() is reserved for
 * signals that genuinely have no other record (which onboarding step a
 * signup is on, a first publish).
 *
 * Fire-and-forget, same contract as lib/logger.ts's logEvent() and
 * lib/gemini-usage-log.ts's recordGeminiUsage() -- a tracking failure must
 * never affect the caller's own request. Takes the caller's OWN Supabase
 * client (Clerk-session for a dashboard action, service-role for a
 * webhook/cron context) rather than creating its own, matching
 * lib/analytics.ts's existing convention -- this keeps a dashboard-fired
 * event correctly scoped by the INSERT policy's own-business check.
 */

export type AnalyticsEventName =
  | "business.signed_up"
  | "business.first_published";

type AnySupabaseClient = ReturnType<typeof createServerSupabaseClient> | ReturnType<typeof createServiceSupabaseClient>;

export function track(
  supabase: AnySupabaseClient,
  businessId: string,
  eventName: AnalyticsEventName,
  properties?: Record<string, string | number | boolean | null>,
): void {
  void supabase
    .from("analytics_events")
    .insert({ business_id: businessId, event_name: eventName, properties: properties ?? null })
    .then(({ error }) => {
      if (error) {
        console.error(
          JSON.stringify({ event: "analytics_track_failed", businessId, eventName, timestamp: new Date().toISOString() }),
        );
      }
    });
}
