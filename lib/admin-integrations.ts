import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/** Phase 33 Stop 4 (docs/phases.md): cross-tenant integration status for /apache/integrations. */

export type IntegrationRow = {
  businessId: string;
  businessName: string;
  contactEmail: string | null;
  channel: "whatsapp" | "instagram";
  status: string;
  lastVerifiedAt: string | null;
  lastError: string | null;
  tokenExpiresAt: string | null;
};

export async function listIntegrations(): Promise<IntegrationRow[]> {
  const supabase = createAdminSupabaseClient();
  const { data: businesses } = await supabase.from("businesses").select("id, name, contact_email");
  const businessById = new Map((businesses ?? []).map((b) => [b.id, b]));

  const [whatsapp, instagram] = await Promise.all([
    supabase.from("whatsapp_connections").select("business_id, status, last_verified_at, last_error"),
    supabase.from("instagram_connections").select("business_id, status, last_verified_at, last_error, token_expires_at"),
  ]);

  const rows: IntegrationRow[] = [];
  for (const row of whatsapp.data ?? []) {
    const business = businessById.get(row.business_id);
    rows.push({
      businessId: row.business_id,
      businessName: business?.name ?? "Unknown",
      contactEmail: business?.contact_email ?? null,
      channel: "whatsapp",
      status: row.status,
      lastVerifiedAt: row.last_verified_at,
      lastError: row.last_error,
      tokenExpiresAt: null,
    });
  }
  for (const row of instagram.data ?? []) {
    const business = businessById.get(row.business_id);
    rows.push({
      businessId: row.business_id,
      businessName: business?.name ?? "Unknown",
      contactEmail: business?.contact_email ?? null,
      channel: "instagram",
      status: row.status,
      lastVerifiedAt: row.last_verified_at,
      lastError: row.last_error,
      tokenExpiresAt: row.token_expires_at,
    });
  }

  return rows.sort((a, b) => a.businessName.localeCompare(b.businessName));
}

export function isBroken(row: IntegrationRow): boolean {
  return row.status === "error" || row.status === "disconnected";
}
