"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { connectWhatsappNumber, disconnectWhatsappNumber } from "@/lib/whatsapp";
import { completeEmbeddedSignup, retryEmbeddedSignupSetup } from "@/lib/whatsapp-embedded-signup";
import { submitWhatsappTemplates, syncWhatsappTemplateStatuses } from "@/lib/whatsapp-template-sync";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { after } from "next/server";
import { channelAllowed, channelNotEntitledMessage, getEntitlementForBusiness } from "@/lib/subscription";
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

  // Phase 17a: WhatsApp is a Growth/Scale entitlement. Checked here, not
  // only on the page that renders the form -- an admin on Starter can post
  // to this action directly, and a hidden form is not an authorization
  // boundary. Before the field validation below, so a plan that does not
  // include the channel is refused regardless of what was submitted.
  //
  // Disconnecting is deliberately NOT gated: a business must always be
  // able to detach its own Meta credentials, whatever it is paying for.
  const entitlement = await getEntitlementForBusiness(businessId);
  if (!channelAllowed(entitlement, "whatsapp")) {
    return { error: channelNotEntitledMessage("whatsapp", entitlement) };
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

/* ------------------------------------------------------------------ *
 * Embedded Signup + templates (production readiness item 6, 2026-11-03).
 * Each action: org:admin, WhatsApp allowed on the plan (or trial), Zod-checked
 * input, business from the session (never the client).
 * ------------------------------------------------------------------ */

export type EmbeddedSignupActionResult =
  | { ok: true; complete: boolean; message: string | null }
  | { ok: false; error: string };

const embeddedSignupSchema = z.object({
  code: z.string().trim().min(10).max(2048),
  wabaId: z.string().regex(/^\d{1,32}$/),
  phoneNumberId: z.string().regex(/^\d{1,32}$/),
  metaBusinessId: z.string().regex(/^\d{1,32}$/).nullable(),
});

async function requireWhatsappAdmin(): Promise<{ businessId: string; userId: string } | { error: string }> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) return { error: authError };
  const entitlement = await getEntitlementForBusiness(businessId);
  if (!channelAllowed(entitlement, "whatsapp")) return { error: channelNotEntitledMessage("whatsapp", entitlement) };
  return { businessId, userId };
}

export async function completeWhatsappEmbeddedSignupAction(input: {
  code: string;
  wabaId: string;
  phoneNumberId: string;
  metaBusinessId: string | null;
}): Promise<EmbeddedSignupActionResult> {
  const context = await requireWhatsappAdmin();
  if ("error" in context) return { ok: false, error: context.error };
  const parsed = embeddedSignupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The signup didn't return the details we need. Please try again." };

  let outcome;
  try {
    outcome = await completeEmbeddedSignup(context.businessId, parsed.data);
  } catch (error) {
    return { ok: false, error: logAndGetUserMessage(error) };
  }
  if (!outcome.ok) return { ok: false, error: outcome.error };

  await recordAuditLogEntry(context.businessId, context.userId, "whatsapp_connection.created", "whatsapp_connection", outcome.connection.id);
  if (outcome.complete) {
    // Submit our appointment templates to the new WABA right away (each needs
    // Meta's review); the status panel shows the result.
    const businessId = context.businessId;
    after(async () => {
      await submitWhatsappTemplates(createServiceSupabaseClient(), businessId).catch((error: unknown) => logAndGetUserMessage(error));
    });
  }
  revalidatePath("/dashboard/whatsapp");
  return { ok: true, complete: outcome.complete, message: outcome.message };
}

export async function retryWhatsappSetupAction(): Promise<EmbeddedSignupActionResult> {
  const context = await requireWhatsappAdmin();
  if ("error" in context) return { ok: false, error: context.error };
  let outcome;
  try {
    outcome = await retryEmbeddedSignupSetup(context.businessId);
  } catch (error) {
    return { ok: false, error: logAndGetUserMessage(error) };
  }
  if (!outcome.ok) return { ok: false, error: outcome.error };
  revalidatePath("/dashboard/whatsapp");
  return { ok: true, complete: outcome.complete, message: outcome.message };
}

export type TemplateActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function submitWhatsappTemplatesAction(): Promise<TemplateActionResult> {
  const context = await requireWhatsappAdmin();
  if ("error" in context) return { ok: false, error: context.error };
  try {
    const result = await submitWhatsappTemplates(createServiceSupabaseClient(), context.businessId);
    revalidatePath("/dashboard/whatsapp");
    if (!result.ok) {
      return {
        ok: false,
        error:
          result.reason === "not_connected"
            ? "Connect WhatsApp first."
            : `Meta didn't let us read your templates${result.metaMessage ? `: ${result.metaMessage}` : "."}`,
      };
    }
    if (result.submitted.length === 0 && result.failed.length === 0) return { ok: true, message: "All templates are already submitted." };
    return {
      ok: true,
      message:
        result.failed.length > 0
          ? `Submitted ${result.submitted.length}; ${result.failed.length} couldn't be submitted (see below).`
          : `Submitted ${result.submitted.length} for Meta's review. Approval usually takes minutes to a day.`,
    };
  } catch (error) {
    return { ok: false, error: logAndGetUserMessage(error) };
  }
}

export async function refreshWhatsappTemplatesAction(): Promise<TemplateActionResult> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) return { ok: false, error: authError };
  try {
    const result = await syncWhatsappTemplateStatuses(createServiceSupabaseClient(), businessId);
    revalidatePath("/dashboard/whatsapp");
    if (!result.ok) {
      return {
        ok: false,
        error: result.reason === "not_connected" ? "Connect WhatsApp first." : `Meta didn't let us read your templates${result.metaMessage ? `: ${result.metaMessage}` : "."}`,
      };
    }
    return { ok: true, message: "Template status refreshed." };
  } catch (error) {
    return { ok: false, error: logAndGetUserMessage(error) };
  }
}
