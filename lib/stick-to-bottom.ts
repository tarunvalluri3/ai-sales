/**
 * Widget reliability item 6 (STATE.md 2026-11-20): chat auto-scroll rules,
 * shared by the widget and the dashboard/onboarding test chat. Pure, so the
 * decisions are unit-tested without a DOM; lib/use-stick-to-bottom.ts applies
 * them.
 *
 *  - The reader is "at the bottom" within NEAR_BOTTOM_PX of the end.
 *  - A new message the reader sent themselves always scrolls to it.
 *  - Any other new message (AI reply, staff reply) scrolls only when the
 *    reader is at the bottom; otherwise a "New message" pill appears and the
 *    view does not jump.
 *  - Content that grows in place (a streaming reply, an image loading) keeps
 *    the view pinned only while the reader is at the bottom.
 */

export const NEAR_BOTTOM_PX = 80;

export type ScrollMetrics = { scrollHeight: number; scrollTop: number; clientHeight: number };

export function isNearBottom(metrics: ScrollMetrics, threshold = NEAR_BOTTOM_PX): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold;
}

export type NewMessageDecision = "scroll" | "show_pill";

export function decideOnNewMessage(input: { atBottom: boolean; ownMessage: boolean }): NewMessageDecision {
  if (input.ownMessage || input.atBottom) return "scroll";
  return "show_pill";
}

export function shouldFollowGrowth(atBottom: boolean): boolean {
  return atBottom;
}
