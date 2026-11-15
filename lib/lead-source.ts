/**
 * Display helpers for lead / contact data shown in the customer dashboard.
 * Pure and display-only: stored values are never changed, so these are safe
 * to import from server and client components alike.
 */

/**
 * `leads.source` records how a lead was captured: the channel for leads the
 * AI extracted from a conversation, or the tool that created it
 * (`lib/tools/book-appointment.ts`, `lib/tools/request-callback.ts`). Raw tool
 * names must never reach customers, so every value gets a human label.
 */
const LEAD_SOURCE_LABEL: Record<string, string> = {
  chat_widget: "Website",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  book_appointment_tool: "Booked an appointment",
  request_callback_tool: "Asked for a callback",
  dashboard_test: "Test chat",
};

export function leadSourceLabel(source: string | null | undefined): string {
  if (!source) return "Website";
  const known = LEAD_SOURCE_LABEL[source];
  if (known) return known;
  // Unknown future value: humanise rather than show the raw identifier.
  const words = source.replace(/_tool$/, "").replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Website";
}

/** Values the AI or a form sometimes stores when no real name was given. */
const PLACEHOLDER_NAMES = new Set(["not provided", "unknown", "n/a", "na", "none", "null", "-", "anonymous"]);

/** The contact's real name, or `null` when the stored value is empty or a placeholder. */
export function displayContactName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  if (!trimmed || PLACEHOLDER_NAMES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

/** Label for a conversation with no named contact, by channel. */
export function anonymousContactLabel(source: string | null | undefined): string {
  if (source === "whatsapp") return "WhatsApp contact";
  if (source === "instagram") return "Instagram contact";
  if (source === "dashboard_test") return "Test chat";
  return "Website visitor";
}
