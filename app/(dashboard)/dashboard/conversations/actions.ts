"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  dismissConversationAttention,
  getConversationForBusiness,
  setConversationControl,
} from "@/lib/conversations";
import { createMessage, listMessagesForConversationAfter } from "@/lib/messages";
import { getCitationDetails, type CitedChunk } from "@/lib/knowledge";
import { logAndGetUserMessage } from "@/lib/errors";
import { recordAuditLogEntry } from "@/lib/audit-log";
import type { ConversationControl, Message } from "@/lib/supabase/types";

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

  revalidatePath(`/dashboard/conversations/${parsed.data.id}`);
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
  const { businessId, orgRole } = await requireBusinessContext();
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

  revalidatePath(`/dashboard/conversations/${parsed.data.conversationId}`);
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

  revalidatePath(`/dashboard/conversations/${parsed.data.conversationId}`);
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
