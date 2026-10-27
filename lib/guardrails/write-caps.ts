import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/logger";

/**
 * Per-conversation caps on the write tools (guardrails Phase 3), enforced from
 * day one. The Phase 0 red-team found no limit at all: `book_appointment`
 * creates a NEW appointment on every call and emails the confirmation to the
 * contact the model passes, so a looping or manipulated model (or a visitor
 * who keeps asking) was a mail-relay and notification-spam shape.
 *
 * Counted in `guardrail_events` (one `write_tool_call` row per real write
 * attempt), so no new table or migration. A call is recorded BEFORE it is
 * counted, so the Nth call sees N rows; over the cap it is refused. Two
 * simultaneous calls can both squeak under by one -- acceptable for an abuse
 * cap whose job is to stop dozens, and cheaper than a lock.
 *
 * Fails OPEN on an infrastructure error: blocking real leads because a log
 * insert hiccupped is worse than the abuse it prevents, and the cap is not a
 * security boundary (tenant scoping and consent are).
 */
export const WRITE_TOOL_CAPS = {
  book_appointment: 2,
  request_callback: 3,
} as const;

export type WriteToolName = keyof typeof WRITE_TOOL_CAPS;

export type WriteCapVerdict = { allowed: boolean; count: number; cap: number };

export async function reserveWriteToolCall(
  businessId: string,
  conversationId: string,
  tool: WriteToolName,
): Promise<WriteCapVerdict> {
  const cap = WRITE_TOOL_CAPS[tool];
  try {
    const supabase = createServiceSupabaseClient();
    const { error: insertError } = await supabase.from("guardrail_events").insert({
      business_id: businessId,
      conversation_id: conversationId,
      channel: "tool",
      signal: "write_tool_call",
      rule: tool,
      action: "logged",
      mode: "enforce",
    });
    if (insertError) throw insertError;

    const { count, error: countError } = await supabase
      .from("guardrail_events")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("conversation_id", conversationId)
      .eq("signal", "write_tool_call")
      .eq("rule", tool);
    if (countError || count === null) throw countError ?? new Error("no count");

    const allowed = count <= cap;
    if (!allowed) {
      logEvent("guardrail_signal", businessId, { type: "write_tool_cap", rule: tool, action: "blocked", mode: "enforce", channel: "tool", count, cap });
      await flagConversationForHuman(businessId, conversationId);
    }
    return { allowed, count, cap };
  } catch {
    logEvent("guardrail_cap_check_failed", businessId, { tool });
    return { allowed: true, count: 0, cap };
  }
}

/**
 * Marks the conversation as needing a human, from inside a tool. Deliberately
 * minimal (no assignee pick, no email): the owner's dashboard already surfaces
 * `needs_attention`, and the full escalation path is the turn-level one.
 */
async function flagConversationForHuman(businessId: string, conversationId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("conversations")
    .update({ needs_attention: true })
    .eq("business_id", businessId)
    .eq("id", conversationId);
  if (error) logEvent("guardrail_flag_failed", businessId, { code: error.code ?? "unknown" }, "error");
}

/** The visitor's own recent messages in this conversation (already masked/sanitised at write time). */
export async function loadVisitorTexts(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  businessId: string,
  conversationId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("messages")
    .select("content")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []).map((row: { content: string }) => row.content);
}
