"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { createProduct, updateProduct, deleteProduct, approveProductDraft, rejectProductDraft } from "@/lib/products";
import {
  catalogNameSchema,
  catalogDescriptionSchema,
  catalogPriceSchema,
  catalogImageUrlSchema,
  catalogCategorySchema,
  catalogPriceAmountSchema,
} from "@/lib/schemas/catalog";
import { logAndGetUserMessage } from "@/lib/errors";

const productFieldsSchema = z.object({
  name: catalogNameSchema,
  description: catalogDescriptionSchema,
  price: catalogPriceSchema,
  image_url: catalogImageUrlSchema,
  category: catalogCategorySchema,
  price_amount: catalogPriceAmountSchema,
});

const updateProductSchema = productFieldsSchema.extend({
  id: z.string().uuid(),
});

export type ProductFormState = {
  error?: string;
  success?: boolean;
};

export async function createProductAction(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = productFieldsSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    price: formData.get("price"),
    image_url: formData.get("image_url"),
    category: formData.get("category"),
    price_amount: formData.get("price_amount"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid product." };
  }

  try {
    await createProduct(businessId, parsed.data);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function updateProductAction(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = updateProductSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description"),
    price: formData.get("price"),
    image_url: formData.get("image_url"),
    category: formData.get("category"),
    price_amount: formData.get("price_amount"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid product." };
  }

  const { id, ...input } = parsed.data;

  let updated: boolean;
  try {
    updated = await updateProduct(businessId, id, input);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!updated) {
    return { error: "This product no longer exists." };
  }

  revalidatePath("/dashboard/products");
  redirect("/dashboard/products");
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
  const { businessId, orgRole } = await requireBusinessContext();
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
    approved = await approveProductDraft(businessId, parsed.data.id);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!approved) {
    return { error: "This product is no longer awaiting review." };
  }

  revalidatePath("/dashboard/products");
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
  return { success: true };
}
