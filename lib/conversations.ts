import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Conversation } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Creates a conversation row. Takes the Supabase client as a parameter
 * (rather than constructing one internally) so both the Clerk-authenticated
 * dashboard path (lib/lead-capture.ts) and the service-role widget path
 * (app/api/chat/route.ts) can share this one implementation.
 * `businessId` must come from `requireBusinessContext()` or
 * `resolveBusinessFromWidgetKey()`, never client input.
 */
export async function createConversation(
  supabase: SupabaseClient,
  businessId: string,
  source: string | null,
): Promise<Conversation> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ business_id: businessId, source })
    .select()
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong recording this conversation. Please try again.",
      "createConversation failed",
      error,
    );
  }

  return data;
}

/**
 * Returns the number of conversations for a business, without fetching row
 * data. `businessId` must come from `requireBusinessContext()`.
 */
export async function countConversationsForBusiness(
  supabase: SupabaseClient,
  businessId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);

  if (error) {
    throw new AppError(
      "Something went wrong loading your conversations. Please try again.",
      "countConversationsForBusiness failed",
      error,
    );
  }

  return count ?? 0;
}

/**
 * Looks up a conversation, scoped to the given business. Returns null if
 * the conversation doesn't exist or belongs to a different business --
 * the caller must not distinguish those two cases in its own response
 * (docs/security.md §10: don't leak cross-tenant existence information).
 */
export async function getConversationForBusiness(
  supabase: SupabaseClient,
  businessId: string,
  id: string,
): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new AppError(
      "Something went wrong loading this conversation. Please try again.",
      "getConversationForBusiness failed",
      error,
    );
  }

  return data;
}
