import "server-only";
import { sendEmail } from "@/lib/email-sender";
import { renderBrandedEmail } from "@/lib/email-template";
import { logEvent } from "@/lib/logger";

/**
 * An operational alert for the platform owner: an "error"-level log line
 * (Sentry alert rules key off `event`) plus, when OPS_ALERT_EMAIL is set, an
 * email. Throttled per `throttleKey` in process memory (default one per hour):
 * inside the window the event is still logged, but at "info" level and with no
 * email, so a sustained failure (every chat turn of a capped tenant, every
 * read during a database outage) is one Sentry event and one email per window,
 * not thousands.
 *
 * Never throws. Never include a secret or a prospect's message in `facts`.
 */
const lastAlertAt = new Map<string, number>();
const MAX_THROTTLE_KEYS = 1_000;
const DEFAULT_THROTTLE_MS = 60 * 60 * 1000;

export async function sendOpsAlert(params: {
  event: string;
  businessId: string;
  subject: string;
  paragraphs: string[];
  facts: { label: string; value: string }[];
  /** Same key within `throttleMs` = info-level log only, no email. */
  throttleKey?: string;
  throttleMs?: number;
  nowMs?: number;
}): Promise<void> {
  const factsForLog = Object.fromEntries(params.facts.map((fact) => [fact.label, fact.value.slice(0, 200)]));
  const now = params.nowMs ?? Date.now();

  if (params.throttleKey) {
    const previous = lastAlertAt.get(params.throttleKey);
    if (previous !== undefined && now - previous < (params.throttleMs ?? DEFAULT_THROTTLE_MS)) {
      logEvent(params.event, params.businessId, { ...factsForLog, throttled: true }, "info");
      return;
    }
    if (lastAlertAt.size >= MAX_THROTTLE_KEYS) lastAlertAt.clear();
    lastAlertAt.set(params.throttleKey, now);
  }

  logEvent(params.event, params.businessId, factsForLog, "error");

  const to = process.env.OPS_ALERT_EMAIL?.trim();
  if (!to) return;
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
