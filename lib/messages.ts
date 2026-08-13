import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ConversationMessage } from "@/lib/rag";
import type { Message } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Persists one conversation turn. Widget requests use the service-role
 * client (app/api/chat/route.ts) -- there is no Clerk session on that
 * path. `businessId`/`conversationId` must already be resolved and
 * validated by the caller (never client input).
 */
export async function createMessage(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
): Promise<Message> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ business_id: businessId, conversation_id: conversationId, role, content })
    .select()
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong saving this message. Please try again.",
      "createMessage failed",
      error,
    );
  }

  return data;
}

/**
 * Returns the most recent `limit` messages for a conversation, in
 * chronological (oldest-first) order, mapped to askSalesEmployee()'s
 * ConversationMessage shape. Ordering ascending-then-limiting would
 * return the *oldest* messages once a conversation passes `limit` turns
 * -- this queries descending-limit-then-reverses instead, so the model
 * actually receives the most recent turns.
 */
export async function listRecentMessages(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  limit: number,
): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new AppError(
      "Something went wrong loading this conversation. Please try again.",
      "listRecentMessages failed",
      error,
    );
  }

  return data.reverse().map((row) => ({
    role: row.role as "user" | "assistant",
    content: row.content,
  }));
}
