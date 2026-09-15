"use server";

import { z } from "zod";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  dismissConversationAttention,
  getConversationForBusiness,
  listConversationsForBusiness,
  setConversationControl,
  type ConversationWithMessageCount,
} from "@/lib/conversations";
import { listLeadsForBusiness } from "@/lib/leads";
import {
  createMessage,
  listLastMessagesForConversations,
  listMessagesForConversationAfter,
  type LastMessagePreview,
} from "@/lib/messages";
import { getCitationDetails, type CitedChunk } from "@/lib/knowledge";
import { generateConversationSummary } from "@/lib/conversation-summary";
import { suggestTagsForConversation } from "@/lib/tag-suggestions";
import { assignTagToConversation, removeTagFromConversation, getOrCreateTagByName } from "@/lib/lead-tags";
import { logAndGetUserMessage } from "@/lib/errors";
import { recordAuditLogEntry } from "@/lib/audit-log";
import type { TagState } from "../leads/actions";
import type { RemoveTagState } from "../_components/tag-chip";
import type { ConversationControl, LeadTag, Message } from "@/lib/supabase/types";
import { getWhatsappConnectionForBusiness, WHATSAPP_CONVERSATION_SOURCE } from "@/lib/whatsapp";
import { createWhatsappOutboundMessage, sendWhatsappOutboundMessage } from "@/lib/whatsapp-delivery";
import { getInstagramConnectionForBusiness, INSTAGRAM_CONVERSATION_SOURCE } from "@/lib/instagram";
import { createInstagramOutboundMessage, sendInstagramOutboundMessage } from "@/lib/instagram-delivery";
import { dispatchWorkflowTrigger, resolveWorkflowTargetFromConversation } from "@/lib/workflow-engine";
import { completeCopilotActionsForEvent } from "@/lib/copilot-actions";

const setControlSchema = z.object({
  id: z.string().uuid(),
  control: z.enum(["ai", "human"]),
});

export type SetControlState = {
  error?: string;
  success?: boolean;
};

/**
 * Takes over or hands back a conversation. Any authenticated business
 * member may call this -- PRODUCT.md §3 explicitly scopes "take over
 * conversations" to business members, not just org:admin (same
 * authorization tier as D7's products/services/FAQs/lead-status
 * precedent).
 */
export async function setConversationControlAction(
  _prevState: SetControlState,
  formData: FormData,
): Promise<SetControlState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) {
    return { error: authError };
  }

  const parsed = setControlSchema.safeParse({
    id: formData.get("id"),
    control: formData.get("control"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const supabase = createServerSupabaseClient();

  let updated: boolean;
  try {
    updated = await setConversationControl(supabase, businessId, parsed.data.id, parsed.data.control);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!updated) {
    return { error: "This conversation no longer exists." };
  }

  await recordAuditLogEntry(businessId, userId, "conversation.control_changed", "conversation", parsed.data.id, {
    control: parsed.data.control,
  });

  const target = await resolveWorkflowTargetFromConversation(supabase, businessId, parsed.data.id);
  if (target) {
    await dispatchWorkflowTrigger(supabase, businessId, parsed.data.control === "human" ? "human_takeover" : "ai_handback", target);
  }

  return { success: true };
}

const sendReplySchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().trim().min(1).max(2000),
});

export type SendReplyState = {
  error?: string;
  success?: boolean;
  message?: Message;
};

/**
 * Sends a staff reply, persisted as a new 'human_agent'-role message.
 * Only possible while control === "human" -- re-checked here as the
 * app-layer half of the defense-in-depth pair; the RLS policy
 * (messages_insert_human_agent_reply) is the other half, exercised
 * directly if this check is ever bypassed (prompts/phase-15b-staff-reply-and-live-polling.md).
 * Returns the inserted row so the client can append it optimistically
 * without waiting for the next poll tick.
 */
export async function sendHumanReplyAction(
  _prevState: SendReplyState,
  formData: FormData,
): Promise<SendReplyState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) {
    return { error: authError };
  }

  const parsed = sendReplySchema.safeParse({
    conversationId: formData.get("conversationId"),
    content: formData.get("content"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const supabase = createServerSupabaseClient();

  const conversation = await getConversationForBusiness(supabase, businessId, parsed.data.conversationId);
  if (!conversation || conversation.control !== "human") {
    return { error: "Take over this conversation before replying." };
  }

  let message: Message;
  try {
    message = await createMessage(supabase, businessId, parsed.data.conversationId, "human_agent", parsed.data.content);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  // Phase 30 v2: a real staff reply just went out -- the unambiguous
  // domain event that proves a `reply_to_prospect`/`follow_up` Copilot
  // recommendation was actually acted on. Auto-complete only, never
  // inferred from opening the conversation or taking it over.
  const completedActionTypes = await completeCopilotActionsForEvent(
    businessId,
    conversation.customer_id,
    ["reply_to_prospect", "follow_up"],
    userId,
  );
  if (completedActionTypes.length > 0) {
    await recordAuditLogEntry(businessId, userId, "copilot.action_completed", "customer", conversation.customer_id as string, {
      actionTypes: completedActionTypes.join(","),
    });
  }

  // Phase 16: a staff reply on a WhatsApp-sourced conversation must also
  // reach the prospect over WhatsApp, not just appear in the dashboard
  // transcript -- reuses the exact same outbound queue/send function the
  // AI-reply path uses (app/api/webhooks/whatsapp/route.ts), no parallel
  // send mechanism. Best-effort: a failed send here must not fail the
  // staff member's reply itself, since the message is already saved and
  // visible in the transcript regardless -- the shared daily cron sweep
  // retries it.
  if (conversation.source === WHATSAPP_CONVERSATION_SOURCE && conversation.visitor_id) {
    try {
      const connection = await getWhatsappConnectionForBusiness(businessId);
      if (connection?.status === "connected") {
        const serviceSupabase = createServiceSupabaseClient();
        const outbound = await createWhatsappOutboundMessage(serviceSupabase, {
          businessId,
          conversationId: parsed.data.conversationId,
          messageId: message.id,
          toWaId: conversation.visitor_id,
          phoneNumberId: connection.phone_number_id,
          content: parsed.data.content,
        });
        await sendWhatsappOutboundMessage(outbound.id);
      }
    } catch (error) {
      logAndGetUserMessage(error);
    }
  }

  // Same reasoning as the WhatsApp branch above, mirrored for
  // Instagram-sourced conversations -- this was missing entirely when
  // Phase 26 shipped, so a staff reply during human takeover saved to the
  // transcript but never reached the prospect on Instagram (found via the
  // user's own live test, STATE.md Phase 26 follow-up #5).
  if (conversation.source === INSTAGRAM_CONVERSATION_SOURCE && conversation.visitor_id) {
    try {
      const connection = await getInstagramConnectionForBusiness(businessId);
      if (connection?.status === "connected") {
        const serviceSupabase = createServiceSupabaseClient();
        const outbound = await createInstagramOutboundMessage(serviceSupabase, {
          businessId,
          conversationId: parsed.data.conversationId,
          messageId: message.id,
          toIgId: conversation.visitor_id,
          instagramBusinessAccountId: connection.instagram_business_account_id,
          content: parsed.data.content,
        });
        await sendInstagramOutboundMessage(outbound.id);
      }
    } catch (error) {
      logAndGetUserMessage(error);
    }
  }

  return { success: true, message };
}

const dismissAttentionSchema = z.object({
  conversationId: z.string().uuid(),
});

export type DismissAttentionState = {
  error?: string;
  success?: boolean;
};

/**
 * Clears `needs_attention` without changing `control` -- for a
 * conversation staff has reviewed and decided the AI is handling fine,
 * no takeover needed (Phase 15c).
 */
export async function dismissAttentionAction(
  _prevState: DismissAttentionState,
  formData: FormData,
): Promise<DismissAttentionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) {
    return { error: authError };
  }

  const parsed = dismissAttentionSchema.safeParse({
    conversationId: formData.get("conversationId"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const supabase = createServerSupabaseClient();

  let updated: boolean;
  try {
    updated = await dismissConversationAttention(supabase, businessId, parsed.data.conversationId);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!updated) {
    return { error: "This conversation no longer exists." };
  }

  await recordAuditLogEntry(
    businessId,
    userId,
    "conversation.attention_dismissed",
    "conversation",
    parsed.data.conversationId,
  );

  return { success: true };
}

const pollSchema = z.object({
  conversationId: z.string().uuid(),
  after: z.iso.datetime({ offset: true }),
});

export type PollConversationResult = {
  messages: Message[];
  control: ConversationControl;
  needsAttention: boolean;
  asOf: string;
};

/**
 * Polled directly from the dashboard's live conversation view (not
 * form-driven -- called as a plain async function from a client
 * component, a supported Server Action call pattern). Still
 * Zod-validated even though it's not FormData-sourced, since it's a
 * public entry point reachable with arbitrary arguments from client
 * code. Returns every role (unlike the widget's poll endpoint, which
 * excludes 'user') -- staff need to see the prospect's next message
 * live, which is the point of this stage's dashboard requirement.
 *
 * Deliberately does not swallow a DB failure into a guessed `control`
 * value -- that would risk the client flickering to a wrong state on a
 * transient error. Real failures (a thrown AppError, a network hiccup
 * in the Server Action round-trip) propagate as a rejected promise; the
 * calling client component's own poll loop catches it and simply tries
 * again next tick, per this prompt's error-handling section. Only a
 * malformed call (should not happen from this file's own client
 * caller) or a not-found/cross-tenant conversation returns early with
 * an empty, unchanged-cursor result, since those are not transient.
 */
export async function pollConversationAction(
  conversationId: string,
  after: string,
): Promise<PollConversationResult> {
  const { businessId } = await requireBusinessContext();

  const parsed = pollSchema.safeParse({ conversationId, after });
  if (!parsed.success) {
    return { messages: [], control: "ai", needsAttention: false, asOf: after };
  }

  const supabase = createServerSupabaseClient();

  const conversation = await getConversationForBusiness(supabase, businessId, parsed.data.conversationId);
  if (!conversation) {
    return { messages: [], control: "ai", needsAttention: false, asOf: after };
  }

  const messages = await listMessagesForConversationAfter(
    supabase,
    businessId,
    parsed.data.conversationId,
    parsed.data.after,
    { limit: 200 },
  );

  const asOf = messages.length > 0 ? messages[messages.length - 1].created_at : after;

  return { messages, control: conversation.control, needsAttention: conversation.needs_attention, asOf };
}

export type ConversationLeadSummary = {
  conversationId: string;
  contactName: string | null;
};

export type PollConversationsResult = {
  conversations: ConversationWithMessageCount[];
  leads: ConversationLeadSummary[];
  lastMessages: LastMessagePreview[];
};

/**
 * Polled directly from the conversations list view -- same shape as
 * pollAttentionCountAction (no input, business-scoped, a plain async
 * function call from a client component). Leads come back as
 * {conversationId, contactName} pairs (not full Lead rows) -- just
 * enough to drive the "Lead" badge and, when named, stand in for the
 * row's primary label (/impeccable layout). lastMessages is one query
 * across every conversation this poll already knows about (not N+1),
 * for the row's preview line.
 */
export async function pollConversationsAction(): Promise<PollConversationsResult> {
  const { businessId } = await requireBusinessContext();
  const supabase = createServerSupabaseClient();

  const conversations = await listConversationsForBusiness(supabase, businessId);
  const conversationIds = conversations.map((conversation) => conversation.id);

  const [leads, lastMessages] = await Promise.all([
    listLeadsForBusiness(businessId),
    listLastMessagesForConversations(supabase, businessId, conversationIds),
  ]);

  return {
    conversations,
    leads: leads.map((lead) => ({ conversationId: lead.conversation_id, contactName: lead.contact_name })),
    lastMessages,
  };
}

const chunkIdSchema = z.string().uuid();

/**
 * Loads citation details (chunk content + parent document title) for the
 * "Sources" expander on an assistant message (Phase 24). Called on
 * demand from the client, not preloaded for every message in the
 * transcript -- most messages are never expanded. `businessId` scoping
 * happens inside getCitationDetails(); an ID belonging to another
 * business simply resolves to nothing.
 */
export async function getCitationDetailsAction(chunkIds: string[]): Promise<CitedChunk[]> {
  const { businessId } = await requireBusinessContext();

  const parsed = z.array(chunkIdSchema).max(10).safeParse(chunkIds);
  if (!parsed.success) {
    return [];
  }

  return getCitationDetails(businessId, parsed.data);
}

const generateSummarySchema = z.object({
  conversationId: z.string().uuid(),
});

export type GenerateSummaryState = {
  error?: string;
  summary?: string;
  messageCount?: number;
  generatedAt?: string;
};

/**
 * Generates (or regenerates) the on-demand AI conversation summary --
 * `org:analyst_viewer` minimum, the lowest authenticated tier, since this
 * is a read-oriented helper (it writes a cached summary, not a business
 * configuration change) rather than a mutation that needs
 * `org:sales_agent` like taking over a conversation or replying does.
 */
export async function generateConversationSummaryAction(
  _prevState: GenerateSummaryState,
  formData: FormData,
): Promise<GenerateSummaryState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:analyst_viewer");
  if (authError) {
    return { error: authError };
  }

  const parsed = generateSummarySchema.safeParse({
    conversationId: formData.get("conversationId"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const supabase = createServerSupabaseClient();

  try {
    const result = await generateConversationSummary(supabase, businessId, parsed.data.conversationId);
    if (!result) {
      return { error: "This conversation has no messages to summarize yet." };
    }
    return { summary: result.summary, messageCount: result.messageCount, generatedAt: result.generatedAt };
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
}

// --- Phase 27: lead tagging / segmentation (conversation side) ---

const conversationTagAssignmentSchema = z.object({
  conversationId: z.string().uuid(),
  tagId: z.string().uuid(),
});

/** org:sales_agent minimum -- same tier as every other conversation mutation on this page (control toggle, staff reply, dismiss attention). */
export async function assignTagToConversationAction(_prevState: TagState, formData: FormData): Promise<TagState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) {
    return { error: authError };
  }

  const parsed = conversationTagAssignmentSchema.safeParse({
    conversationId: formData.get("conversationId"),
    tagId: formData.get("tagId"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  try {
    await assignTagToConversation(businessId, parsed.data.conversationId, parsed.data.tagId);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  const supabase = createServerSupabaseClient();
  const target = await resolveWorkflowTargetFromConversation(supabase, businessId, parsed.data.conversationId);
  if (target) {
    await dispatchWorkflowTrigger(supabase, businessId, "tag_added", target, { tagId: parsed.data.tagId });
  }

  return { success: true };
}

export async function removeTagFromConversationAction(
  _prevState: RemoveTagState,
  formData: FormData,
): Promise<RemoveTagState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) {
    return { error: authError };
  }

  const parsed = conversationTagAssignmentSchema.safeParse({
    conversationId: formData.get("conversationId"),
    tagId: formData.get("tagId"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  try {
    await removeTagFromConversation(businessId, parsed.data.conversationId, parsed.data.tagId);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  const supabase = createServerSupabaseClient();
  const target = await resolveWorkflowTargetFromConversation(supabase, businessId, parsed.data.conversationId);
  if (target) {
    await dispatchWorkflowTrigger(supabase, businessId, "tag_removed", target, { tagId: parsed.data.tagId });
  }

  return { success: true };
}

const acceptSuggestionSchema = z.object({
  conversationId: z.string().uuid(),
  name: z.string().trim().min(1).max(40),
});

export type AcceptTagSuggestionState = {
  error?: string;
  tag?: LeadTag;
};

/**
 * Accepts one AI-suggested tag chip: resolves the suggested name to an
 * existing catalog tag or creates a new one (`getOrCreateTagByName`),
 * then assigns it to the conversation -- the one place a tag-mutating
 * action needs two lib calls instead of one, since a suggestion by
 * definition might not exist in the catalog yet. Still never happens
 * without this explicit click; `suggestTagsForConversation` itself never
 * writes anything. Returns the resolved tag (not just success/error) --
 * `TagsCard` has no `revalidatePath` to refresh from (see
 * `RemovableTagChip`'s doc comment) and needs the real id/color to add
 * it to local state.
 */
export async function acceptTagSuggestionForConversationAction(
  _prevState: AcceptTagSuggestionState,
  formData: FormData,
): Promise<AcceptTagSuggestionState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) {
    return { error: authError };
  }

  const parsed = acceptSuggestionSchema.safeParse({
    conversationId: formData.get("conversationId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  try {
    const tag = await getOrCreateTagByName(businessId, parsed.data.name);
    await assignTagToConversation(businessId, parsed.data.conversationId, tag.id);

    const supabase = createServerSupabaseClient();
    const target = await resolveWorkflowTargetFromConversation(supabase, businessId, parsed.data.conversationId);
    if (target) {
      await dispatchWorkflowTrigger(supabase, businessId, "tag_added", target, { tagId: tag.id });
    }

    return { tag };
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
}

const suggestTagsSchema = z.object({ conversationId: z.string().uuid() });

export type SuggestTagsState = {
  error?: string;
  suggestions?: string[];
};

/**
 * Suggests tags for a staff member to accept or dismiss -- never writes
 * anything itself (`lib/tag-suggestions.ts`). `org:analyst_viewer`
 * minimum, same tier as `generateConversationSummaryAction`: this
 * generates a display-only suggestion, it doesn't mutate the lead/
 * conversation the way accepting one (assignTagToConversationAction/
 * assignTagToLeadAction) does.
 */
export async function suggestTagsForConversationAction(
  _prevState: SuggestTagsState,
  formData: FormData,
): Promise<SuggestTagsState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:analyst_viewer");
  if (authError) {
    return { error: authError };
  }

  const parsed = suggestTagsSchema.safeParse({ conversationId: formData.get("conversationId") });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const supabase = createServerSupabaseClient();

  try {
    const suggestions = await suggestTagsForConversation(supabase, businessId, parsed.data.conversationId);
    if (suggestions.length === 0) {
      return { error: "This conversation has no messages to suggest tags from yet." };
    }
    return { suggestions };
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
}
