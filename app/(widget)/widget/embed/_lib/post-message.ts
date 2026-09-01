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
  consentGiven: boolean;
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

/**
 * Sent by this iframe to the loader on every panel open/close change
 * (Phase 15b), including the initial `false` on mount -- the loader
 * uses this to decide whether it's worth polling for a staff reply at
 * all (see public/widget-loader.js's schedulePoll()).
 */
export type WidgetPanelOpenMessage = {
  type: "widget:panel_open";
  open: boolean;
};

/**
 * Sent by the loader to this iframe whenever a poll (public/widget-loader.js)
 * finds new non-prospect messages (Phase 15b) -- only 'assistant'/
 * 'human_agent' roles ever appear here; the widget never needs the
 * server to tell it about its own prospect-authored messages.
 */
export type WidgetPollResultMessage = {
  type: "widget:poll_result";
  messages: { id: string; role: "assistant" | "human_agent"; content: string }[];
};

/**
 * Sent by the loader to this iframe once, right after it fetches
 * /api/chat/restore for a conversationId found in localStorage (Phase
 * 25a) -- unlike widget:poll_result, this carries the full transcript
 * including the prospect's own prior 'user' messages, since there is no
 * existing local state to diff against yet.
 */
export type WidgetRestoreMessage = {
  type: "widget:restore";
  messages: { id: string; role: "user" | "assistant" | "human_agent"; content: string }[];
};

/**
 * Sent by this iframe to the loader (Phase 25d "start new chat"): the
 * loader clears its own stored conversation id and resets all
 * loader-owned send/poll state, so the next "widget:send" creates a
 * genuinely fresh conversation. Purely a request -- there is no reply,
 * the iframe clears its own message list itself.
 */
export type WidgetNewChatMessage = {
  type: "widget:new_chat";
};

/**
 * Sent by this iframe to the loader (Phase 25d "view recent chats"):
 * only the loader can make the authorized /api/chat/recent fetch (same
 * constraint as every other request -- see this file's own doc comment
 * on why the loader, not this iframe, owns every real network call).
 */
export type WidgetRecentChatsRequestMessage = {
  type: "widget:recent_chats_request";
};

/**
 * Sent by the loader back to this iframe with the result of a
 * "widget:recent_chats_request". `conversations` is empty (not an
 * error) when this visitor has no other conversations, or when the
 * request itself failed -- the widget UI treats both the same way (Phase
 * 25d), since distinguishing them isn't worth a second message type.
 */
export type WidgetRecentChatsResultMessage = {
  type: "widget:recent_chats_result";
  conversations: { id: string; createdAt: string; preview: string | null }[];
};

/**
 * Sent by this iframe to the loader when the prospect picks a
 * conversation from "view recent chats" (Phase 25d). The loader stores
 * this as the new active conversation id and re-runs the same
 * /api/chat/restore fetch it already does on page load, replying with a
 * fresh "widget:restore" -- selecting a past conversation reuses the
 * existing restore mechanism rather than introducing a second one.
 */
export type WidgetSwitchConversationMessage = {
  type: "widget:switch_conversation";
  conversationId: string;
};

export type FromParentMessage =
  | WidgetViewportMessage
  | WidgetResponseMessage
  | WidgetErrorMessage
  | WidgetPollResultMessage
  | WidgetRestoreMessage
  | WidgetRecentChatsResultMessage;
export type ToParentMessage =
  | WidgetResizeMessage
  | WidgetSendMessage
  | WidgetPanelOpenMessage
  | WidgetNewChatMessage
  | WidgetRecentChatsRequestMessage
  | WidgetSwitchConversationMessage;

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
    case "widget:poll_result":
      if (Array.isArray(data.messages)) {
        const messages = data.messages.filter(
          (message): message is WidgetPollResultMessage["messages"][number] =>
            isPlainObject(message) &&
            typeof message.id === "string" &&
            (message.role === "assistant" || message.role === "human_agent") &&
            typeof message.content === "string",
        );
        return { type: "widget:poll_result", messages };
      }
      return null;
    case "widget:restore":
      if (Array.isArray(data.messages)) {
        const messages = data.messages.filter(
          (message): message is WidgetRestoreMessage["messages"][number] =>
            isPlainObject(message) &&
            typeof message.id === "string" &&
            (message.role === "user" || message.role === "assistant" || message.role === "human_agent") &&
            typeof message.content === "string",
        );
        return { type: "widget:restore", messages };
      }
      return null;
    case "widget:recent_chats_result":
      if (Array.isArray(data.conversations)) {
        const conversations = data.conversations.filter(
          (conversation): conversation is WidgetRecentChatsResultMessage["conversations"][number] =>
            isPlainObject(conversation) &&
            typeof conversation.id === "string" &&
            typeof conversation.createdAt === "string" &&
            (conversation.preview === null || typeof conversation.preview === "string"),
        );
        return { type: "widget:recent_chats_result", conversations };
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
