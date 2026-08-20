import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ConversationMessage } from "@/lib/rag";
import type { Message, MessageRole } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Persists one conversation turn. Widget requests use the service-role
 * client (app/api/chat/route.ts) -- there is no Clerk session on that
 * path. `businessId`/`conversationId` must already be resolved and
 * validated by the caller (never client input). `role` includes
 * 'human_agent' (Phase 15b) alongside 'user'/'assistant' -- an
 * authenticated dashboard caller inserting 'human_agent' is gated by
 * RLS (messages_insert_human_agent_reply), not by this function.
 */
export async function createMessage(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  role: MessageRole,
  content: string,
  sourceChunkIds: string[] = [],
  grounded: boolean | null = null,
): Promise<Message> {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      business_id: businessId,
      conversation_id: conversationId,
      role,
      content,
      source_chunk_ids: sourceChunkIds,
      grounded,
    })
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

/**
 * Returns the full, ordered transcript for a conversation, for the
 * dashboard's conversation detail view (app/(dashboard)/dashboard/conversations/[id]).
 * Unlike listRecentMessages(), this returns full rows (id/created_at
 * included) in chronological (oldest-first) order, not the narrowed,
 * reversed-for-LLM-context shape. Capped at 500 rows as a defensive
 * bound, not a real limit at current usage.
 */
export async function listMessagesForConversation(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    throw new AppError(
      "Something went wrong loading this conversation's messages. Please try again.",
      "listMessagesForConversation failed",
      error,
    );
  }

  return data;
}

/**
 * Returns messages created strictly after `after` (an ISO timestamp),
 * chronological (oldest-first), for polling (Phase 15b). Used by both
 * app/api/chat/poll/route.ts (widget-side, `excludeRoles: ["user"]` --
 * the widget already knows its own prospect-authored messages from
 * local state) and the dashboard's live-updating transcript (no
 * excludeRoles -- staff need to see new prospect messages too).
 * `limit` is a defensive bound, not a real limit at current usage, same
 * convention as listMessagesForConversation()'s 500-row cap.
 */
export async function listMessagesForConversationAfter(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  after: string,
  options?: { excludeRoles?: MessageRole[]; limit?: number },
): Promise<Message[]> {
  let query = supabase
    .from("messages")
    .select("*")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .gt("created_at", after);

  if (options?.excludeRoles && options.excludeRoles.length > 0) {
    query = query.not("role", "in", `(${options.excludeRoles.join(",")})`);
  }

  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(options?.limit ?? 200);

  if (error) {
    throw new AppError(
      "Something went wrong loading new messages. Please try again.",
      "listMessagesForConversationAfter failed",
      error,
    );
  }

  return data;
}
