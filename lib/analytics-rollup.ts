import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { SANDBOX_CONVERSATION_SOURCE } from "@/lib/conversations";
import { logEvent } from "@/lib/logger";

/**
 * Phase 33 Stop 3 (docs/phases.md): computes one `analytics_daily_rollups`
 * row per business for a given IST calendar day, from the SAME tables the
 * rest of the product already writes (conversations/leads/appointments) --
 * not from a separate event stream, so there is nothing new to keep in
 * sync. Runs from the existing shared cron route
 * (app/api/cron/process-ingestion-queue/route.ts), once a day, computing
 * YESTERDAY's (IST) rollup -- not today's, which is still in progress when
 * the cron fires. Upserts, so a re-run (a retried cron invocation) is
 * idempotent rather than double-counting.
 *
 * Uses the service-role client, same as every other sweep this cron route
 * already runs (lib/sla-routing.ts, lib/notifications.ts) -- a trusted
 * system process, not a platform-admin action, so this deliberately does
 * NOT use lib/supabase/admin.ts (reserved for requirePlatformAdmin()-gated
 * /apache code).
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const EXCLUDE_SANDBOX_FILTER = `source.is.null,source.neq.${SANDBOX_CONVERSATION_SOURCE}`;

/** [startUtc, endUtc) for the IST calendar day `daysAgo` days before today. */
function istDayRangeUtc(daysAgo: number): { startIso: string; endIso: string; dateStr: string } {
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const y = nowIst.getUTCFullYear();
  const m = nowIst.getUTCMonth();
  const d = nowIst.getUTCDate() - daysAgo;
  const startUtcMs = Date.UTC(y, m, d) - IST_OFFSET_MS;
  const endUtcMs = Date.UTC(y, m, d + 1) - IST_OFFSET_MS;
  const dateStr = new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  return { startIso: new Date(startUtcMs).toISOString(), endIso: new Date(endUtcMs).toISOString(), dateStr };
}

function channelFromSource(source: string | null): "website" | "whatsapp" | "instagram" {
  if (source === "whatsapp") return "whatsapp";
  if (source === "instagram") return "instagram";
  return "website";
}

export type RollupResult = { date: string; businessesRolledUp: number } | null;

/** Computes and upserts yesterday's (IST) rollup for every business. Never throws -- a rollup failure must not break the shared cron route's other sweeps. */
export async function computeDailyRollup(): Promise<RollupResult> {
  const { startIso, endIso, dateStr } = istDayRangeUtc(1);
  const supabase = createServiceSupabaseClient();

  try {
    const { data: businesses, error: businessesError } = await supabase.from("businesses").select("id");
    if (businessesError || !businesses) throw businessesError ?? new Error("no businesses");

    const [conversationsResult, leadsResult, appointmentsResult] = await Promise.all([
      supabase.from("conversations").select("business_id, source").gte("created_at", startIso).lt("created_at", endIso).or(EXCLUDE_SANDBOX_FILTER),
      supabase.from("leads").select("business_id").gte("created_at", startIso).lt("created_at", endIso),
      supabase.from("appointments").select("business_id").gte("created_at", startIso).lt("created_at", endIso),
    ]);

    type Tally = { conversations: number; leads: number; appointments: number; website: number; whatsapp: number; instagram: number };
    const tallies = new Map<string, Tally>();
    function getTally(businessId: string): Tally {
      let t = tallies.get(businessId);
      if (!t) {
        t = { conversations: 0, leads: 0, appointments: 0, website: 0, whatsapp: 0, instagram: 0 };
        tallies.set(businessId, t);
      }
      return t;
    }

    for (const row of conversationsResult.data ?? []) {
      const t = getTally(row.business_id);
      t.conversations += 1;
      t[channelFromSource(row.source)] += 1;
    }
    for (const row of leadsResult.data ?? []) {
      getTally(row.business_id).leads += 1;
    }
    for (const row of appointmentsResult.data ?? []) {
      getTally(row.business_id).appointments += 1;
    }

    const rows = businesses.map((b) => {
      const t = tallies.get(b.id);
      return {
        business_id: b.id,
        rollup_date: dateStr,
        conversations_count: t?.conversations ?? 0,
        leads_count: t?.leads ?? 0,
        appointments_count: t?.appointments ?? 0,
        channel_website_count: t?.website ?? 0,
        channel_whatsapp_count: t?.whatsapp ?? 0,
        channel_instagram_count: t?.instagram ?? 0,
        was_active: (t?.conversations ?? 0) > 0,
      };
    });

    if (rows.length > 0) {
      const { error: upsertError } = await supabase.from("analytics_daily_rollups").upsert(rows, { onConflict: "business_id,rollup_date" });
      if (upsertError) throw upsertError;
    }

    return { date: dateStr, businessesRolledUp: rows.length };
  } catch {
    logEvent("analytics_rollup_failed", "unknown", { date: dateStr }, "error");
    return null;
  }
}
