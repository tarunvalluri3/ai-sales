"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { createService, updateService, deleteService } from "@/lib/services";
import {
  catalogNameSchema,
  catalogDescriptionSchema,
  catalogPriceSchema,
} from "@/lib/schemas/catalog";
import { logAndGetUserMessage } from "@/lib/errors";

const serviceFieldsSchema = z.object({
  name: catalogNameSchema,
  description: catalogDescriptionSchema,
  price: catalogPriceSchema,
});

const updateServiceSchema = serviceFieldsSchema.extend({
  id: z.string().uuid(),
});

export type ServiceFormState = {
  error?: string;
  success?: boolean;
};

export async function createServiceAction(
  _prevState: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = serviceFieldsSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    price: formData.get("price"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid service." };
  }

  try {
    await createService(businessId, parsed.data);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  revalidatePath("/dashboard/services");
  return { success: true };
}

export async function updateServiceAction(
  _prevState: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = updateServiceSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description"),
    price: formData.get("price"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid service." };
  }

  const { id, ...input } = parsed.data;

  let updated: boolean;
  try {
    updated = await updateService(businessId, id, input);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!updated) {
    return { error: "This service no longer exists." };
  }

  revalidatePath("/dashboard/services");
  redirect("/dashboard/services");
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
  return { success: true };
}
