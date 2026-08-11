import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

export type ProductInput = {
  name: string;
  description: string | null;
  price: string | null;
};

/** Looks up a single product, scoped to the given business. `null` if it doesn't exist or belongs to another business. */
export async function getProduct(businessId: string, id: string): Promise<Product | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new AppError(
      "Something went wrong loading this product. Please try again.",
      "getProduct failed",
      error,
    );
  }

  return data;
}

/** Lists all products for a business. `businessId` must come from `requireBusinessContext()`. */
export async function listProductsForBusiness(businessId: string): Promise<Product[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new AppError(
      "Something went wrong loading your products. Please try again.",
      "listProductsForBusiness failed",
      error,
    );
  }

  return data;
}

/** Creates a product for a business. `businessId` must come from `requireBusinessContext()`. */
export async function createProduct(
  businessId: string,
  input: ProductInput,
): Promise<Product> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .insert({ business_id: businessId, ...input })
    .select()
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong creating this product. Please try again.",
      "createProduct failed",
      error,
    );
  }

  return data;
}

/**
 * Updates a product, scoped to the given business. `id`s belonging to
 * another business (or nonexistent) affect zero rows — returns `false`
 * rather than throwing, so the caller can show a safe "not found" message
 * without distinguishing that from a cross-tenant attempt.
 */
export async function updateProduct(
  businessId: string,
  id: string,
  input: ProductInput,
): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .update(input)
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong updating this product. Please try again.",
      "updateProduct failed",
      error,
    );
  }

  return data.length > 0;
}

/** Deletes a product, scoped to the given business. See `updateProduct` for the not-found contract. */
export async function deleteProduct(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .delete()
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong deleting this product. Please try again.",
      "deleteProduct failed",
      error,
    );
  }

  return data.length > 0;
}
