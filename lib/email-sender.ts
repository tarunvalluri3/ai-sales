import "server-only";
import { Resend } from "resend";
import { isEmailSuppressed } from "@/lib/email-suppression";
import type { BrandedEmail } from "@/lib/email-template";

/**
 * The single path every email in this app now leaves through.
 *
 * Before this, each of the five senders (four in lib/notifications.ts, one
 * in lib/stalled-leads.ts) re-implemented the same API-key check, the same
 * `new Resend(...)`, and the same from-address fallback. That duplication
 * is how the two prospect-facing senders ended up with no `replyTo` at all:
 * there was no shared place for it to live. Now there is, and a sixth
 * sender gets suppression, identity and reply routing for free.
 *
 * Keeps the contract every caller already relied on: **never throws**, and
 * a missing `RESEND_API_KEY` is a quiet, reportable outcome rather than an
 * error. Callers keep their own logging, since each logs its own event
 * names and some (the stalled-lead sweep) branch on the outcome.
 */

const DEFAULT_FROM = "Waves AI Pilot <onboarding@resend.dev>";

export type SendEmailOutcome = "sent" | "skipped_no_api_key" | "suppressed" | "failed";

export type SendEmailOptions = {
  to: string;
  subject: string;
  email: BrandedEmail;
  /**
   * Set when the recipient is a *prospect* and the mail speaks for a
   * customer business. The display name becomes "Acme Dental via Waves AI
   * Pilot" -- the address stays this app's own verified sending address,
   * since a customer's domain can't be used without that customer
   * verifying it in Resend. Same "X via Y" convention Google Groups uses.
   */
  onBehalfOf?: string;
  /**
   * Where a reply should land. Required in practice whenever `onBehalfOf`
   * is set: both prospect-facing emails invite a reply, and without this it
   * went to the notifications inbox, which nobody reads.
   */
  replyTo?: string | null;
  /**
   * Files to attach -- used by Phase 17c to send the GST invoice or credit
   * note PDF with its email. Goes through the same path as everything else
   * here, so an attachment never bypasses suppression: a burned address is
   * refused before Resend is called, exactly as for a plain email.
   */
  attachments?: { filename: string; content: Uint8Array; contentType?: string }[];
};

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailOutcome> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return "skipped_no_api_key";

  // Checked before Resend sees it. Resend would refuse a burned address
  // itself, but only *after* accepting the API call -- which is exactly
  // how a never-delivered follow-up used to get recorded as sent.
  if (await isEmailSuppressed(options.to)) return "suppressed";

  const configuredFrom = process.env.NOTIFICATION_EMAIL_FROM || DEFAULT_FROM;
  const from = options.onBehalfOf ? fromOnBehalfOf(configuredFrom, options.onBehalfOf) : configuredFrom;
  const replyTo = options.replyTo ? stripLineBreaks(options.replyTo) : undefined;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: options.to,
      subject: stripLineBreaks(options.subject),
      html: options.email.html,
      text: options.email.text,
      ...(replyTo ? { replyTo } : {}),
      ...(options.attachments?.length
        ? {
            attachments: options.attachments.map((file) => ({
              filename: stripLineBreaks(file.filename),
              content: Buffer.from(file.content),
              ...(file.contentType ? { contentType: file.contentType } : {}),
            })),
          }
        : {}),
    });
    return error ? "failed" : "sent";
  } catch {
    return "failed";
  }
}

/**
 * Rebuilds the configured `Name <address>` with a new display name,
 * keeping the verified address.
 *
 * The business name is tenant-supplied and lands in a mail header, so it
 * is treated as hostile: CR/LF are stripped (header injection), and the
 * name is always emitted as an RFC 5322 quoted-string with `\` and `"`
 * escaped, so a name containing `<`, `,` or `"` cannot change which
 * address the message claims to be from.
 */
export function fromOnBehalfOf(configuredFrom: string, businessName: string): string {
  const address = extractAddress(configuredFrom);
  const brand = extractDisplayName(configuredFrom) || "Waves AI Pilot";
  const name = stripLineBreaks(businessName).trim().slice(0, 64) || "A business";
  const display = `${name} via ${brand}`.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${display}" <${address}>`;
}

function extractAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim();
}

function extractDisplayName(from: string): string {
  const index = from.indexOf("<");
  return index > 0 ? from.slice(0, index).trim().replace(/^"|"$/g, "") : "";
}

function stripLineBreaks(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}
