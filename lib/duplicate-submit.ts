/**
 * Phase 32, Stage C (STATE.md): the pure duplicate-submit detector. A
 * double-tapped send button or a client retry loop re-posts the same message
 * within seconds; without this it costs the tenant a second AI reply against
 * their quota for an answer they were already given.
 *
 * Deliberately NOT "server-only" and free of any I/O, for the same reason
 * lib/chat-stream.ts / lib/abuse-limits.ts are: scripts/run-abuse-limit-tests.mjs
 * exercises it directly. lib/rag.ts's prepareTurn() calls it over the history
 * it already holds in memory.
 */

/** The in-memory history shape this detector needs -- a structural subset of lib/rag.ts's ConversationMessage, plus the created_at the detector's time window requires. */
export type DupGuardMessage = { role: "user" | "assistant"; content: string; created_at?: string };

/** A re-post within this window of the prior identical message is treated as a duplicate submit. */
export const DUPLICATE_SUBMIT_WINDOW_MS = 60_000;

/** Trim, collapse internal whitespace, lowercase -- so "  Return  Policy " and "return policy" compare equal. */
export function normalizeSubmitText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Detects an immediate duplicate submit and returns the stored assistant
 * reply to replay, or null. All three conditions must hold (decision/Stage C):
 *
 *  1. the most recent assistant reply in `history` answered a user message
 *     whose normalized text equals `question`,
 *  2. that user message arrived within DUPLICATE_SUBMIT_WINDOW_MS of `now`, and
 *  3. an assistant reply already exists after it (it is, by construction, the
 *     message immediately following that user turn).
 *
 * A genuine re-ask of the same question minutes later falls outside the window
 * and is NOT replayed -- it gets a fresh answer. A question that has not been
 * answered yet (no assistant message after it) is NOT replayed either.
 */
export function findDuplicateSubmitReply(
  question: string,
  history: DupGuardMessage[],
  now: number = Date.now(),
): { answer: string } | null {
  const normalizedQuestion = normalizeSubmitText(question);
  if (normalizedQuestion.length === 0) return null;

  // The most recent assistant message, and the user turn right before it.
  let lastAssistantIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }
  // <= 0 means no assistant message, or one with nothing before it.
  if (lastAssistantIdx <= 0) return null;

  const assistantMsg = history[lastAssistantIdx];
  const precedingUser = history[lastAssistantIdx - 1];
  if (precedingUser.role !== "user") return null;
  if (normalizeSubmitText(precedingUser.content) !== normalizedQuestion) return null;

  if (!precedingUser.created_at) return null;
  const arrivedAt = Date.parse(precedingUser.created_at);
  if (Number.isNaN(arrivedAt)) return null;
  const age = now - arrivedAt;
  if (age < 0 || age > DUPLICATE_SUBMIT_WINDOW_MS) return null;

  const answer = assistantMsg.content;
  if (!answer || answer.trim().length === 0) return null;
  return { answer };
}
