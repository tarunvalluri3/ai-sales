import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { websiteSuggestionStateSchema, type WebsiteSuggestionState } from "@/lib/schemas/website-suggestions";

const TABLE = "onboarding_website_imports";
const LEASE_MS = 2 * 60_000;

export function reviewLeaseActive(startedAt: number) {
  return Date.now() - startedAt < LEASE_MS;
}

export function stateForReview(state: WebsiteSuggestionState): WebsiteSuggestionState {
  if (state.generation_status === "running" && !reviewLeaseActive(Date.parse(state.updated_at))) {
    return { ...state, generation_status: "failed" };
  }
  return state;
}

export async function loadWebsiteImport(businessId: string, documentId: string) {
  const { data, error } = await createServerSupabaseClient().from(TABLE).select("*")
    .eq("business_id", businessId).eq("document_id", documentId).maybeSingle();
  if (error) throw new Error("Could not load website review.");
  return data ? websiteSuggestionStateSchema.parse(data) : null;
}

export async function listWebsiteImports(businessId: string) {
  const { data, error } = await createServerSupabaseClient().from(TABLE).select("*").eq("business_id", businessId);
  if (error) throw new Error("Could not load website imports.");
  return websiteSuggestionStateSchema.array().parse(data).map(stateForReview);
}

/** Compare-and-swap prevents duplicate generation, approval and discard across tabs. */
export async function updateWebsiteImport(state: WebsiteSuggestionState, changes: Partial<Pick<WebsiteSuggestionState, "generation_status" | "attempts" | "suggestions">>) {
  const { data, error } = await createServiceSupabaseClient().from(TABLE).update({
    ...changes, revision: state.revision + 1, updated_at: new Date().toISOString(),
  }).eq("business_id", state.business_id).eq("document_id", state.document_id).eq("revision", state.revision).select("*").maybeSingle();
  if (error) throw new Error("Could not save website review.");
  return data ? websiteSuggestionStateSchema.parse(data) : null;
}
