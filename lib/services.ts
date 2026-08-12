import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Service } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";
import { syncGeneratedDocument, deleteGeneratedDocument } from "@/lib/knowledge-sync";

export type ServiceInput = {
  name: string;
  description: string | null;
  price: string | null;
};

function buildKnowledgeContent(input: ServiceInput): string {
  const parts = [input.name];
  if (input.description) {
    parts.push(input.description);
  }
  if (input.price) {
    parts.push(`Price: ${input.price}`);
  }
  return parts.join("\n\n");
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

/** Lists all services for a business. `businessId` must come from `requireBusinessContext()`. */
export async function listServicesForBusiness(businessId: string): Promise<Service[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new AppError(
      "Something went wrong loading your services. Please try again.",
      "listServicesForBusiness failed",
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
  const { data, error } = await supabase
    .from("services")
    .insert({ business_id: businessId, ...input })
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
  const { data, error } = await supabase
    .from("services")
    .update(input)
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
