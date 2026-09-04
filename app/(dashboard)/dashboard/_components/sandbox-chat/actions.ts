"use server";

import { requireBusinessContext } from "@/lib/business-context";
import { getBusinessForOrg } from "@/lib/business";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createConversation, getConversationForBusiness, SANDBOX_CONVERSATION_SOURCE } from "@/lib/conversations";
import { createMessage } from "@/lib/messages";
import { askSalesEmployee, type ConversationMessage } from "@/lib/rag";
import type { RecommendedItem } from "@/lib/tools/recommend-products";
import { logAndGetUserMessage } from "@/lib/errors";

export type SandboxChatResult =
  | { ok: true; conversationId: string; answer: string; recommendedProducts: RecommendedItem[] }
  | { ok: false; error: string };

/**
 * Runs one sandbox turn through the real AI pipeline (lib/rag.ts's
 * askSalesEmployee(), same function the public widget calls), scoped to
 * the caller's own business via requireBusinessContext() -- never a
 * widget key. Uses the Clerk-session-scoped Supabase client throughout
 * (not the service-role client the public widget path uses): retrieval
 * (match_knowledge_chunks) and the usage-quota read already grant
 * `authenticated` execute/select for exactly this reason (see
 * lib/retrieval.ts's doc comment); the new
 * 20260824010000_allow_sandbox_test_messages.sql migration adds the one
 * missing piece, a narrowly-scoped messages INSERT policy for
 * source='dashboard_test' conversations. A metrics-table write inside
 * askSalesEmployee() has no authenticated-role grant and fails silently
 * (best-effort by design) -- sandbox turns are deliberately excluded from
 * per-turn latency/cost metrics, not a bug. lib/analytics.ts's own stats
 * queries, lib/conversations.ts's real conversation list/counts, and
 * lib/notifications.ts's daily digest all exclude source='dashboard_test'
 * rows; lib/tools/{request-callback,book-appointment}.ts skip writing a
 * real leads/appointments row (and request_callback's webhook) for a
 * sandbox conversation, while still running their normal validation so
 * the sandbox stays a realistic preview.
 */
export async function sendSandboxMessage(
  conversationId: string | null,
  history: ConversationMessage[],
  message: string,
): Promise<SandboxChatResult> {
  const { businessId, orgId } = await requireBusinessContext();
  const business = await getBusinessForOrg(orgId);
  if (!business) {
    return { ok: false, error: "Business not found." };
  }

  const trimmed = message.trim().slice(0, 2000);
  if (!trimmed) {
    return { ok: false, error: "Enter a message." };
  }

  const supabase = createServerSupabaseClient();

  try {
    let conversation = conversationId
      ? await getConversationForBusiness(supabase, businessId, conversationId)
      : null;

    if (!conversation || conversation.source !== SANDBOX_CONVERSATION_SOURCE) {
      conversation = await createConversation(supabase, businessId, SANDBOX_CONVERSATION_SOURCE);
    }

    await createMessage(supabase, businessId, conversation.id, "user", trimmed);

    const response = await askSalesEmployee(
      supabase,
      businessId,
      conversation.id,
      business.name,
      {
        description: business.description,
        contactEmail: business.contact_email,
        contactPhone: business.contact_phone,
        website: business.website,
      },
      trimmed,
      [...history, { role: "user", content: trimmed }],
      business.widget_language,
      { recommendProductsEnabled: business.recommend_products_enabled, appointmentsEnabled: business.appointments_enabled },
    );

    await createMessage(
      supabase,
      businessId,
      conversation.id,
      "assistant",
      response.answer,
      response.sourceChunkIds,
      response.grounded,
    );

    return {
      ok: true,
      conversationId: conversation.id,
      answer: response.answer,
      recommendedProducts: response.recommendedProducts,
    };
  } catch (error) {
    return { ok: false, error: logAndGetUserMessage(error) };
  }
}
