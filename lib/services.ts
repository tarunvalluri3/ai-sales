import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Service } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";
import { syncGeneratedDocument, deleteGeneratedDocument } from "@/lib/knowledge-sync";
import { embedText } from "@/lib/embeddings";
import { logEvent } from "@/lib/logger";

export type ServiceInput = {
  name: string;
  description: string | null;
  price: string | null;
  image_url: string | null;
  category: string | null;
  price_amount: number | null;
};

function buildKnowledgeContent(input: ServiceInput): string {
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

/**
 * Powers recommend_products' intent-matching (lib/tools/recommend-products.ts,
 * match_services RPC). Best-effort: a transient embedding failure (rate
 * limit, provider outage) must never block a service save -- it just
 * leaves `embedding` null, and match_services' own `embedding is not
 * null` filter simply excludes the row until it's next saved. Runs on
 * an admin's dashboard save/approve action, never on the chat request
 * path, so it can never add latency to a prospect's response.
 */
async function computeEmbeddingBestEffort(businessId: string, text: string): Promise<number[] | null> {
  try {
    return await embedText(text);
  } catch {
    logEvent("service_embedding_failed", businessId, {}, "error");
    return null;
  }
}

/** Looks up a single service, scoped to the given business. `null` if it doesn't exist or belongs to another business. */
export async function getService(businessId: string, id: string): Promise<Service | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new AppError(
      "Something went wrong loading this service. Please try again.",
      "getService failed",
      error,
    );
  }

  return data;
}

/**
 * Looks up several services by id in one query, scoped to the business --
 * for resolving a batch of leads' `interest_id` to display names (leads
 * list, `/impeccable clarify`) without one query per row. Returns
 * whichever of the requested ids actually exist for this business;
 * missing/cross-tenant ids are simply absent from the result, not an
 * error, matching `getService()`'s no-existence-leak contract.
 */
export async function listServicesByIds(businessId: string, ids: string[]): Promise<Service[]> {
  if (ids.length === 0) return [];

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("services").select("*").eq("business_id", businessId).in("id", ids);

  if (error) {
    throw new AppError(
      "Something went wrong loading your services. Please try again.",
      "listServicesByIds failed",
      error,
    );
  }

  return data;
}

/** Bounds the unpaginated services-list fetch, same reasoning and value as lib/conversations.ts's LIST_LIMIT. */
const LIST_LIMIT = 300;

/** Lists all approved services for a business. `businessId` must come from `requireBusinessContext()`. Excludes unreviewed extractions -- see `listPendingReviewServices`. */
export async function listServicesForBusiness(businessId: string): Promise<Service[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "approved")
    .order("created_at", { ascending: true })
    .limit(LIST_LIMIT);

  if (error) {
    throw new AppError(
      "Something went wrong loading your services. Please try again.",
      "listServicesForBusiness failed",
      error,
    );
  }

  return data;
}

/** Lists services extracted from a knowledge document that are awaiting review. `businessId` must come from `requireBusinessContext()`. */
export async function listPendingReviewServices(businessId: string): Promise<Service[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "draft")
    .order("created_at", { ascending: true });

  if (error) {
    throw new AppError(
      "Something went wrong loading services awaiting review. Please try again.",
      "listPendingReviewServices failed",
      error,
    );
  }

  return data;
}

/** Creates a service for a business. `businessId` must come from `requireBusinessContext()`. */
export async function createService(
  businessId: string,
  input: ServiceInput,
): Promise<Service> {
  const supabase = createServerSupabaseClient();
  const embedding = await computeEmbeddingBestEffort(businessId, buildKnowledgeContent(input));
  const { data, error } = await supabase
    .from("services")
    .insert({ business_id: businessId, ...input, embedding })
    .select()
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong creating this service. Please try again.",
      "createService failed",
      error,
    );
  }

  await syncGeneratedDocument(businessId, "service", data.id, data.name, buildKnowledgeContent(input));

  return data;
}

/**
 * Updates a service, scoped to the given business. `id`s belonging to
 * another business (or nonexistent) affect zero rows — returns `false`
 * rather than throwing, so the caller can show a safe "not found" message
 * without distinguishing that from a cross-tenant attempt.
 */
export async function updateService(
  businessId: string,
  id: string,
  input: ServiceInput,
): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  // A failed embedding attempt (`null`) is omitted from the update
  // payload rather than written, so a transient failure on an edit
  // never overwrites a previously-successful embedding with null.
  const embedding = await computeEmbeddingBestEffort(businessId, buildKnowledgeContent(input));
  const { data, error } = await supabase
    .from("services")
    .update({ ...input, ...(embedding !== null ? { embedding } : {}) })
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong updating this service. Please try again.",
      "updateService failed",
      error,
    );
  }

  if (data.length === 0) {
    return false;
  }

  await syncGeneratedDocument(businessId, "service", id, input.name, buildKnowledgeContent(input));

  return true;
}

/** Deletes a service, scoped to the given business. See `updateService` for the not-found contract. */
export async function deleteService(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("services")
    .delete()
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong deleting this service. Please try again.",
      "deleteService failed",
      error,
    );
  }

  if (data.length === 0) {
    return false;
  }

  await deleteGeneratedDocument(businessId, "service", id);

  return true;
}

/**
 * Approves a pending extracted service: flips it to 'approved' and syncs
 * its generated knowledge document, the same call `createService` already
 * makes -- so an approved extraction becomes tool-queryable and
 * RAG-retrievable through the exact same path as a manually created
 * service, no second code path. Scoped to `status = 'draft'` so this can
 * never re-sync an already-approved row. `false` for a cross-tenant,
 * nonexistent, or already-approved id.
 */
export async function approveServiceDraft(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("services")
    .update({ status: "approved" })
    .eq("business_id", businessId)
    .eq("id", id)
    .eq("status", "draft")
    .select();

  if (error) {
    throw new AppError(
      "Something went wrong approving this service. Please try again.",
      "approveServiceDraft failed",
      error,
    );
  }

  const service = data[0];
  if (!service) {
    return false;
  }

  // A draft extraction was never embedded (only createService/updateService
  // compute it) -- compute it now, on the same admin-triggered approve
  // action, so an approved item is immediately recommend_products-ready.
  const embedding = await computeEmbeddingBestEffort(businessId, buildKnowledgeContent(service));
  if (embedding !== null) {
    await supabase.from("services").update({ embedding }).eq("business_id", businessId).eq("id", service.id);
  }

  await syncGeneratedDocument(businessId, "service", service.id, service.name, buildKnowledgeContent(service));

  return true;
}

/**
 * Rejects (deletes) a pending extracted service. Safe without a
 * `deleteGeneratedDocument` call -- a draft never gets a generated
 * document synced for it (see `approveServiceDraft`). Scoped to
 * `status = 'draft'` so this can never delete an already-approved row.
 */
export async function rejectServiceDraft(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("services")
    .delete()
    .eq("business_id", businessId)
    .eq("id", id)
    .eq("status", "draft")
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong rejecting this service. Please try again.",
      "rejectServiceDraft failed",
      error,
    );
  }

  return data.length > 0;
}
