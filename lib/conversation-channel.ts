/**
 * Human label for a conversation's `source` -- shared by the chat-list
 * pane and the conversation detail page's info panel (2026-09-11 inbox
 * redesign). Deliberately not exhaustive: an unrecognized value (e.g. a
 * future "instagram") falls back to the raw source string, so a new
 * channel reads sensibly immediately, with no code change here.
 */
const CHANNEL_LABEL: Record<string, string> = {
  chat_widget: "Website",
  whatsapp: "WhatsApp",
};

export function channelLabel(source: string | null): string {
  return source ? (CHANNEL_LABEL[source] ?? source) : "Website";
}
