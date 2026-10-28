/**
 * The canonical Server-Sent-Events wire contract for the streaming chat
 * turn (STATE.md, "feat/chat-streaming"), and its encode/parse codec.
 *
 * Deliberately NOT "server-only" and free of any Node/Next import: the
 * route handler (server) imports `encodeStreamEvent` to write the stream,
 * the streaming unit tests import the whole module, and
 * `public/widget-loader.js` keeps a hand-synced copy of `parseSseBuffer`'s
 * framing because it is plain ES5 with no build step and cannot import
 * this file -- exactly the same deliberate-duplicate convention
 * `app/(widget)/widget/embed/_lib/post-message.ts` documents for the
 * postMessage shapes. This module is the one authored source of truth that
 * both the server and the tests exercise directly.
 *
 * Transport decision (design §b): fetch-streaming, not EventSource.
 * EventSource is GET-only and cannot carry the POST body
 * (widgetKey/message/conversationId/consentGiven) or the request shape the
 * per-business Origin-header auth in lib/widget-auth.ts depends on, so the
 * loader reads `response.body` with a reader and parses the SSE framing
 * below itself.
 */

/** An item the recommend_products tool surfaced, as it crosses the wire. Structurally identical to WidgetRecommendedProduct in post-message.ts -- this is the wire boundary's own copy, kept in sync by hand like the postMessage shapes. */
export type StreamRecommendedProduct = {
  type: "product" | "service";
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  priceDisplay: string | null;
  priceAmount: number | null;
  imageUrl: string | null;
};

/** Mid-stream failure kind, mapped to the widget's existing WidgetErrorKind. A pre-generation failure stays an HTTP status (401/429/400) on the response head instead, exactly as the non-streaming path does. */
export type ChatStreamErrorKind = "failure" | "unauthorized" | "rate_limited";

/**
 * One SSE event, by `type`. Ordering on the wire:
 *   1. exactly one `meta`, first, so the loader can store conversationId
 *      and the polling cursor even if the stream then dies mid-answer;
 *   2. zero or more `delta`, the answer text in order;
 *   3. exactly one terminal event -- `final` on success (carrying the
 *      model-judged escalate and the captured recommendedProducts), or
 *      `error` on a mid-stream failure.
 * `grounded` is never on the wire: it never left the server on the
 * non-streaming path either.
 */
export type ChatStreamEvent =
  | { type: "meta"; conversationId: string; asOf: string | null }
  | { type: "delta"; text: string }
  /** Guardrails Phase 4: replace everything shown so far with `text` (the safe reply). */
  | { type: "retract"; text: string }
  | { type: "final"; escalate: boolean; recommendedProducts: StreamRecommendedProduct[]; asOf: string | null }
  | { type: "error"; kind: ChatStreamErrorKind };

/** The SSE media type, in one place so the route and any test agree. */
export const CHAT_STREAM_CONTENT_TYPE = "text/event-stream";

/**
 * The request signal a client uses to opt into streaming. An old,
 * browser-cached widget-loader.js never sends it, so the route answers it
 * with the byte-identical buffered JSON response it always has -- the
 * backward-compatibility guarantee in design §b. Both an `Accept` header
 * and a body flag are accepted so a caller can choose whichever is easier.
 */
export function clientWantsStream(acceptHeader: string | null, bodyStreamFlag: unknown): boolean {
  if (bodyStreamFlag === true) return true;
  return typeof acceptHeader === "string" && acceptHeader.toLowerCase().includes(CHAT_STREAM_CONTENT_TYPE);
}

/**
 * Serializes one event to its SSE frame: a single `data:` line carrying
 * compact JSON, terminated by the blank line SSE requires. JSON on one
 * line is safe because `JSON.stringify` escapes any newline inside a
 * string, so a delta containing "\n" can never forge a frame boundary.
 */
export function encodeStreamEvent(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * A stateful, allocation-light SSE frame parser for the receive side.
 * `push` takes a raw string chunk (already UTF-8 decoded) and returns the
 * complete events it completed; partial trailing data is buffered for the
 * next chunk. Tolerant by contract: a blank frame, a non-`data:` line, or
 * a `data:` line whose payload is not valid JSON or not a known event
 * shape is skipped rather than thrown -- a malformed frame must never
 * surface raw text to a visitor (design §a's "never hand visitors raw
 * JSON"), it is simply dropped.
 */
export class SseBufferParser {
  private buffer = "";

  push(chunk: string): ChatStreamEvent[] {
    this.buffer += chunk;
    const events: ChatStreamEvent[] = [];
    let boundary = this.buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const event = parseFrame(frame);
      if (event) events.push(event);
      boundary = this.buffer.indexOf("\n\n");
    }
    return events;
  }
}

/** Parses a single already-split SSE frame; returns null for anything not a well-formed known event. Exported for direct unit testing. */
export function parseFrame(frame: string): ChatStreamEvent | null {
  // A frame may hold several lines; the data payload is every line after a
  // `data:` prefix, joined per the SSE spec. We only ever emit one
  // `data:` line per event, but tolerate the general shape on receive.
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(line.startsWith("data: ") ? 6 : 5));
    }
  }
  if (dataLines.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(dataLines.join("\n"));
  } catch {
    return null;
  }
  return asChatStreamEvent(parsed);
}

/** Narrows arbitrary parsed JSON to a ChatStreamEvent, or null. The receive-side trust boundary: everything off the wire is validated before use. */
export function asChatStreamEvent(value: unknown): ChatStreamEvent | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  switch (record.type) {
    case "meta":
      if (typeof record.conversationId === "string" && (record.asOf === null || typeof record.asOf === "string")) {
        return { type: "meta", conversationId: record.conversationId, asOf: record.asOf };
      }
      return null;
    case "delta":
      if (typeof record.text === "string") {
        return { type: "delta", text: record.text };
      }
      return null;
    case "final":
      if (typeof record.escalate === "boolean" && (record.asOf === null || typeof record.asOf === "string")) {
        const recommendedProducts = Array.isArray(record.recommendedProducts)
          ? (record.recommendedProducts.filter(isStreamRecommendedProduct) as StreamRecommendedProduct[])
          : [];
        return { type: "final", escalate: record.escalate, recommendedProducts, asOf: record.asOf };
      }
      return null;
    case "error":
      if (record.kind === "failure" || record.kind === "unauthorized" || record.kind === "rate_limited") {
        return { type: "error", kind: record.kind };
      }
      return null;
    default:
      return null;
  }
}

function isStreamRecommendedProduct(value: unknown): value is StreamRecommendedProduct {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    (item.type === "product" || item.type === "service") &&
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    (item.description === null || typeof item.description === "string") &&
    (item.category === null || typeof item.category === "string") &&
    (item.priceDisplay === null || typeof item.priceDisplay === "string") &&
    (item.priceAmount === null || typeof item.priceAmount === "number") &&
    (item.imageUrl === null || typeof item.imageUrl === "string")
  );
}
