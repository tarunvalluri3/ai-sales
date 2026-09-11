import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { getChatModel } from "@/lib/rag";
import { listMessagesForConversation } from "@/lib/messages";
import { AppError } from "@/lib/errors";
import type { Message } from "@/lib/supabase/types";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const MAX_SUMMARY_LENGTH = 600;
const MAX_TRANSCRIPT_CHARS = 8000;

const ROLE_LABEL: Record<Message["role"], string> = {
  user: "Prospect",
  assistant: "AI",
  human_agent: "Team member",
};

function formatTranscript(messages: Message[]): string {
  return messages.map((message) => `${ROLE_LABEL[message.role]}: ${message.content}`).join("\n");
}

export type ConversationSummaryResult = {
  summary: string;
  messageCount: number;
  generatedAt: string;
};

/**
 * Generates a short, transcript-grounded summary of what the prospect is
 * asking about/looking for and their apparent urgency or sentiment, then
 * persists it. A plain single-shot `getChatModel().invoke()` call -- not
 * `askSalesEmployee()`'s RAG/tool-calling pipeline -- the same "simple
 * single-shot, not the full agent loop" pattern `lib/stalled-leads.ts`'s
 * `draftFollowUpMessage()` already uses for a comparable internal-facing
 * draft. Grounded ONLY in this conversation's own messages: the prompt
 * explicitly forbids stating anything not actually said (AGENTS.md rule
 * 4 -- no fabricated facts). The result is display-only, untrusted AI
 * output (rule 5) -- the caller must label it as such, exactly like
 * `leads.qualification_reason`.
 *
 * Deliberately on-demand only: never called from the dashboard's
 * 1-second poll loop, so AI spend never scales with how long a
 * conversation sits open in a browser tab.
 */
export async function generateConversationSummary(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
): Promise<ConversationSummaryResult | null> {
  const messages = await listMessagesForConversation(supabase, businessId, conversationId);
  if (messages.length === 0) {
    return null;
  }

  const transcript = formatTranscript(messages).slice(0, MAX_TRANSCRIPT_CHARS);
  const prompt = `Summarize this sales conversation between a prospect and a business's AI/team, for an internal staff member who hasn't read it yet. Cover, in 2-4 short sentences: what the prospect is asking about or looking for, and their apparent urgency or sentiment. Use ONLY what was actually said below -- never invent a product, price, promise, or fact that wasn't mentioned. Plain text only, no markdown, no preamble like "Summary:".

${transcript}`;

  let summary: string;
  try {
    const response = await getChatModel().invoke(prompt);
    const text = typeof response.content === "string" ? response.content : String(response.content ?? "");
    summary = text.trim().slice(0, MAX_SUMMARY_LENGTH);
  } catch (error) {
    throw new AppError(
      "Something went wrong generating the summary. Please try again.",
      "generateConversationSummary invoke failed",
      error,
    );
  }

  if (!summary) {
    throw new AppError(
      "The AI didn't return a summary. Please try again.",
      "generateConversationSummary empty response",
    );
  }

  const generatedAt = new Date().toISOString();
  const { error } = await supabase
    .from("conversations")
    .update({
      ai_summary: summary,
      ai_summary_generated_at: generatedAt,
      ai_summary_message_count: messages.length,
    })
    .eq("business_id", businessId)
    .eq("id", conversationId);

  if (error) {
    throw new AppError(
      "Something went wrong saving the summary. Please try again.",
      "generateConversationSummary save failed",
      error,
    );
  }

  return { summary, messageCount: messages.length, generatedAt };
}
