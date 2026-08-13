/**
 * postMessage protocol between this embed page (inside the iframe) and
 * public/widget-loader.js (running in the host page's own context).
 *
 * public/widget-loader.js cannot import this file -- it is plain JS with no
 * build step -- so its copy of these message shapes is a deliberate,
 * hand-kept-in-sync duplicate, not shared via import.
 *
 * The loader, not this page, performs the real /api/chat fetch: only the
 * loader's request carries the host page's genuine Origin header, which is
 * what lib/widget-auth.ts's per-business origin check depends on.
 */

export type WidgetResizeMessage = {
  type: "widget:resize";
  width: number;
  height: number;
};

export type WidgetViewportMessage = {
  type: "widget:viewport";
  width: number;
  height: number;
};

export type WidgetSendMessage = {
  type: "widget:send";
  requestId: string;
  text: string;
};

export type WidgetResponseMessage = {
  type: "widget:response";
  requestId: string;
  conversationId: string;
  answer: string;
  escalate: boolean;
};

export type WidgetErrorKind = "unauthorized" | "rate_limited" | "failure";

export type WidgetErrorMessage = {
  type: "widget:error";
  requestId: string;
  kind: WidgetErrorKind;
};

export type FromParentMessage = WidgetViewportMessage | WidgetResponseMessage | WidgetErrorMessage;
export type ToParentMessage = WidgetResizeMessage | WidgetSendMessage;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseFromParentMessage(data: unknown): FromParentMessage | null {
  if (!isPlainObject(data) || typeof data.type !== "string") return null;

  switch (data.type) {
    case "widget:viewport":
      if (typeof data.width === "number" && typeof data.height === "number") {
        return { type: "widget:viewport", width: data.width, height: data.height };
      }
      return null;
    case "widget:response":
      if (
        typeof data.requestId === "string" &&
        typeof data.conversationId === "string" &&
        typeof data.answer === "string" &&
        typeof data.escalate === "boolean"
      ) {
        return {
          type: "widget:response",
          requestId: data.requestId,
          conversationId: data.conversationId,
          answer: data.answer,
          escalate: data.escalate,
        };
      }
      return null;
    case "widget:error":
      if (
        typeof data.requestId === "string" &&
        (data.kind === "unauthorized" || data.kind === "rate_limited" || data.kind === "failure")
      ) {
        return { type: "widget:error", requestId: data.requestId, kind: data.kind };
      }
      return null;
    default:
      return null;
  }
}

/**
 * The host page's origin is arbitrary and unknown to this iframe in advance
 * (that is the entire point of an embeddable widget) -- so the outgoing
 * target origin here is "*". This is safe because the payloads sent up
 * (resize dimensions, the prospect's own composed message text) are not
 * secret from the host page: the host page already fully controls this
 * iframe's embed and, in the "widget:send" case, the text originated from
 * this same page's own composer in the first place. Messages received FROM
 * the parent are validated by event.source === window.parent (the loader
 * created this iframe, so only it can be window.parent) rather than by
 * origin, for the same reason -- see message-listener call sites.
 */
export function postToParent(message: ToParentMessage): void {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage(message, "*");
}
