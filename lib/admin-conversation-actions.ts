"use server";

import { requirePlatformAdmin } from "@/lib/platform-admin";
import { recordAdminAuditLogEntry } from "@/lib/admin-audit-log";
import { checkAdminPiiRevealRateLimit } from "@/lib/admin-rate-limit";
import { revealLeadContact, type RevealedLeadContact } from "@/lib/admin-conversations";

/** Phase 33 Stop 4 (docs/phases.md): the audited, rate-limited "reveal" action the approved security brief requires ("Add a 'reveal' action that is logged") on top of lib/admin-conversations.ts's plain read. */

export type RevealResult = { ok: true; contact: RevealedLeadContact } | { ok: false; error: string };

export async function revealLeadContactAction(leadId: string, businessId: string): Promise<RevealResult> {
  const { admin } = await requirePlatformAdmin("support");

  const allowed = await checkAdminPiiRevealRateLimit(admin.user_id);
  if (!allowed) return { ok: false, error: "Too many reveals in a short time. Wait a few minutes and try again." };

  const contact = await revealLeadContact(leadId);
  if (!contact) return { ok: false, error: "Lead not found." };

  await recordAdminAuditLogEntry(admin.user_id, "lead.contact_revealed", "lead", leadId, { businessId });
  return { ok: true, contact };
}

/** Logged every time an admin opens a full transcript (approved brief: "every view of customer conversation content writes to it"). Called by the transcript page itself. */
export async function recordTranscriptView(conversationId: string, businessId: string): Promise<void> {
  const { admin } = await requirePlatformAdmin("viewer");
  await recordAdminAuditLogEntry(admin.user_id, "conversation.transcript_viewed", "conversation", conversationId, { businessId });
}
