import "server-only";
import { z } from "zod";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getNotificationPreference } from "@/lib/notification-preferences";
import { sendCategoryNotificationEmail } from "@/lib/notifications";
import { logEvent } from "@/lib/logger";
import type { NotificationCategory } from "@/lib/supabase/types";

/**
 * The one entry point every business-important event calls.
 *
 * Why it exists: before this, a new lead, an AI escalation to a human and an
 * SLA breach produced no notification of any kind -- the most urgent event in
 * the product was visible only as a sidebar badge. Each event that did notify
 * re-implemented its own API-key check, contact_email lookup and logging, and
 * that duplication is how two senders ended up without reply routing in the
 * first place (see the 2026-10-19 email work).
 *
 * The contract, in one sentence: **always write the in-app row, then decide
 * about email** -- so turning email off can never make an event invisible,
 * which is precisely the failure this feature was built to fix.
 *
 * NEVER THROWS, matching lib/email-sender.ts's existing contract. Every call
 * site is inside `after()` or a cron loop where a rejected promise would be an
 * unhandled rejection, and a notification must never turn a successful booking
 * or chat reply into an error. Callers therefore need no `.catch()`.
 *
 * NOT for prospect-facing mail. Preferences here govern what the *business*
 * receives; an email to a prospect (an appointment confirmation, a stalled-lead
 * follow-up) must go straight to lib/notifications.ts instead, or a business
 * muting its own alerts would silently stop mail to its customers.
 */

/** Matches internal_notifications_message_length (1..500) in 20260914060000. */
const MAX_MESSAGE_LENGTH = 500;

export type DispatchNotificationInput = {
  businessId: string;
  category: NotificationCategory;
  /** Truncated to 500 chars rather than rejected -- prospect-supplied text is interpolated into this. */
  message: string;
  link?: string | null;
  /**
   * Immediate-email payload, mapped 1:1 onto renderBrandedEmail()'s props.
   * Omit it and this is in-app only whatever the preference says: a category
   * with no email body has nothing to send.
   */
  email?: {
    subject: string;
    heading: string;
    paragraphs?: string[];
    facts?: { label: string; value: string }[];
    cta?: { label: string; url: string };
    /** Usually the prospect, so replying to the alert reaches them directly. */
    replyTo?: string | null;
  };
  /**
   * Client injection, same reasoning as sendWorkflowNotificationEmail(): widget
   * callers (chat route, AI tools) already hold a service-role client, dashboard
   * callers a Clerk-session one. Both satisfy the insert policy because
   * business_id always matches. Defaults to service-role for cron callers.
   */
  supabase?: ReturnType<typeof createServiceSupabaseClient>;
};

export type DispatchNotificationResult = {
  inApp: "written" | "skipped_preference" | "failed";
  email:
    | "sent"
    | "deferred_to_digest"
    | "skipped_preference"
    | "skipped_no_email_payload"
    | "skipped_no_contact_email"
    | "skipped_no_api_key"
    | "suppressed"
    | "failed";
};

const dispatchSchema = z.object({
  businessId: z.string().uuid(),
  category: z.enum([
    "workflow",
    "lead_created",
    "human_handover",
    "appointment_request",
    "appointment_status",
    "sla_breach",
    "assignment",
  ]),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  link: z.string().trim().min(1).nullable().optional(),
});

export async function dispatchNotification(input: DispatchNotificationInput): Promise<DispatchNotificationResult> {
  try {
    // Truncate BEFORE validating: an over-long interpolated prospect message
    // should still notify, just shortened, rather than fail the whole dispatch.
    const parsed = dispatchSchema.safeParse({
      businessId: input.businessId,
      category: input.category,
      message: input.message.trim().slice(0, MAX_MESSAGE_LENGTH),
      link: input.link ?? null,
    });

    if (!parsed.success) {
      logEvent("notification_dispatch_invalid", input.businessId ?? "unknown", { category: input.category }, "error");
      return { inApp: "failed", email: "failed" };
    }

    const { businessId, category, message, link } = parsed.data;
    const supabase = input.supabase ?? createServiceSupabaseClient();
    const preference = await getNotificationPreference(supabase, businessId, category);

    let inApp: DispatchNotificationResult["inApp"] = "skipped_preference";
    if (preference.inAppEnabled) {
      // workflow_run_id and step_index are deliberately left null. Null/null is
      // distinct under the unique (workflow_run_id, step_index) index, so these
      // rows coexist without limit and without touching the workflow engine's
      // own idempotency mechanism -- which is why the engine still inserts
      // directly instead of coming through here.
      const { error } = await supabase.from("internal_notifications").insert({
        business_id: businessId,
        category,
        message,
        link: link ?? null,
      });

      if (error) {
        logEvent("notification_dispatch_in_app_failed", businessId, { category }, "error");
        inApp = "failed";
      } else {
        inApp = "written";
      }
    }

    // Continue to email even if the in-app insert failed -- they are independent
    // deliveries and one failing is no reason to drop the other.
    if (!input.email) return { inApp, email: "skipped_no_email_payload" };
    if (preference.emailMode === "off") return { inApp, email: "skipped_preference" };
    if (preference.emailMode === "digest") return { inApp, email: "deferred_to_digest" };

    const email = await sendCategoryNotificationEmail(supabase, businessId, category, input.email);
    return { inApp, email };
  } catch {
    // Belt and braces: supabase-js returns errors rather than throwing and
    // sendEmail() never throws, so reaching here means something genuinely
    // unexpected. Still must not propagate.
    logEvent("notification_dispatch_failed", input.businessId ?? "unknown", { category: input.category }, "error");
    return { inApp: "failed", email: "failed" };
  }
}
