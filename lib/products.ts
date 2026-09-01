import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";
import { syncGeneratedDocument, deleteGeneratedDocument } from "@/lib/knowledge-sync";

export type ProductInput = {
  name: string;
  description: string | null;
  price: string | null;
  image_url: string | null;
  category: string | null;
  price_amount: number | null;
};

function buildKnowledgeContent(input: ProductInput): string {
  const parts = [input.name];
  if (input.category) {
    parts.push(`Category: ${input.category}`);
  }
  if (input.description) {
    parts.push(input.description);
  }
  if (input.price) {
    parts.push(`Price: ${input.price}`);
  }
  return parts.join("\n\n");
}

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

/** Lists all approved products for a business. `businessId` must come from `requireBusinessContext()`. Excludes unreviewed extractions -- see `listPendingReviewProducts`. */
export async function listProductsForBusiness(businessId: string): Promise<Product[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "approved")
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

/** Lists products extracted from a knowledge document that are awaiting review. `businessId` must come from `requireBusinessContext()`. */
export async function listPendingReviewProducts(businessId: string): Promise<Product[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "draft")
    .order("created_at", { ascending: true });

  if (error) {
    throw new AppError(
      "Something went wrong loading products awaiting review. Please try again.",
      "listPendingReviewProducts failed",
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

  await syncGeneratedDocument(businessId, "product", data.id, data.name, buildKnowledgeContent(input));

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

  if (data.length === 0) {
    return false;
  }

  await syncGeneratedDocument(businessId, "product", id, input.name, buildKnowledgeContent(input));

  return true;
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

  if (data.length === 0) {
    return false;
  }

  await deleteGeneratedDocument(businessId, "product", id);

  return true;
}

/**
 * Approves a pending extracted product: flips it to 'approved' and syncs
 * its generated knowledge document, the same call `createProduct` already
 * makes -- so an approved extraction becomes tool-queryable and
 * RAG-retrievable through the exact same path as a manually created
 * product, no second code path. Scoped to `status = 'draft'` so this can
 * never re-sync an already-approved row. `false` for a cross-tenant,
 * nonexistent, or already-approved id.
 */
export async function approveProductDraft(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .update({ status: "approved" })
    .eq("business_id", businessId)
    .eq("id", id)
    .eq("status", "draft")
    .select();

  if (error) {
    throw new AppError(
      "Something went wrong approving this product. Please try again.",
      "approveProductDraft failed",
      error,
    );
  }

  const product = data[0];
  if (!product) {
    return false;
  }

  await syncGeneratedDocument(businessId, "product", product.id, product.name, buildKnowledgeContent(product));

  return true;
}

/**
 * Rejects (deletes) a pending extracted product. Safe without a
 * `deleteGeneratedDocument` call -- a draft never gets a generated
 * document synced for it (see `approveProductDraft`). Scoped to
 * `status = 'draft'` so this can never delete an already-approved row.
 */
export async function rejectProductDraft(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .delete()
    .eq("business_id", businessId)
    .eq("id", id)
    .eq("status", "draft")
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong rejecting this product. Please try again.",
      "rejectProductDraft failed",
      error,
    );
  }

  return data.length > 0;
}
