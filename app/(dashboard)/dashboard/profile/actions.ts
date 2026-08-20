"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth";
import { deleteBusinessForOrg, getBusinessForOrg, updateBusinessProfile } from "@/lib/business";
import { exportBusinessData } from "@/lib/data-export";
import { businessProfileSchema } from "@/lib/schemas/business";
import { logAndGetUserMessage } from "@/lib/errors";

export type ProfileFormState = {
  error?: string;
  success?: boolean;
};

export async function updateBusinessProfileAction(
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const context = await requireAuthContext({ role: "org:admin" });

  if (!context.orgId) {
    return { error: "Select or create an organization first." };
  }

  const parsed = businessProfileSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
    website: formData.get("website"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid business profile." };
  }

  try {
    await updateBusinessProfile(context.orgId, parsed.data);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  return { success: true };
}

export type ExportDataState = {
  error?: string;
  json?: string;
};

/**
 * Returns the business's full data export as a JSON string (Phase 22e).
 * A Server Action rather than a route handler -- this dashboard has no
 * other authenticated API route, and returning the payload to the
 * caller for a client-side Blob download avoids introducing a new
 * auth-in-route-handler pattern for a single feature (docs/architecture.md's
 * route-handler boundary is reserved for the public widget). org:admin
 * only, same gate as every other business-wide action in this file.
 */
export async function exportBusinessDataAction(): Promise<ExportDataState> {
  const context = await requireAuthContext({ role: "org:admin" });

  if (!context.orgId) {
    return { error: "Select or create an organization first." };
  }

  const business = await getBusinessForOrg(context.orgId);
  if (!business) {
    return { error: "No business found for this organization." };
  }

  try {
    const data = await exportBusinessData(business.id);
    return { json: JSON.stringify(data, null, 2) };
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
}

export type DeleteBusinessState = {
  error?: string;
};

/**
 * Permanently deletes the business and everything it owns (Phase 22e).
 * org:admin only, and requires the caller to type the exact current
 * business name as a confirmation -- checked server-side (the client's
 * disabled-until-matching button is a UX nicety, not the real guard).
 * Does not delete the Clerk organization itself, by explicit user choice
 * (see lib/business.ts's deleteBusinessForOrg doc comment) -- redirects
 * to /onboarding afterward, the same place a member of an org with no
 * business already lands.
 */
export async function deleteBusinessAction(
  _prevState: DeleteBusinessState,
  formData: FormData,
): Promise<DeleteBusinessState> {
  const context = await requireAuthContext({ role: "org:admin" });

  if (!context.orgId) {
    return { error: "Select or create an organization first." };
  }

  const business = await getBusinessForOrg(context.orgId);
  if (!business) {
    return { error: "No business found for this organization." };
  }

  const confirmName = formData.get("confirmName");
  if (typeof confirmName !== "string" || confirmName !== business.name) {
    return { error: "Type the business name exactly to confirm deletion." };
  }

  try {
    await deleteBusinessForOrg(context.orgId);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  redirect("/onboarding");
}
