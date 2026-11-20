/**
 * Widget reliability item 2 (STATE.md 2026-11-20): which public widget
 * requests may touch an existing conversation.
 *
 * `business_id` already comes only from the resolved widget key (every query
 * is `.eq("business_id", ...)`), so a different key can never reach another
 * business's conversation. This adds the visitor: restore, poll and chat
 * continuation only act on a conversation whose stored `visitor_id` equals the
 * `visitorId` the loader sends. The visitor id is a client-generated,
 * unauthenticated correlation id (docs/security.md §4) -- a second fence
 * behind the unguessable conversation UUID, not an identity. A conversation
 * with no stored visitor (pre-Phase-25d rows) or a request without one never
 * matches: the visitor simply starts a fresh conversation.
 *
 * Pure, no I/O.
 */
export function conversationBelongsToVisitor(
  conversation: { visitor_id: string | null } | null | undefined,
  visitorId: string | null | undefined,
): boolean {
  if (!conversation) return false;
  const stored = conversation.visitor_id;
  if (typeof stored !== "string" || stored.length === 0) return false;
  if (typeof visitorId !== "string" || visitorId.length === 0) return false;
  return stored === visitorId;
}
