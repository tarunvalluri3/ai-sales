import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Conversation } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

/**
 * Creates the minimal conversation stub row (Phase 10 -- Phase 11 owns
 * the real chat/message model). `businessId` must come from
 * `requireBusinessContext()`, never client input.
 */
export async function createConversation(
  businessId: string,
  source: string | null,
): Promise<Conversation> {
  const supabase = createServerSupabaseClient();
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
