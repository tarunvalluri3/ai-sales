import "server-only";
import crypto from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { WebhookEndpoint } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/** Lists every webhook endpoint for a business. `businessId` must come from `requireBusinessContext()`. Secrets are included -- only ever readable by the business's own authenticated staff, same trust class as the widget key. */
export async function listWebhookEndpointsForBusiness(businessId: string): Promise<WebhookEndpoint[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new AppError(
      "Something went wrong loading your webhook endpoints. Please try again.",
      "listWebhookEndpointsForBusiness failed",
      error,
    );
  }

  return data;
}

/** Creates a webhook endpoint with a freshly generated signing secret. */
export async function createWebhookEndpoint(businessId: string, url: string): Promise<WebhookEndpoint> {
  const supabase = createServerSupabaseClient();
  const secret = crypto.randomBytes(32).toString("hex");

  const { data, error } = await supabase
    .from("webhook_endpoints")
    .insert({ business_id: businessId, url, secret })
    .select()
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong creating this webhook endpoint. Please try again.",
      "createWebhookEndpoint failed",
      error,
    );
  }

  return data;
}

/** Deletes a webhook endpoint, scoped to the given business. Cascades to any pending deliveries for it. Returns `false` for a cross-tenant or nonexistent id. */
export async function deleteWebhookEndpoint(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .delete()
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong deleting this webhook endpoint. Please try again.",
      "deleteWebhookEndpoint failed",
      error,
    );
  }

  return data.length > 0;
}

export type LeadQualifiedPayload = {
  event: "lead.qualified";
  leadId: string;
  conversationId: string;
  qualification: string;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
};

/**
 * Enqueues a delivery for every active endpoint a business has
 * configured, for a newly created qualified lead (Phase 24). Called
 * with the service-role client -- the only caller today,
 * lib/tools/request-callback.ts's executeRequestCallback, runs on the
 * public widget's service-role path with no Clerk session. A business
 * with zero endpoints (the common case today) enqueues nothing --
 * not an error, just nothing to deliver.
 */
export async function enqueueLeadQualifiedWebhooks(
  supabase: ServiceSupabaseClient,
  businessId: string,
  payload: LeadQualifiedPayload,
): Promise<void> {
  const { data: endpoints, error: endpointsError } = await supabase
    .from("webhook_endpoints")
    .select("id")
    .eq("business_id", businessId)
    .eq("status", "active");

  if (endpointsError || !endpoints || endpoints.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from("webhook_deliveries").insert(
    endpoints.map((endpoint) => ({
      business_id: businessId,
      endpoint_id: endpoint.id,
      event_type: "lead.qualified" as const,
      payload,
    })),
  );

  if (insertError) {
    console.error(
      JSON.stringify({
        event: "webhook_delivery_enqueue_failed",
        businessId,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
