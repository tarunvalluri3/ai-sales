import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Conversation, ConversationControl } from "@/lib/supabase/types";
import { AppError, logAndGetUserMessage } from "@/lib/errors";

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

export type ConversationWithMessageCount = Conversation & { messageCount: number };

/**
 * Lists all conversations for a business, most recent first, with each
 * conversation's message count via PostgREST's embedded-relationship
 * count (messages.conversation_id is a real FK, unlike this project's
 * several app-enforced polymorphic references). `businessId` must come
 * from `requireBusinessContext()`.
 */
export async function listConversationsForBusiness(
  supabase: SupabaseClient,
  businessId: string,
): Promise<ConversationWithMessageCount[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*, messages(count)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new AppError(
      "Something went wrong loading your conversations. Please try again.",
      "listConversationsForBusiness failed",
      error,
    );
  }

  return data.map(({ messages, ...conversation }) => ({
    ...conversation,
    messageCount: (messages as { count: number }[])[0]?.count ?? 0,
  }));
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

/**
 * Sets a conversation's control state ('ai' | 'human'), scoped to the
 * given business. Only a Clerk-authenticated dashboard caller should use
 * this (grants restrict `authenticated` to the `control` column only --
 * `needs_attention` is never writable from this path, see
 * flagConversationNeedsAttention()). `businessId` must come from
 * `requireBusinessContext()`. Same no-existence-leak, boolean-return
 * contract as lib/leads.ts's updateLeadStatus() -- a cross-tenant or
 * nonexistent id affects zero rows rather than throwing or leaking which
 * case occurred.
 */
export async function setConversationControl(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  control: ConversationControl,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("conversations")
    .update({ control })
    .eq("business_id", businessId)
    .eq("id", conversationId)
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong updating this conversation. Please try again.",
      "setConversationControl failed",
      error,
    );
  }

  return data.length > 0;
}

/**
 * Flags a conversation as needing human attention. Called only from
 * app/api/chat/route.ts with the service-role client, after the AI sets
 * escalate: true on a turn -- never from a dashboard caller (no
 * `authenticated` grant exists on this column, by design). Escalation
 * deliberately does not change `control` -- see
 * prompts/phase-15a-handoff-state-and-ai-pause.md's "Decisions and
 * assumptions" #1. A failure here must not fail the prospect's request,
 * so this logs rather than throws.
 */
export async function flagConversationNeedsAttention(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ needs_attention: true })
    .eq("business_id", businessId)
    .eq("id", conversationId);

  if (error) {
    logAndGetUserMessage(
      new AppError(
        "Something went wrong flagging this conversation for attention.",
        "flagConversationNeedsAttention failed",
        error,
      ),
    );
  }
}
