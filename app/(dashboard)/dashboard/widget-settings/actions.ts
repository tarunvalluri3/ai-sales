"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { createWidgetKey, revokeWidgetKey, updateWidgetKeyOrigins } from "@/lib/widget-keys";
import { updateWidgetBranding, publishBusinessForOrg } from "@/lib/business";
import { widgetBrandingSchema } from "@/lib/schemas/business";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { logAndGetUserMessage } from "@/lib/errors";

const originSchema = z.string().trim().refine(
  (value) => {
    try {
      return new URL(value).origin === value;
    } catch {
      return false;
    }
  },
  { message: "Enter a canonical origin, e.g. https://example.com (no path, query, or trailing slash)." },
);

/** Parses the newline/comma-separated origins textarea into a deduped, validated list. Empty input is valid (zero origins) -- the key just fails closed until one is added. */
function parseOrigins(raw: string): { origins?: string[]; error?: string } {
  const candidates = raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const unique = [...new Set(candidates)];
  for (const candidate of unique) {
    const parsed = originSchema.safeParse(candidate);
    if (!parsed.success) {
      return { error: `"${candidate}" is not a valid origin. ${parsed.error.issues[0]?.message ?? ""}` };
    }
  }

  return { origins: unique };
}

export type WidgetKeyActionState = {
  error?: string;
  success?: boolean;
};

export async function createWidgetKeyAction(
  _prevState: WidgetKeyActionState,
  formData: FormData,
): Promise<WidgetKeyActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  const { origins, error } = parseOrigins(String(formData.get("origins") ?? ""));
  if (error) {
    return { error };
  }

  let created;
  try {
    created = await createWidgetKey(businessId, origins ?? []);
  } catch (err) {
    return { error: logAndGetUserMessage(err) };
  }

  await recordAuditLogEntry(businessId, userId, "widget_key.created", "widget_key", created.id);

  revalidatePath("/dashboard/widget-settings");
  return { success: true };
}

const updateOriginsSchema = z.object({ id: z.string().uuid() });

export async function updateWidgetKeyOriginsAction(
  _prevState: WidgetKeyActionState,
  formData: FormData,
): Promise<WidgetKeyActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  const parsedId = updateOriginsSchema.safeParse({ id: formData.get("id") });
  if (!parsedId.success) {
    return { error: "Invalid request." };
  }

  const { origins, error } = parseOrigins(String(formData.get("origins") ?? ""));
  if (error) {
    return { error };
  }

  let updated: boolean;
  try {
    updated = await updateWidgetKeyOrigins(businessId, parsedId.data.id, origins ?? []);
  } catch (err) {
    return { error: logAndGetUserMessage(err) };
  }

  if (!updated) {
    return { error: "This widget key no longer exists or has been revoked." };
  }

  await recordAuditLogEntry(businessId, userId, "widget_key.origins_updated", "widget_key", parsedId.data.id);

  revalidatePath("/dashboard/widget-settings");
  return { success: true };
}

const revokeSchema = z.object({ id: z.string().uuid() });

export async function revokeWidgetKeyAction(
  _prevState: WidgetKeyActionState,
  formData: FormData,
): Promise<WidgetKeyActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  const parsed = revokeSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  let revoked: boolean;
  try {
    revoked = await revokeWidgetKey(businessId, parsed.data.id);
  } catch (err) {
    return { error: logAndGetUserMessage(err) };
  }

  if (!revoked) {
    return { error: "This widget key no longer exists or is already revoked." };
  }

  await recordAuditLogEntry(businessId, userId, "widget_key.revoked", "widget_key", parsed.data.id);

  revalidatePath("/dashboard/widget-settings");
  return { success: true };
}

export type WidgetBrandingActionState = {
  error?: string;
  success?: boolean;
};

export async function updateWidgetBrandingAction(
  _prevState: WidgetBrandingActionState,
  formData: FormData,
): Promise<WidgetBrandingActionState> {
  const { businessId, userId, orgId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  const parsed = widgetBrandingSchema.safeParse({
    accentColor: formData.get("accentColor"),
    logoUrl: formData.get("logoUrl"),
    welcomeText: formData.get("welcomeText"),
    welcomeTextClosed: formData.get("welcomeTextClosed"),
    ctaText: formData.get("ctaText"),
    position: formData.get("position"),
    language: formData.get("language"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter valid widget settings." };
  }

  try {
    await updateWidgetBranding(orgId, parsed.data);
  } catch (err) {
    return { error: logAndGetUserMessage(err) };
  }

  await recordAuditLogEntry(businessId, userId, "widget_branding.updated", "business", businessId);

  revalidatePath("/dashboard/widget-settings");
  return { success: true };
}

export type PublishBusinessState = {
  error?: string;
  success?: boolean;
};

/**
 * Phase 25c "test your AI before publishing": the one-way switch that
 * lets lib/widget-auth.ts's resolveBusinessFromWidgetKey() start serving
 * real chat for this business's widget keys. Used both by the onboarding
 * "test your AI" step and the ongoing sandbox on /dashboard/widget-settings.
 */
export async function publishBusinessAction(
  _prevState: PublishBusinessState,
  formData: FormData,
): Promise<PublishBusinessState> {
  // Takes no form fields -- the signature is fixed by useActionState's
  // (prevState, formData) contract, same as every other action here.
  void formData;

  const { businessId, userId, orgId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  try {
    await publishBusinessForOrg(orgId);
  } catch (err) {
    return { error: logAndGetUserMessage(err) };
  }

  await recordAuditLogEntry(businessId, userId, "business.published", "business", businessId);

  revalidatePath("/dashboard/widget-settings");
  revalidatePath("/onboarding/test");
  return { success: true };
}
