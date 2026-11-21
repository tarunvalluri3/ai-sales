import type { ConversationControl, Message } from "@/lib/supabase/types";
import type { ConversationWithMessageCount } from "@/lib/conversations";
import type { LastMessagePreview } from "@/lib/messages";

/**
 * Browser side of the dashboard polls (app/api/dashboard/). Plain GET
 * fetches, so they never sit in the Server Action queue (lib/dashboard-poll.ts).
 * Any non-2xx answer or an unexpected body throws: each poller treats that
 * as "keep the last-known state and try again next tick", exactly as it
 * treated a failed Server Action.
 */

export type AttentionSnapshot = { attentionCount: number; unreadNotificationCount: number };

export type ConversationUpdates = {
  messages: Message[];
  control: ConversationControl;
  needsAttention: boolean;
  asOf: string;
};

/** A lead's contact name keyed by its conversation: enough for the list's "Lead" badge and row label. */
export type ConversationLeadSummary = {
  conversationId: string;
  contactName: string | null;
};

/** The conversations inbox's left rail (GET /api/dashboard/conversations). */
export type ConversationListSnapshot = {
  conversations: ConversationWithMessageCount[];
  leads: ConversationLeadSummary[];
  lastMessages: LastMessagePreview[];
};

function isConversationListSnapshot(value: unknown): value is ConversationListSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.conversations) && Array.isArray(v.leads) && Array.isArray(v.lastMessages);
}

function isAttentionSnapshot(value: unknown): value is AttentionSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Number.isInteger(v.attentionCount) && Number.isInteger(v.unreadNotificationCount);
}

function isConversationUpdates(value: unknown): value is ConversationUpdates {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.messages) &&
    (v.control === "ai" || v.control === "human") &&
    typeof v.needsAttention === "boolean" &&
    typeof v.asOf === "string"
  );
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`poll failed: ${response.status}`);
  return response.json();
}

export async function fetchAttentionSnapshot(): Promise<AttentionSnapshot> {
  const body = await getJson("/api/dashboard/attention");
  if (!isAttentionSnapshot(body)) throw new Error("poll failed: unexpected body");
  return body;
}

export async function fetchConversationList(): Promise<ConversationListSnapshot> {
  const body = await getJson("/api/dashboard/conversations");
  if (!isConversationListSnapshot(body)) throw new Error("poll failed: unexpected body");
  return body;
}

export async function fetchConversationUpdates(conversationId: string, after: string): Promise<ConversationUpdates> {
  const url = `/api/dashboard/conversations/${encodeURIComponent(conversationId)}/updates?after=${encodeURIComponent(after)}`;
  const body = await getJson(url);
  if (!isConversationUpdates(body)) throw new Error("poll failed: unexpected body");
  return body;
}
