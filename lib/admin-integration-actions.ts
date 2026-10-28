"use server";

import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { recordAdminAuditLogEntry } from "@/lib/admin-audit-log";
import { checkAdminMutationRateLimit } from "@/lib/admin-rate-limit";
import { sendEmail } from "@/lib/email-sender";
import { renderBrandedEmail } from "@/lib/email-template";
import { getAppUrl } from "@/lib/app-url";
import type { ActionResult } from "@/lib/admin-tenant-actions";

/** Phase 33 Stop 4 (docs/phases.md): "notify tenant" for a broken integration (approved brief's "Bulk 'notify tenant' action"). One email per call -- the UI loops this over the selected rows rather than a single batched send, so a partial failure is visible per-tenant instead of silent. */

const inputSchema = z.object({
  businessId: z.string().uuid(),
  contactEmail: z.string().email().nullable(),
  businessName: z.string(),
  channel: z.enum(["whatsapp", "instagram"]),
});

export async function notifyTenantOfBrokenIntegration(input: z.infer<typeof inputSchema>): Promise<ActionResult> {
  const { admin } = await requirePlatformAdmin("support");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const allowed = await checkAdminMutationRateLimit(admin.user_id);
  if (!allowed) return { ok: false, error: "Too many admin actions in a short time. Wait a few minutes and try again." };

  if (!parsed.data.contactEmail) {
    return { ok: false, error: "This tenant has no contact email on file." };
  }

  const channelLabel = parsed.data.channel === "whatsapp" ? "WhatsApp" : "Instagram";
  const settingsPath = parsed.data.channel === "whatsapp" ? "/dashboard/whatsapp" : "/dashboard/instagram";

  const email = renderBrandedEmail({
    heading: `Your ${channelLabel} connection needs attention`,
    paragraphs: [
      `We noticed your ${channelLabel} connection for ${parsed.data.businessName} is currently disconnected or showing an error. Prospects messaging you on ${channelLabel} may not be getting a response from your AI sales employee.`,
      "Please reconnect it from your dashboard at your earliest convenience.",
    ],
    cta: { label: `Fix ${channelLabel} connection`, url: `${getAppUrl()}${settingsPath}` },
  });

  const outcome = await sendEmail({
    to: parsed.data.contactEmail,
    subject: `Action needed: your ${channelLabel} connection is down`,
    email,
  });

  if (outcome !== "sent") {
    return { ok: false, error: `Email not sent (${outcome}).` };
  }

  await recordAdminAuditLogEntry(admin.user_id, "integration.tenant_notified", parsed.data.channel, parsed.data.businessId, {
    businessId: parsed.data.businessId,
  });
  return { ok: true };
}
