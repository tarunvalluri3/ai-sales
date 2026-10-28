import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Phase 33 Stop 3 (docs/phases.md): /apache Analytics page reads. Every
 * query here reads ONLY `analytics_daily_rollups` (lib/analytics-rollup.ts)
 * or a handful of `businesses`/`subscriptions` totals -- never aggregates
 * raw conversations/leads/appointments live across every tenant (AGENTS.md
 * §9's "no unbounded selects", at platform scale).
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDateStr(daysAgo: number): string {
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const d = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate() - daysAgo));
  return d.toISOString().slice(0, 10);
}

export type ActiveTenantCounts = { dau: number; wau: number; mau: number };

export async function getActiveTenantCounts(): Promise<ActiveTenantCounts> {
  const supabase = createAdminSupabaseClient();
  const [dauRows, wauRows, mauRows] = await Promise.all([
    supabase.from("analytics_daily_rollups").select("business_id").eq("was_active", true).gte("rollup_date", istDateStr(1)),
    supabase.from("analytics_daily_rollups").select("business_id").eq("was_active", true).gte("rollup_date", istDateStr(7)),
    supabase.from("analytics_daily_rollups").select("business_id").eq("was_active", true).gte("rollup_date", istDateStr(30)),
  ]);

  return {
    dau: new Set((dauRows.data ?? []).map((r) => r.business_id)).size,
    wau: new Set((wauRows.data ?? []).map((r) => r.business_id)).size,
    mau: new Set((mauRows.data ?? []).map((r) => r.business_id)).size,
  };
}

export type ActivationFunnel = {
  signedUp: number;
  published: number;
  hadConversation: number;
  hadLead: number;
  paying: number;
};

/**
 * An all-time cumulative funnel (not cohort/time-windowed): of every
 * tenant that ever signed up, how many made it through each stage. Each
 * stage query is independent and real -- no stage is inferred or
 * back-filled from another.
 */
export async function getActivationFunnel(): Promise<ActivationFunnel> {
  const supabase = createAdminSupabaseClient();

  const [signedUp, published, activeRollupBusinesses, leadRollupBusinesses, paying] = await Promise.all([
    supabase.from("businesses").select("id", { count: "exact", head: true }),
    supabase.from("businesses").select("id", { count: "exact", head: true }).not("published_at", "is", null),
    supabase.from("analytics_daily_rollups").select("business_id").gt("conversations_count", 0),
    supabase.from("analytics_daily_rollups").select("business_id").gt("leads_count", 0),
    supabase.from("subscriptions").select("business_id", { count: "exact", head: true }).in("status", ["active", "past_due"]),
  ]);

  return {
    signedUp: signedUp.count ?? 0,
    published: published.count ?? 0,
    hadConversation: new Set((activeRollupBusinesses.data ?? []).map((r) => r.business_id)).size,
    hadLead: new Set((leadRollupBusinesses.data ?? []).map((r) => r.business_id)).size,
    paying: paying.count ?? 0,
  };
}

export type ChannelMix = { website: number; whatsapp: number; instagram: number };

export async function getChannelMix(windowDays: number): Promise<ChannelMix> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("analytics_daily_rollups")
    .select("channel_website_count, channel_whatsapp_count, channel_instagram_count")
    .gte("rollup_date", istDateStr(windowDays));

  if (error || !data) return { website: 0, whatsapp: 0, instagram: 0 };

  return data.reduce(
    (acc, row) => ({
      website: acc.website + row.channel_website_count,
      whatsapp: acc.whatsapp + row.channel_whatsapp_count,
      instagram: acc.instagram + row.channel_instagram_count,
    }),
    { website: 0, whatsapp: 0, instagram: 0 },
  );
}

export type ConversionRate = { leads: number; appointments: number; ratePercent: number | null };

export async function getLeadToAppointmentConversion(windowDays: number): Promise<ConversionRate> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("analytics_daily_rollups")
    .select("leads_count, appointments_count")
    .gte("rollup_date", istDateStr(windowDays));

  if (error || !data) return { leads: 0, appointments: 0, ratePercent: null };

  const leads = data.reduce((sum, r) => sum + r.leads_count, 0);
  const appointments = data.reduce((sum, r) => sum + r.appointments_count, 0);
  return { leads, appointments, ratePercent: leads > 0 ? (appointments / leads) * 100 : null };
}

export type PeriodTotals = { conversations: number; leads: number; appointments: number };
export type PeriodComparison = { current: PeriodTotals; previous: PeriodTotals };

async function sumRollupsInRange(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  startDateStr: string,
  endDateStr: string,
): Promise<PeriodTotals> {
  const { data, error } = await supabase
    .from("analytics_daily_rollups")
    .select("conversations_count, leads_count, appointments_count")
    .gte("rollup_date", startDateStr)
    .lt("rollup_date", endDateStr);

  if (error || !data) return { conversations: 0, leads: 0, appointments: 0 };
  return data.reduce(
    (acc, r) => ({
      conversations: acc.conversations + r.conversations_count,
      leads: acc.leads + r.leads_count,
      appointments: acc.appointments + r.appointments_count,
    }),
    { conversations: 0, leads: 0, appointments: 0 },
  );
}

/** Current window vs. the immediately preceding equal-length window -- the date-range comparison the approved brief asks for on every chart. */
export async function getPeriodComparison(windowDays: number): Promise<PeriodComparison> {
  const supabase = createAdminSupabaseClient();
  const todayStr = istDateStr(0);
  const windowStartStr = istDateStr(windowDays);
  const prevWindowStartStr = istDateStr(windowDays * 2);

  const [current, previous] = await Promise.all([
    sumRollupsInRange(supabase, windowStartStr, todayStr),
    sumRollupsInRange(supabase, prevWindowStartStr, windowStartStr),
  ]);
  return { current, previous };
}

export type DailyTrendPoint = { date: string; conversations: number; leads: number; appointments: number };

export async function getDailyTrend(windowDays: number): Promise<DailyTrendPoint[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("analytics_daily_rollups")
    .select("rollup_date, conversations_count, leads_count, appointments_count")
    .gte("rollup_date", istDateStr(windowDays))
    .order("rollup_date", { ascending: true });

  if (error || !data) return [];

  const byDate = new Map<string, DailyTrendPoint>();
  for (const row of data) {
    const existing = byDate.get(row.rollup_date) ?? { date: row.rollup_date, conversations: 0, leads: 0, appointments: 0 };
    existing.conversations += row.conversations_count;
    existing.leads += row.leads_count;
    existing.appointments += row.appointments_count;
    byDate.set(row.rollup_date, existing);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
