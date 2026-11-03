/**
 * Pure WhatsApp Cloud API rules (production readiness, item 4): the 24-hour
 * window, how a send is made (text vs template), how Graph errors are
 * classified, and the status-callback shape. No server-only import.
 *
 * Error codes: Meta's "Cloud API error codes" reference. 131047 is
 * "Re-engagement message" (more than 24 hours since the customer last
 * replied); 1320xx are template errors; 131026 is "Message undeliverable".
 */
import { isWithinMessagingWindow } from "@/lib/meta-instagram-rules";

/** Same 24-hour rule as Instagram's (lib/meta-instagram-rules.ts). */
export function isWithinWhatsappWindow(lastInboundAt: string | Date | null, now: Date): boolean {
  return isWithinMessagingWindow(lastInboundAt, now);
}

export type WhatsappTemplateRef = { name: string; language: string; params: string[] };

export type SendDecision =
  | { kind: "text" }
  | { kind: "template"; template: WhatsappTemplateRef }
  /** Window closed and the notice has a template kind, but no approved template is configured. */
  | { kind: "blocked"; reason: "template_not_configured" }
  /** Window closed and this message (a free-form staff/AI reply) can't be sent as a template. */
  | { kind: "blocked"; reason: "outside_24h_window" };

export function decideWhatsappSend(input: {
  withinWindow: boolean;
  templateKind: string | null;
  template: WhatsappTemplateRef | null;
}): SendDecision {
  if (input.withinWindow) return { kind: "text" };
  if (input.template) return { kind: "template", template: input.template };
  if (input.templateKind) return { kind: "blocked", reason: "template_not_configured" };
  return { kind: "blocked", reason: "outside_24h_window" };
}

export function buildWhatsappPayload(
  to: string,
  send: { kind: "text"; text: string } | { kind: "template"; template: WhatsappTemplateRef },
): Record<string, unknown> {
  if (send.kind === "text") {
    return { messaging_product: "whatsapp", to, type: "text", text: { body: send.text } };
  }
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: send.template.name,
      language: { code: send.template.language },
      components:
        send.template.params.length > 0
          ? [{ type: "body", parameters: send.template.params.map((text) => ({ type: "text", text })) }]
          : [],
    },
  };
}

export type WhatsappGraphError = { code: number | null; subcode: number | null };

/** Reads `{ error: { code, error_subcode } }` without trusting its shape. Never returns message text. */
export function readWhatsappGraphError(body: unknown): WhatsappGraphError {
  if (!body || typeof body !== "object") return { code: null, subcode: null };
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return { code: null, subcode: null };
  const { code, error_subcode } = error as { code?: unknown; error_subcode?: unknown };
  return {
    code: typeof code === "number" ? code : null,
    subcode: typeof error_subcode === "number" ? error_subcode : null,
  };
}

export type WhatsappSendErrorClass =
  /** 131047: the window closed between our check and the send. */
  | "outside_window"
  /** Template missing, paused, wrong params, wrong language ... -- fix the template, don't retry. */
  | "template_error"
  /** The number can't receive this (not on WhatsApp, blocked, unsupported) -- don't retry. */
  | "recipient_unreachable"
  /** Token revoked/invalid or missing permission -- don't retry; the business must reconnect. */
  | "auth"
  /** Throttling: retry with backoff. */
  | "rate_limited"
  /** 5xx / Meta-side temporary errors / network: retry with backoff. */
  | "transient"
  /** Any other 4xx: our request is wrong; retrying won't help. */
  | "permanent";

const TEMPLATE_ERROR_CODES = new Set([132000, 132001, 132005, 132007, 132012, 132015, 132016, 132068, 132069]);
const RECIPIENT_CODES = new Set([131026, 131021, 131051, 131052, 131053, 131045, 131009]);
const RATE_LIMIT_CODES = new Set([4, 80007, 130429, 131048, 131056]);
const TRANSIENT_CODES = new Set([1, 2, 131000, 131016, 133004]);
const AUTH_CODES = new Set([0, 3, 10, 190, 200, 131005, 131031]);

export function classifyWhatsappSendError(httpStatus: number, error: WhatsappGraphError): WhatsappSendErrorClass {
  const code = error.code;
  if (code === 131047) return "outside_window";
  if (code !== null && (TEMPLATE_ERROR_CODES.has(code) || (code >= 132000 && code < 133000))) return "template_error";
  if (code !== null && RECIPIENT_CODES.has(code)) return "recipient_unreachable";
  if (code !== null && RATE_LIMIT_CODES.has(code)) return "rate_limited";
  if (code !== null && TRANSIENT_CODES.has(code)) return "transient";
  if (code !== null && AUTH_CODES.has(code)) return "auth";
  if (httpStatus === 429) return "rate_limited";
  if (httpStatus === 0 || httpStatus >= 500) return "transient";
  if (httpStatus === 401 || httpStatus === 403) return "auth";
  return "permanent";
}

export function isRetryableWhatsappError(errorClass: WhatsappSendErrorClass): boolean {
  return errorClass === "rate_limited" || errorClass === "transient";
}

// ------------------------------------------------------------ status callbacks

export type WhatsappStatusUpdate = {
  waMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestampMs: number | null;
  errorCode: number | null;
};

const STATUS_VALUES = new Set(["sent", "delivered", "read", "failed"]);

/** `value.statuses` from a WhatsApp webhook -> validated updates. Unknown shapes are dropped. */
export function extractWhatsappStatuses(raw: unknown): WhatsappStatusUpdate[] {
  if (!Array.isArray(raw)) return [];
  const updates: WhatsappStatusUpdate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, status, timestamp, errors } = item as { id?: unknown; status?: unknown; timestamp?: unknown; errors?: unknown };
    if (typeof id !== "string" || id.length === 0 || id.length > 200) continue;
    if (typeof status !== "string" || !STATUS_VALUES.has(status)) continue;
    const seconds = typeof timestamp === "string" ? Number.parseInt(timestamp, 10) : typeof timestamp === "number" ? timestamp : NaN;
    const firstError = Array.isArray(errors) && errors[0] && typeof errors[0] === "object" ? (errors[0] as { code?: unknown }) : null;
    updates.push({
      waMessageId: id,
      status: status as WhatsappStatusUpdate["status"],
      timestampMs: Number.isFinite(seconds) ? seconds * 1000 : null,
      errorCode: firstError && typeof firstError.code === "number" ? firstError.code : null,
    });
  }
  return updates;
}

/** Statuses only move forward (a late "delivered" must not overwrite "read"); "failed" always wins. */
export function shouldApplyStatus(current: WhatsappStatusUpdate["status"] | null, next: WhatsappStatusUpdate["status"]): boolean {
  if (next === "failed") return current !== "failed";
  if (current === "failed") return false;
  const order = { sent: 1, delivered: 2, read: 3 } as const;
  return current === null || order[next] > order[current];
}

/**
 * What the staff member sees under the composer when their WhatsApp reply
 * was saved but not delivered. undefined = sent (or queued for a retry).
 */
export function whatsappStaffReplyNotice(reason: string | undefined): string | undefined {
  switch (reason) {
    case undefined:
    case "retry_scheduled":
      return undefined;
    case "outside_24h_window":
    case "template_not_configured":
      return "Saved, but not sent: WhatsApp only allows free-form replies within 24 hours of the customer's last message. They need to message you first, or reach them another way.";
    case "no_credentials":
    case "auth":
      return "Saved, but not sent: WhatsApp rejected our access. Reconnect WhatsApp on the WhatsApp page.";
    case "recipient_unreachable":
      return "Saved, but not sent: WhatsApp says this number can't receive messages.";
    case "whatsapp_not_allowed":
      return "Saved, but not sent: WhatsApp needs an active free trial or a Growth or Scale plan. See Billing.";
    default:
      return "Saved, but not sent: WhatsApp rejected the message. The conversation has been flagged.";
  }
}
