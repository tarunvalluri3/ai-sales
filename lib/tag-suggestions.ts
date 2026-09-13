import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { getChatModel } from "@/lib/rag";
import { listMessagesForConversation } from "@/lib/messages";
import { listTagsForBusiness } from "@/lib/lead-tags";
import { AppError } from "@/lib/errors";
import type { Message } from "@/lib/supabase/types";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const MAX_TRANSCRIPT_CHARS = 8000;
const MAX_SUGGESTIONS = 5;
const MAX_TAG_NAME_LENGTH = 40;

const ROLE_LABEL: Record<Message["role"], string> = {
  user: "Prospect",
  assistant: "AI",
  human_agent: "Team member",
};

function formatTranscript(messages: Message[]): string {
  return messages.map((message) => `${ROLE_LABEL[message.role]}: ${message.content}`).join("\n");
}

/**
 * Suggests up to 5 short tag names for a conversation, grounded only in
 * its own transcript, for a staff member to accept or dismiss -- never
 * applied automatically (AGENTS.md §3 rule 5: AI output is untrusted).
 * Same "plain single-shot invoke(), not the RAG/tool-calling agent loop"
 * pattern as `lib/conversation-summary.ts`'s `generateConversationSummary`
 * -- this is a display-only suggestion, not a step in the live chat path.
 *
 * The business's existing tag catalog is included in the prompt so the
 * model prefers reusing an existing tag over inventing a near-duplicate
 * (e.g. suggesting "Budget-conscious" again when "Price-sensitive"
 * already exists) -- purely a prompt-quality nudge, not enforced; the
 * caller still resolves each returned name against the real catalog by
 * exact case-insensitive match before deciding whether accepting it
 * creates a new tag or reuses one.
 *
 * Returns `[]` (not an error) for an empty conversation -- nothing to
 * ground a suggestion in.
 */
export async function suggestTagsForConversation(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
): Promise<string[]> {
  const [messages, existingTags] = await Promise.all([
    listMessagesForConversation(supabase, businessId, conversationId),
    listTagsForBusiness(businessId),
  ]);

  if (messages.length === 0) {
    return [];
  }

  const transcript = formatTranscript(messages).slice(0, MAX_TRANSCRIPT_CHARS);
  const catalogLine =
    existingTags.length > 0
      ? `This business already uses these tags -- reuse one of them (exact spelling) whenever it genuinely fits, instead of inventing a near-duplicate: ${existingTags.map((tag) => tag.name).join(", ")}.`
      : "This business has no existing tags yet.";

  const prompt = `Suggest up to ${MAX_SUGGESTIONS} short tags (1-3 words each) a sales team could use to organize/segment this lead, based ONLY on what's actually said in the conversation below -- never invent a fact, budget, or timeline that wasn't mentioned. ${catalogLine}

Reply with ONLY the tag names, one per line, no numbering, no explanation, no markdown.

${transcript}`;

  let raw: string;
  try {
    const response = await getChatModel().invoke(prompt);
    raw = typeof response.content === "string" ? response.content : String(response.content ?? "");
  } catch (error) {
    throw new AppError(
      "Something went wrong suggesting tags. Please try again.",
      "suggestTagsForConversation invoke failed",
      error,
    );
  }

  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const line of raw.split("\n")) {
    const name = line.replace(/^[-*\d.)\s]+/, "").trim().slice(0, MAX_TAG_NAME_LENGTH);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push(name);
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }

  return suggestions;
}
