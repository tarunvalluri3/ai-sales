import "server-only";
import { sendEmail } from "@/lib/email-sender";
import { renderBrandedEmail } from "@/lib/email-template";
import { logEvent } from "@/lib/logger";

/**
 * An operational alert for the platform owner: an "error"-level log line
 * (Sentry alert rules key off `event`) plus, when OPS_ALERT_EMAIL is set, an
 * email. Throttled per `throttleKey` in process memory so a sustained failure
 * (e.g. every chat turn failing to read a subscription) sends one email per
 * window, not thousands. The log line is never throttled.
 *
 * Never throws. Never include a secret or a prospect's message in `facts`.
 */
const lastSentAt = new Map<string, number>();
const MAX_THROTTLE_KEYS = 1_000;

export async function sendOpsAlert(params: {
  event: string;
  businessId: string;
  subject: string;
  paragraphs: string[];
  facts: { label: string; value: string }[];
  /** Same key within `throttleMs` = log only, no second email. */
  throttleKey?: string;
  throttleMs?: number;
  nowMs?: number;
}): Promise<void> {
  const factsForLog = Object.fromEntries(params.facts.map((fact) => [fact.label, fact.value.slice(0, 200)]));
  logEvent(params.event, params.businessId, factsForLog, "error");

  const to = process.env.OPS_ALERT_EMAIL?.trim();
  if (!to) return;

  const now = params.nowMs ?? Date.now();
  if (params.throttleKey) {
    const previous = lastSentAt.get(params.throttleKey);
    if (previous !== undefined && now - previous < (params.throttleMs ?? 60 * 60 * 1000)) return;
    if (lastSentAt.size >= MAX_THROTTLE_KEYS) lastSentAt.clear();
    lastSentAt.set(params.throttleKey, now);
  }

  try {
    await sendEmail({
      to,
      subject: params.subject,
      email: renderBrandedEmail({ heading: params.subject, paragraphs: params.paragraphs, facts: params.facts }),
    });
  } catch {
    logEvent("ops_alert_email_failed", params.businessId, { alert: params.event }, "error");
  }
}
