/**
 * Pure message-list transitions for a streamed widget turn (design §e),
 * extracted from the React hook so the "many chunks become exactly one
 * bubble" rule is unit-testable without a DOM. Each function is a pure
 * (messages -> messages) transform keyed by the assistant placeholder's id,
 * so a delta can only ever extend the single bubble dispatchSend() created
 * for this turn -- never spawn another.
 *
 * Generic over the message shape (it only touches `id`/`content` plus the
 * fields a `patch` carries) so it has no import cycle with the hook's own
 * ChatMessage type; the hook applies these with ChatMessage.
 */

/** Appends a streamed text chunk to one message, by id. All other messages, and every other field of the target, are untouched -- the bubble grows in place. */
export function appendStreamDelta<T extends { id: string; content: string }>(
  messages: T[],
  id: string,
  text: string,
): T[] {
  return messages.map((message) => (message.id === id ? { ...message, content: message.content + text } : message));
}

/** Merges terminal fields (e.g. escalate, recommendedProducts) onto one message by id -- the clean end of a stream. The accumulated content is left exactly as the deltas built it. */
/**
 * Guardrails Phase 4: replaces the whole content of a streaming message with
 * `text` -- the server found a problem after some of the answer was already
 * shown, so the partial text is swapped for the safe reply.
 */
export function retractStreamMessage<T extends { id: string; content: string }>(messages: T[], id: string, text: string): T[] {
  return messages.map((message) => (message.id === id ? { ...message, content: text } : message));
}

export function finalizeStreamMessage<T extends { id: string }>(messages: T[], id: string, patch: Partial<T>): T[] {
  return messages.map((message) => (message.id === id ? { ...message, ...patch } : message));
}

/**
 * Finalizes an interrupted/aborted stream: the partial text already shown
 * is kept as a normal (if short) reply, but a bubble that never received a
 * single delta is removed, so a cancelled-before-first-token turn leaves no
 * empty bubble behind. Never marks an error -- a visitor who pressed stop,
 * or a dropped connection after some text, is not a failure to surface.
 */
export function finalizeAbortedStream<T extends { id: string; content: string }>(messages: T[], id: string): T[] {
  return messages.filter((message) => !(message.id === id && message.content === ""));
}
