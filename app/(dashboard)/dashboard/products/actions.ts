"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { createProduct, updateProduct, deleteProduct, approveProductDraft, rejectProductDraft } from "@/lib/products";
import { processIngestionQueue } from "@/lib/ingestion-queue";
import { parseCatalogForm, readCatalogFormValues, type CatalogFieldErrors, type CatalogFormValues } from "@/lib/schemas/catalog";
import { logAndGetUserMessage } from "@/lib/errors";

const productIdSchema = z.string().uuid();

/** Same fix as dashboard/faqs/actions.ts's triggerIngestionProcessing() -- see its doc comment (2026-10-29 bugfix, STATE.md). */
function triggerIngestionProcessing(): void {
  after(() => processIngestionQueue("dashboard"));
}

export type ProductFormState = {
  error?: string;
  success?: boolean;
  /** Per-field validation errors, shown next to each field. */
  fieldErrors?: CatalogFieldErrors;
  /** What was submitted, so a rejected form keeps the owner's input. */
  values?: CatalogFormValues;
};

const INVALID_FORM_MESSAGE = "Fix the highlighted fields.";

export async function createProductAction(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
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
    await createProduct(businessId, parsed.data, currency);
  } catch (error) {
    return { error: logAndGetUserMessage(error), values: readCatalogFormValues(formData) };
  }

  triggerIngestionProcessing();
  revalidatePath("/dashboard/products");
  revalidatePath("/onboarding");
  return { success: true };
}

export async function updateProductAction(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const { businessId, orgRole, currency } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const idParsed = productIdSchema.safeParse(formData.get("id"));
  if (!idParsed.success) {
    return { error: "Invalid product." };
  }
  const parsed = parseCatalogForm(formData);
  if (!parsed.ok) {
    return { error: INVALID_FORM_MESSAGE, fieldErrors: parsed.fieldErrors, values: parsed.values };
  }
  const id = idParsed.data;
  const input = parsed.data;

  let updated: boolean;
  try {
    updated = await updateProduct(businessId, id, input, currency);
  } catch (error) {
    return { error: logAndGetUserMessage(error), values: readCatalogFormValues(formData) };
  }

  if (!updated) {
    return { error: "This product no longer exists." };
  }

  triggerIngestionProcessing();
  revalidatePath("/dashboard/products");
  revalidatePath("/onboarding");
  redirect("/dashboard/products");
}

/**
 * Same update as `updateProductAction`, minus the `redirect()`. That
 * action's redirect is correct for its one existing caller (the
 * standalone `/dashboard/products/[id]/edit` page), but the onboarding
 * wizard edits a product inline, in place, without navigating anywhere
 * -- a `redirect()` there would bounce the user straight into the
 * dashboard's pre-publish guard (2026-10-29 bugfix, STATE.md). Kept as a
 * separate export rather than branching the existing one, so that
 * action's one real caller is untouched.
 */
export async function updateProductInPlaceAction(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const { businessId, orgRole, currency } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const idParsed = productIdSchema.safeParse(formData.get("id"));
  if (!idParsed.success) {
    return { error: "Invalid product." };
  }
  const parsed = parseCatalogForm(formData);
  if (!parsed.ok) {
    return { error: INVALID_FORM_MESSAGE, fieldErrors: parsed.fieldErrors, values: parsed.values };
  }
  const id = idParsed.data;
  const input = parsed.data;

  let updated: boolean;
  try {
    updated = await updateProduct(businessId, id, input, currency);
  } catch (error) {
    return { error: logAndGetUserMessage(error), values: readCatalogFormValues(formData) };
  }

  if (!updated) {
    return { error: "This product no longer exists." };
  }

  triggerIngestionProcessing();
  revalidatePath("/dashboard/products");
  revalidatePath("/onboarding");
  return { success: true };
}

export async function deleteProductAction(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid product." };
  }

  let deleted: boolean;
  try {
    deleted = await deleteProduct(businessId, parsed.data.id);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!deleted) {
    return { error: "This product no longer exists." };
  }

  revalidatePath("/dashboard/products");
  revalidatePath("/onboarding");
  return { success: true };
}

export type ReviewState = {
  error?: string;
  success?: boolean;
};

/** Approves a product extracted from a knowledge document (Stage 2, STATE.md). */
export async function approveProductAction(
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
    return { error: "Invalid product." };
  }

  let approved: boolean;
  try {
    approved = await approveProductDraft(businessId, parsed.data.id, currency);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!approved) {
    return { error: "This product is no longer awaiting review." };
  }

  triggerIngestionProcessing();
  revalidatePath("/dashboard/products");
  revalidatePath("/onboarding");
  return { success: true };
}

/** Rejects (deletes) a product extracted from a knowledge document (Stage 2, STATE.md). */
export async function rejectProductAction(
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
    return { error: "Invalid product." };
  }

  let rejected: boolean;
  try {
    rejected = await rejectProductDraft(businessId, parsed.data.id);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!rejected) {
    return { error: "This product is no longer awaiting review." };
  }

  revalidatePath("/dashboard/products");
  revalidatePath("/onboarding");
  return { success: true };
}
