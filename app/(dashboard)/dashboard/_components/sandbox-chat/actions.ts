"use server";

import { after } from "next/server";
import { requireBusinessContext } from "@/lib/business-context";
import { prepareProspectMessage } from "@/lib/guardrails/prepare-message";
import { recordGuardrailSignals } from "@/lib/guardrails/record";
import { getBusinessForOrg } from "@/lib/business";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createConversation, getConversationForBusiness, SANDBOX_CONVERSATION_SOURCE } from "@/lib/conversations";
import { createMessage } from "@/lib/messages";
import { askSalesEmployee, type ConversationMessage } from "@/lib/rag";
import type { RecommendedItem } from "@/lib/tools/recommend-products";
import { logAndGetUserMessage } from "@/lib/errors";
import { DRAFT_SOURCE, loadLiveAgentSourceByVersion, type AgentSource } from "@/lib/agent-runtime";
import { isAgentPublished } from "@/lib/agent-published";
import { withRequestTiming, type RequestTiming } from "@/lib/request-timing";
import {
  LIVE_SANDBOX_ENABLED,
  LIVE_SANDBOX_UNAVAILABLE_MESSAGE,
  sandboxModeSchema,
  type SandboxMode,
} from "@/lib/sandbox-mode";

// A "use server" file may export only async functions (and types). The mode
// schema (validated server-side: the client only picks draft or live, never a
// version id), its type and the Live switch live in lib/sandbox-mode.ts.
export type { SandboxMode };

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
 *
 * `mode` picks the draft (default) or the published agent. The live version
 * id is read from the session's own business row, never from the client, and
 * live is refused for a business that has not published.
 */
export async function sendSandboxMessage(
  conversationId: string | null,
  history: ConversationMessage[],
  message: string,
  mode: SandboxMode = "draft",
): Promise<SandboxChatResult> {
  // One identifier-free request_timing line per test-chat turn (sandbox turns
  // write no ai_response_metrics row, so this is their only timing record).
  return withRequestTiming(
    "sandbox_chat",
    (timing) => runSandboxTurn(timing, conversationId, history, message, mode),
    (result) => (result.ok ? "ok" : "rejected"),
  );
}

async function runSandboxTurn(
  timing: RequestTiming,
  conversationId: string | null,
  history: ConversationMessage[],
  message: string,
  mode: SandboxMode,
): Promise<SandboxChatResult> {
  const parsedMode = sandboxModeSchema.safeParse(mode);
  if (!parsedMode.success) {
    return { ok: false, error: "Choose the draft or the live agent." };
  }
  if (parsedMode.data === "live" && !LIVE_SANDBOX_ENABLED) {
    return { ok: false, error: LIVE_SANDBOX_UNAVAILABLE_MESSAGE };
  }
  const { businessId, orgId } = await requireBusinessContext();
  timing.mark("business_context");
  const business = await getBusinessForOrg(orgId);
  if (!business) {
    return { ok: false, error: "Business not found." };
  }

  let source: AgentSource = DRAFT_SOURCE;
  let liveConfig: Awaited<ReturnType<typeof loadLiveAgentSourceByVersion>> = null;
  if (parsedMode.data === "live") {
    if (!isAgentPublished(business) || !business.live_version_id) {
      return { ok: false, error: "Publish your agent before testing the live version." };
    }
    liveConfig = await loadLiveAgentSourceByVersion(businessId, business.live_version_id);
    if (!liveConfig) {
      return { ok: false, error: "The live version could not be loaded. Try the draft instead." };
    }
    source = liveConfig;
  }

  // Guardrails Phase 1: same sanitise/cap/mask pipeline as every other channel.
  const prepared = prepareProspectMessage(message);
  const trimmed = prepared.text;
  if (prepared.empty) {
    return { ok: false, error: "Enter a message." };
  }

  const supabase = createServerSupabaseClient();

  try {
    let conversation = conversationId
      ? await timing.time("conversation_lookup", () => getConversationForBusiness(supabase, businessId, conversationId))
      : null;

    if (!conversation || conversation.source !== SANDBOX_CONVERSATION_SOURCE) {
      conversation = await timing.time("conversation_create", () =>
        createConversation(supabase, businessId, SANDBOX_CONVERSATION_SOURCE),
      );
    }
    const conversationRowId = conversation.id;

    await timing.time("user_message_write", () => createMessage(supabase, businessId, conversationRowId, "user", trimmed));
    after(() => recordGuardrailSignals(businessId, conversation.id, "sandbox", prepared.signals));

    const response = await timing.time("ai_turn", () => askSalesEmployee(
      supabase,
      businessId,
      conversation.id,
      liveConfig ? liveConfig.snapshot.config.name : business.name,
      liveConfig
        ? {
            agentName: liveConfig.snapshot.config.persona.agentName,
            description: liveConfig.snapshot.config.description,
            contactEmail: liveConfig.snapshot.config.contactEmail,
            contactPhone: liveConfig.snapshot.config.contactPhone,
            website: liveConfig.snapshot.config.website,
            currency: business.currency,
            timezone: business.timezone,
          }
        : {
            agentName: business.agent_name,
            description: business.description,
            contactEmail: business.contact_email,
            contactPhone: business.contact_phone,
            website: business.website,
            currency: business.currency,
            timezone: business.timezone,
          },
      trimmed,
      [...history, { role: "user", content: trimmed }],
      liveConfig ? liveConfig.snapshot.config.language : business.widget_language,
      liveConfig
        ? {
            recommendProductsEnabled: liveConfig.snapshot.config.capabilities.recommendProducts,
            appointmentsEnabled: liveConfig.snapshot.config.capabilities.appointments,
          }
        : { recommendProductsEnabled: business.recommend_products_enabled, appointmentsEnabled: business.appointments_enabled },
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      "dashboard",
      source,
    ));

    await timing.time("assistant_message_write", () =>
      createMessage(
        supabase,
        businessId,
        conversationRowId,
        "assistant",
        response.answer,
        response.sourceChunkIds,
        response.grounded,
      ),
    );

    return {
      ok: true,
      conversationId: conversation.id,
      answer: response.sandboxBooking
        ? `${response.answer}\n\nTest booking — nothing was saved and no one was notified.`
        : response.answer,
      recommendedProducts: response.recommendedProducts,
    };
  } catch (error) {
    return { ok: false, error: logAndGetUserMessage(error) };
  }
}
