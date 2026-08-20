"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { createProduct, updateProduct, deleteProduct } from "@/lib/products";
import {
  catalogNameSchema,
  catalogDescriptionSchema,
  catalogPriceSchema,
} from "@/lib/schemas/catalog";
import { logAndGetUserMessage } from "@/lib/errors";

const productFieldsSchema = z.object({
  name: catalogNameSchema,
  description: catalogDescriptionSchema,
  price: catalogPriceSchema,
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
