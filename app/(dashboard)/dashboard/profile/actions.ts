"use server";

import { revalidatePath } from "next/cache";
import { requireAuthContext } from "@/lib/auth";
import { updateBusinessProfile } from "@/lib/business";
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
