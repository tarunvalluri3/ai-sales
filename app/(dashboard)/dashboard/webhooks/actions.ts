"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { createWebhookEndpoint, deleteWebhookEndpoint } from "@/lib/webhooks";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { logAndGetUserMessage } from "@/lib/errors";

export type WebhookActionState = {
  error?: string;
  success?: boolean;
};

const createSchema = z.object({
  url: z.string().trim().url("Enter a valid HTTPS URL."),
});

export async function createWebhookEndpointAction(
  _prevState: WebhookActionState,
  formData: FormData,
): Promise<WebhookActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  const parsed = createSchema.safeParse({ url: formData.get("url") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid URL." };
  }
  if (!parsed.data.url.startsWith("https://")) {
    return { error: "Webhook URLs must use https://." };
  }

  let created;
  try {
    created = await createWebhookEndpoint(businessId, parsed.data.url);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  await recordAuditLogEntry(businessId, userId, "webhook_endpoint.created", "webhook_endpoint", created.id);

  revalidatePath("/dashboard/webhooks");
  return { success: true };
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deleteWebhookEndpointAction(
  _prevState: WebhookActionState,
  formData: FormData,
): Promise<WebhookActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  const parsed = deleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  let deleted: boolean;
  try {
    deleted = await deleteWebhookEndpoint(businessId, parsed.data.id);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!deleted) {
    return { error: "This webhook endpoint no longer exists." };
  }

  await recordAuditLogEntry(businessId, userId, "webhook_endpoint.deleted", "webhook_endpoint", parsed.data.id);

  revalidatePath("/dashboard/webhooks");
  return { success: true };
}
