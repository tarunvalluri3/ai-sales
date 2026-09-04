import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Conversation, ConversationControl } from "@/lib/supabase/types";
import { AppError, logAndGetUserMessage } from "@/lib/errors";
import { assignNextTeamMember } from "@/lib/team-assignment";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * The `conversations.source` value that marks a row as sandbox-only
 * (Phase 25c "test your AI before publishing"). Never client input --
 * dashboard/_components/sandbox-chat/actions.ts is the only call site
 * that sets it. Lives here (not in that "use server" file, which may only
 * export async functions) so `lib/*.ts` read paths -- conversation
 * counts/listings here, analytics, request_callback -- can exclude
 * sandbox rows from real business data without an app-layer import.
 */
export const SANDBOX_CONVERSATION_SOURCE = "dashboard_test";

/**
 * A `.or()` filter fragment excluding sandbox conversations
 * (`source = 'dashboard_test'`) from a real-data count/list, without also
 * excluding the small number of legacy rows with `source is null` (pre-
 * dating the `source` column's consistent use) that a plain `.neq()`
 * would silently drop -- SQL's `<> ` treats `null <> 'dashboard_test'` as
 * unknown, not true.
 */
const EXCLUDE_SANDBOX_FILTER = `source.is.null,source.neq.${SANDBOX_CONVERSATION_SOURCE}`;

/**
 * Creates a conversation row. Takes the Supabase client as a parameter
 * (rather than constructing one internally) so both the Clerk-authenticated
 * dashboard path and the service-role widget path (app/api/chat/route.ts)
 * can share this one implementation. `businessId` must come from
 * `requireBusinessContext()` or `resolveBusinessFromWidgetKey()`, never
 * client input.
 */
export async function createConversation(
  supabase: SupabaseClient,
  businessId: string,
  source: string | null,
  sourceUrl: string | null = null,
  visitorId: string | null = null,
): Promise<Conversation> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ business_id: businessId, source, source_url: sourceUrl, visitor_id: visitorId })
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
    .eq("business_id", businessId)
    .or(EXCLUDE_SANDBOX_FILTER);

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
    .or(EXCLUDE_SANDBOX_FILTER)
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

export type RecentConversationSummary = {
  id: string;
  createdAt: string;
};

/**
 * Lists a visitor's own past conversations for a business (Phase 25d
 * "recent chats"), most recent first. Scoped on BOTH `businessId` and
 * `visitorId` -- never on the widget key alone, since a widget key is
 * shared across a business's entire visitor base and returning all of
 * its conversations for one key would leak one visitor's chat history to
 * another (docs/security.md §4). `businessId` must come from
 * `resolveBusinessFromWidgetKey()`; `visitorId` is a client-generated,
 * unauthenticated correlation id, not an identity credential -- this is
 * a UX convenience (letting a returning visitor find their own recent
 * conversations), not an authorization boundary.
 */
export async function listRecentConversationsForVisitor(
  supabase: SupabaseClient,
  businessId: string,
  visitorId: string,
  limit = 10,
): Promise<RecentConversationSummary[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, created_at")
    .eq("business_id", businessId)
    .eq("visitor_id", visitorId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new AppError(
      "Something went wrong loading your recent chats. Please try again.",
      "listRecentConversationsForVisitor failed",
      error,
    );
  }

  return data.map((row) => ({ id: row.id, createdAt: row.created_at }));
}

/**
 * Sets a conversation's control state ('ai' | 'human'), scoped to the
 * given business. Only a Clerk-authenticated dashboard caller should use
 * this. Taking over (control === "human") also clears `needs_attention`
 * -- taking over is already the human's explicit acknowledgment of the
 * alert, so this avoids requiring a second click for the common "see an
 * alert, take it over" path (Phase 15c). Hand-back-to-AI (control ===
 * "ai") does not touch `needs_attention`. `businessId` must come from
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
  const update = control === "human" ? { control, needs_attention: false } : { control };

  const { data, error } = await supabase
    .from("conversations")
    .update(update)
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
 * Clears `needs_attention` without changing `control` -- for the case
 * where staff reviews an escalated conversation and decides the AI is
 * handling it fine after all, no takeover needed (Phase 15c). Same
 * no-existence-leak, boolean-return contract as setConversationControl().
 */
export async function dismissConversationAttention(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("conversations")
    .update({ needs_attention: false })
    .eq("business_id", businessId)
    .eq("id", conversationId)
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong updating this conversation. Please try again.",
      "dismissConversationAttention failed",
      error,
    );
  }

  return data.length > 0;
}

/**
 * Returns the number of conversations for a business with
 * `needs_attention = true` -- the count backing the dashboard's live nav
 * badge (Phase 15c). `businessId` must come from `requireBusinessContext()`.
 * The existing `conversations_business_needs_attention_idx` partial index
 * (Phase 15a) covers exactly this query shape.
 */
export async function countConversationsNeedingAttention(
  supabase: SupabaseClient,
  businessId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("needs_attention", true)
    .or(EXCLUDE_SANDBOX_FILTER);

  if (error) {
    throw new AppError(
      "Something went wrong loading your conversations. Please try again.",
      "countConversationsNeedingAttention failed",
      error,
    );
  }

  return count ?? 0;
}

/**
 * Records that the prospect on this conversation has explicitly agreed
 * (via the widget's own consent checkbox, never inferred from chat text)
 * to have contact info they share stored to follow up with them (Phase
 * 22c). Idempotent -- a conversation that already has consent recorded is
 * left with its original `consent_given_at`. Called only from
 * app/api/chat/route.ts with the service-role client; a failure here must
 * not fail the prospect's message, so this logs rather than throws,
 * matching flagConversationNeedsAttention()'s contract.
 */
export async function recordConversationConsent(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ consent_given: true, consent_given_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", conversationId)
    .eq("consent_given", false);

  if (error) {
    logAndGetUserMessage(
      new AppError(
        "Something went wrong recording consent for this conversation.",
        "recordConversationConsent failed",
        error,
      ),
    );
  }
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
 *
 * Phase 24: also stamps `attention_flagged_at` (the SLA clock's start,
 * only ever set once -- a conversation that flags again while already
 * flagged keeps its original timestamp) and round-robin assigns a team
 * member if none is assigned yet (`clerkOrgId` needed only for this;
 * `getConversationForBusiness` doesn't otherwise need Clerk at all).
 * Assignment is a "who's notified first" pointer, not exclusive --
 * fetches the conversation first since Postgres has no
 * "set to now() only if null" via a plain update.
 */
export async function flagConversationNeedsAttention(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  clerkOrgId: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("attention_flagged_at, assigned_to_user_id")
    .eq("business_id", businessId)
    .eq("id", conversationId)
    .maybeSingle();

  const update: Record<string, unknown> = { needs_attention: true };
  if (!existing?.attention_flagged_at) {
    update.attention_flagged_at = new Date().toISOString();
  }
  if (!existing?.assigned_to_user_id) {
    update.assigned_to_user_id = await assignNextTeamMember(businessId, clerkOrgId);
  }

  const { error } = await supabase
    .from("conversations")
    .update(update)
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
