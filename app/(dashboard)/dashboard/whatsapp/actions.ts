"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { connectWhatsappNumber, disconnectWhatsappNumber } from "@/lib/whatsapp";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { logAndGetUserMessage } from "@/lib/errors";

export type WhatsappFieldErrors = Partial<
  Record<"phoneNumberId" | "wabaId" | "displayPhoneNumber" | "accessToken", string>
>;

export type WhatsappActionState = {
  error?: string;
  fieldErrors?: WhatsappFieldErrors;
  success?: boolean;
};

const connectSchema = z.object({
  phoneNumberId: z.string().trim().min(1, "Enter your phone number ID."),
  wabaId: z.string().trim().min(1, "Enter your WhatsApp Business Account ID."),
  displayPhoneNumber: z.string().trim().min(1, "Enter the phone number this connects."),
  accessToken: z.string().trim().min(1, "Enter your access token."),
});

export async function connectWhatsappAction(
  _prevState: WhatsappActionState,
  formData: FormData,
): Promise<WhatsappActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  const parsed = connectSchema.safeParse({
    phoneNumberId: formData.get("phoneNumberId"),
    wabaId: formData.get("wabaId"),
    displayPhoneNumber: formData.get("displayPhoneNumber"),
    accessToken: formData.get("accessToken"),
  });
  if (!parsed.success) {
    const flatErrors = parsed.error.flatten().fieldErrors;
    return {
      error: "Check the fields below and try again.",
      fieldErrors: {
        phoneNumberId: flatErrors.phoneNumberId?.[0],
        wabaId: flatErrors.wabaId?.[0],
        displayPhoneNumber: flatErrors.displayPhoneNumber?.[0],
        accessToken: flatErrors.accessToken?.[0],
      },
    };
  }

  let result;
  try {
    result = await connectWhatsappNumber(businessId, parsed.data);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!result.success) {
    return { error: result.error };
  }

  await recordAuditLogEntry(
    businessId,
    userId,
    "whatsapp_connection.created",
    "whatsapp_connection",
    result.connection.id,
  );

  revalidatePath("/dashboard/whatsapp");
  return { success: true };
}

/* eslint-disable @typescript-eslint/no-unused-vars -- useActionState's (state, payload) shape; this action takes no fields. */
export async function disconnectWhatsappAction(
  _prevState: WhatsappActionState,
  _formData: FormData,
): Promise<WhatsappActionState> {
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  let deletedConnectionId: string | null;
  try {
    deletedConnectionId = await disconnectWhatsappNumber(businessId);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!deletedConnectionId) {
    return { error: "No WhatsApp connection to disconnect." };
  }

  await recordAuditLogEntry(businessId, userId, "whatsapp_connection.deleted", "whatsapp_connection", deletedConnectionId);

  revalidatePath("/dashboard/whatsapp");
  return { success: true };
}
