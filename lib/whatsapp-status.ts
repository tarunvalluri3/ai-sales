import "server-only";
import type { createServiceSupabaseClient } from "@/lib/supabase/service";
import { resolveBusinessFromWhatsappPhoneNumberId } from "@/lib/whatsapp";
import { flagConversationNeedsAttention } from "@/lib/conversations";
import { logEvent } from "@/lib/logger";
import { shouldApplyStatus, type WhatsappStatusUpdate } from "@/lib/whatsapp-rules";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Records Meta's status callbacks (sent / delivered / read / failed) on our
 * outbound rows (production readiness, item 4; LAUNCH_AUDIT.md §7 "status
 * callbacks are ignored"). A message Meta accepts can still fail later --
 * a template paused after approval, an undeliverable number -- and that
 * arrives only here. A `failed` status flags the conversation for the team
 * and logs an alertable event. The business is resolved from the payload's
 * phone_number_id, never from the message id alone, and every lookup is
 * scoped to that business.
 */
export async function recordWhatsappStatuses(
  supabase: ServiceSupabaseClient,
  phoneNumberId: string,
  updates: WhatsappStatusUpdate[],
): Promise<void> {
  if (updates.length === 0) return;
  const resolved = await resolveBusinessFromWhatsappPhoneNumberId(supabase, phoneNumberId);
  if (!resolved) return;
  const { businessId } = resolved;

  for (const update of updates) {
    const { data: row } = await supabase
      .from("whatsapp_outbound_messages")
      .select("id, conversation_id, delivery_status, template_kind")
      .eq("business_id", businessId)
      .eq("wa_message_id", update.waMessageId)
      .maybeSingle<{ id: string; conversation_id: string; delivery_status: WhatsappStatusUpdate["status"] | null; template_kind: string | null }>();
    // Not one of ours (e.g. sent from the WhatsApp Business app directly).
    if (!row || !shouldApplyStatus(row.delivery_status, update.status)) continue;

    const at = new Date(update.timestampMs ?? Date.now()).toISOString();
    const patch: Record<string, unknown> = { delivery_status: update.status, updated_at: new Date().toISOString() };
    if (update.status === "delivered") patch.delivered_at = at;
    if (update.status === "read") patch.read_at = at;
    if (update.status === "failed") {
      patch.delivery_error_code = update.errorCode;
      patch.failure_reason = update.errorCode === 131047 ? "outside_24h_window" : "delivery_failed";
    }
    await supabase.from("whatsapp_outbound_messages").update(patch).eq("business_id", businessId).eq("id", row.id);

    if (update.status === "failed") {
      logEvent(
        "whatsapp_delivery_failed",
        businessId,
        { outboundId: row.id, conversationId: row.conversation_id, metaCode: update.errorCode, templateKind: row.template_kind },
        "error",
      );
      const clerkOrgId = await clerkOrgIdFor(supabase, businessId);
      if (clerkOrgId) await flagConversationNeedsAttention(supabase, businessId, row.conversation_id, clerkOrgId);
    }
  }
}

async function clerkOrgIdFor(supabase: ServiceSupabaseClient, businessId: string): Promise<string | null> {
  const { data } = await supabase.from("businesses").select("clerk_org_id").eq("id", businessId).maybeSingle<{ clerk_org_id: string }>();
  return data?.clerk_org_id ?? null;
}
