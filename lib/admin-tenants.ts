import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { PLANS, type PlanKey } from "@/lib/plans";
import type { SubscriptionStatus } from "@/lib/subscription";
import type { Business, PlatformAdminNote } from "@/lib/supabase/types";

/**
 * Phase 33 Stop 2 (docs/phases.md): cross-tenant tenant list/detail reads
 * for the /apache Tenants pages. Every function here must only be called
 * from code already behind requirePlatformAdmin() -- there is no RLS
 * backstop (createAdminSupabaseClient() bypasses it entirely).
 *
 * Deliberately NOT true server-side cursor pagination (AGENTS.md's "all
 * lists paginated server-side" ideal) -- this follows the SAME pattern
 * every existing dashboard list page in this codebase already uses
 * (app/(dashboard)/dashboard/customers, /leads, /products): fetch a
 * bounded, filtered set server-side, hand it to the existing client-side
 * DataTable component (app/(dashboard)/dashboard/_components/data-table.tsx)
 * for sort/paginate. True cursor pagination is deferred until tenant count
 * actually requires it -- see STATE.md.
 */

const TENANT_LIST_LIMIT = 500;

export type TenantListRow = {
  id: string;
  name: string;
  businessType: string;
  contactEmail: string | null;
  contactPhone: string | null;
  clerkOrgId: string;
  status: Business["status"];
  deletedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  planKey: PlanKey | null;
  planName: string | null;
  subscriptionStatus: SubscriptionStatus | null;
};

export type TenantListFilters = {
  search?: string;
  planKey?: PlanKey;
  status?: Business["status"];
  subscriptionStatus?: SubscriptionStatus;
};

/** For the plan/status filter dropdowns and the CSV export header. */
export const TENANT_STATUS_VALUES: Business["status"][] = ["active", "suspended"];

export async function listTenants(filters: TenantListFilters = {}): Promise<TenantListRow[]> {
  const supabase = createAdminSupabaseClient();

  let query = supabase
    .from("businesses")
    .select("id, name, business_type, contact_email, contact_phone, clerk_org_id, status, deleted_at, published_at, created_at")
    .order("created_at", { ascending: false })
    .limit(TENANT_LIST_LIMIT);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.search) {
    // Searches tenant name, owner contact email/phone, and the raw tenant
    // id/Clerk org id -- the fields the approved brief's global search
    // names ("tenant name, owner email, phone, tenant ID"). Phone/email
    // are plaintext in `businesses` (unlike leads' masked-by-default PII --
    // this is the business's OWN declared contact info, not a prospect's).
    const term = `%${filters.search.replace(/[%_]/g, "")}%`;
    query = query.or(
      `name.ilike.${term},contact_email.ilike.${term},contact_phone.ilike.${term},id.eq.${isUuid(filters.search) ? filters.search : "00000000-0000-0000-0000-000000000000"},clerk_org_id.eq.${filters.search}`,
    );
  }

  const { data: businesses, error } = await query;
  if (error || !businesses) {
    console.error(JSON.stringify({ event: "admin_tenants_list_failed", timestamp: new Date().toISOString() }));
    return [];
  }

  const businessIds = businesses.map((b) => b.id);
  const subscriptionsByBusinessId = await getSubscriptionSummaries(supabase, businessIds);

  const rows: TenantListRow[] = businesses.map((b) => {
    const sub = subscriptionsByBusinessId.get(b.id);
    return {
      id: b.id,
      name: b.name,
      businessType: b.business_type,
      contactEmail: b.contact_email,
      contactPhone: b.contact_phone,
      clerkOrgId: b.clerk_org_id,
      status: b.status,
      deletedAt: b.deleted_at,
      publishedAt: b.published_at,
      createdAt: b.created_at,
      planKey: sub?.plan_key ?? null,
      planName: sub ? PLANS[sub.plan_key].name : null,
      subscriptionStatus: sub?.status ?? null,
    };
  });

  if (filters.planKey) {
    return rows.filter((r) => r.planKey === filters.planKey || (filters.planKey === "scale" && r.planKey === null));
  }
  if (filters.subscriptionStatus) {
    return rows.filter((r) => r.subscriptionStatus === filters.subscriptionStatus);
  }
  return rows;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

type SubscriptionSummary = { plan_key: PlanKey; status: SubscriptionStatus };

async function getSubscriptionSummaries(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  businessIds: string[],
): Promise<Map<string, SubscriptionSummary>> {
  const map = new Map<string, SubscriptionSummary>();
  if (businessIds.length === 0) return map;

  const { data, error } = await supabase
    .from("subscriptions")
    .select("business_id, plan_key, status")
    .in("business_id", businessIds);

  if (error || !data) return map;
  for (const row of data) {
    map.set(row.business_id, { plan_key: row.plan_key as PlanKey, status: row.status as SubscriptionStatus });
  }
  return map;
}

export type TenantDetail = {
  business: Business;
  subscription: {
    planKey: PlanKey;
    planName: string;
    status: SubscriptionStatus;
    trialEndsAt: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    replyQuotaOverride: number | null;
  } | null;
  usage: {
    conversationsTotal: number;
    leadsTotal: number;
    appointmentsTotal: number;
  };
  integrations: {
    whatsapp: { status: string; lastVerifiedAt: string | null; lastError: string | null; connectedAt: string | null } | null;
    instagram: { status: string; lastVerifiedAt: string | null; lastError: string | null; connectedAt: string | null } | null;
  };
  notes: PlatformAdminNote[];
};

export async function getTenantDetail(businessId: string): Promise<TenantDetail | null> {
  const supabase = createAdminSupabaseClient();

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle();

  if (businessError || !business) return null;

  const [subscriptionResult, conversationsCount, leadsCount, appointmentsCount, whatsappResult, instagramResult, notesResult] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select("plan_key, status, trial_ends_at, current_period_start, current_period_end, reply_quota_override")
        .eq("business_id", businessId)
        .maybeSingle(),
      supabase.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase
        .from("whatsapp_connections")
        .select("status, last_verified_at, last_error, connected_at")
        .eq("business_id", businessId)
        .maybeSingle(),
      supabase
        .from("instagram_connections")
        .select("status, last_verified_at, last_error, connected_at")
        .eq("business_id", businessId)
        .maybeSingle(),
      supabase
        .from("platform_admin_notes")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false }),
    ]);

  const sub = subscriptionResult.data;

  return {
    business,
    subscription: sub
      ? {
          planKey: sub.plan_key as PlanKey,
          planName: PLANS[sub.plan_key as PlanKey].name,
          status: sub.status as SubscriptionStatus,
          trialEndsAt: sub.trial_ends_at,
          currentPeriodStart: sub.current_period_start,
          currentPeriodEnd: sub.current_period_end,
          replyQuotaOverride: sub.reply_quota_override,
        }
      : null,
    usage: {
      conversationsTotal: conversationsCount.count ?? 0,
      leadsTotal: leadsCount.count ?? 0,
      appointmentsTotal: appointmentsCount.count ?? 0,
    },
    integrations: {
      whatsapp: whatsappResult.data
        ? {
            status: whatsappResult.data.status,
            lastVerifiedAt: whatsappResult.data.last_verified_at,
            lastError: whatsappResult.data.last_error,
            connectedAt: whatsappResult.data.connected_at,
          }
        : null,
      instagram: instagramResult.data
        ? {
            status: instagramResult.data.status,
            lastVerifiedAt: instagramResult.data.last_verified_at,
            lastError: instagramResult.data.last_error,
            connectedAt: instagramResult.data.connected_at,
          }
        : null,
    },
    notes: notesResult.data ?? [],
  };
}

/** CSV export for the Tenants list (approved brief: "CSV export"). Built server-side from the same rows the table renders, so the export always matches what's on screen. */
export function tenantsToCsv(rows: TenantListRow[]): string {
  const header = ["Name", "Business type", "Contact email", "Contact phone", "Status", "Plan", "Subscription status", "Signed up"];
  const lines = rows.map((r) =>
    [r.name, r.businessType, r.contactEmail ?? "", r.contactPhone ?? "", r.status, r.planName ?? "", r.subscriptionStatus ?? "", r.createdAt]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
