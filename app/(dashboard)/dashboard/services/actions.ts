"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { createService, updateService, deleteService, approveServiceDraft, rejectServiceDraft } from "@/lib/services";
import { processIngestionQueue } from "@/lib/ingestion-queue";
import { parseCatalogForm, readCatalogFormValues, type CatalogFieldErrors, type CatalogFormValues } from "@/lib/schemas/catalog";
import { cleanupAgentImage, uploadAgentImage } from "@/lib/agent-images";
import { logAndGetUserMessage } from "@/lib/errors";

const serviceIdSchema = z.string().uuid();

/** Same fix as dashboard/faqs/actions.ts's triggerIngestionProcessing() -- see its doc comment (2026-10-29 bugfix, STATE.md). */
function triggerIngestionProcessing(): void {
  after(() => processIngestionQueue("dashboard"));
}

export type ServiceFormState = {
  error?: string;
  success?: boolean;
  /** Per-field validation errors, shown next to each field. */
  fieldErrors?: CatalogFieldErrors;
  /** What was submitted, so a rejected form keeps the owner's input. */
  values?: CatalogFormValues;
};

const INVALID_FORM_MESSAGE = "Fix the highlighted fields.";

export async function createServiceAction(
  _prevState: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const { businessId, orgRole, currency } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = parseCatalogForm(formData);
  if (!parsed.ok) {
    return { error: INVALID_FORM_MESSAGE, fieldErrors: parsed.fieldErrors, values: parsed.values };
  }

  try {
    const uploaded = await uploadAgentImage(businessId, "products", formData.get("image_file"));
    try {
      await createService(businessId, uploaded ? { ...parsed.data, image_url: uploaded } : parsed.data, currency);
    } catch (error) {
      await cleanupAgentImage(businessId, uploaded);
      throw error;
    }
  } catch (error) {
    return { error: logAndGetUserMessage(error), values: readCatalogFormValues(formData) };
  }

  triggerIngestionProcessing();
  revalidatePath("/dashboard/services");
  revalidatePath("/onboarding");
  return { success: true };
}

export async function updateServiceAction(
  _prevState: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const result = await updateServiceInPlaceAction(_prevState, formData);
  if (result.success) redirect("/dashboard/services");
  return result;
}

export async function updateServiceInPlaceAction(
  _prevState: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const { businessId, orgRole, currency } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const idParsed = serviceIdSchema.safeParse(formData.get("id"));
  if (!idParsed.success) {
    return { error: "Invalid service." };
  }
  const parsed = parseCatalogForm(formData);
  if (!parsed.ok) {
    return { error: INVALID_FORM_MESSAGE, fieldErrors: parsed.fieldErrors, values: parsed.values };
  }
  const id = idParsed.data;
  const input = parsed.data;

  let updated: boolean;
  try {
    const uploaded = await uploadAgentImage(businessId, "products", formData.get("image_file"));
    try {
      updated = await updateService(businessId, id, uploaded ? { ...input, image_url: uploaded } : input, currency);
      if (!updated) await cleanupAgentImage(businessId, uploaded);
    } catch (error) {
      await cleanupAgentImage(businessId, uploaded);
      throw error;
    }
  } catch (error) {
    return { error: logAndGetUserMessage(error), values: readCatalogFormValues(formData) };
  }

  if (!updated) {
    return { error: "This service no longer exists." };
  }

  triggerIngestionProcessing();
  revalidatePath("/dashboard/services");
  revalidatePath("/onboarding");
  return { success: true };
}

export async function deleteServiceAction(
  _prevState: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid service." };
  }

  let deleted: boolean;
  try {
    deleted = await deleteService(businessId, parsed.data.id);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!deleted) {
    return { error: "This service no longer exists." };
  }

  revalidatePath("/dashboard/services");
  revalidatePath("/onboarding");
  return { success: true };
}

export type ReviewState = {
  error?: string;
  success?: boolean;
};

/** Approves a service extracted from a knowledge document (Stage 2, STATE.md). */
export async function approveServiceAction(
  _prevState: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const { businessId, orgRole, currency } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid service." };
  }

  let approved: boolean;
  try {
    approved = await approveServiceDraft(businessId, parsed.data.id, currency);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!approved) {
    return { error: "This service is no longer awaiting review." };
  }

  triggerIngestionProcessing();
  revalidatePath("/dashboard/services");
  revalidatePath("/onboarding");
  return { success: true };
}

/** Rejects (deletes) a service extracted from a knowledge document (Stage 2, STATE.md). */
export async function rejectServiceAction(
  _prevState: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid service." };
  }

  let rejected: boolean;
  try {
    rejected = await rejectServiceDraft(businessId, parsed.data.id);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!rejected) {
    return { error: "This service is no longer awaiting review." };
  }

  revalidatePath("/dashboard/services");
  revalidatePath("/onboarding");
  return { success: true };
}
