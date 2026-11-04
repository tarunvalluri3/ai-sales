import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { formatSlotLabel } from "@/lib/appointments";
import { loadBusinessForNotice, sendAppointmentChannelNotice } from "@/lib/appointment-notifications";
import { sendAppointmentLifecycleEmail } from "@/lib/notifications";
import { dispatchNotification } from "@/lib/notification-dispatch";
import { dispatchWorkflowTrigger } from "@/lib/workflow-engine";
import { getAppUrl } from "@/lib/app-url";
import { logEvent } from "@/lib/logger";
import {
  dueReminderKinds,
  PENDING_EXPIRY,
  reminderCandidateRange,
  type ReminderKind,
} from "@/lib/appointment-lifecycle-rules";
import type { Appointment } from "@/lib/supabase/types";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Appointment follow-through (production readiness, item 5; LAUNCH_AUDIT.md
 * §2 "appointment follow-ups are Missing"). Run every 5 minutes by the
 * scheduler (lib/scheduler/jobs.ts), which also guarantees two runs never
 * overlap. On top of that, every notice goes through the dedup ledger
 * (appointment_notifications, unique appointment + kind + starts_at): the
 * row is inserted BEFORE anything is sent and only the inserter sends, so a
 * retry, an overlapping run or a crash-and-rerun can never send a duplicate.
 *
 *  1. Expiry: pending bookings past pendingExpiresAt() are moved to
 *     'expired' atomically (expire_stale_pending_appointments), freeing the
 *     slot. The prospect is told (email + the conversation's channel, with
 *     the approved WhatsApp template outside the 24-hour window), the owner
 *     is notified, the appointment_status_changed workflow trigger fires and
 *     the stale "confirm appointment" Copilot task is superseded.
 *  2. Reminders: 24 h and 1 h before each CONFIRMED appointment, to the
 *     prospect by email and on their channel.
 *
 * Never throws; per-appointment failures are logged and counted.
 */

const MAX_REMINDER_CANDIDATES = 200;
const EXPIRE_BATCH = 50;

export type AppointmentLifecycleResult = {
  expired: number;
  expiryNoticesSent: number;
  remindersSent: number;
  duplicatesSkipped: number;
  failed: number;
};

type LedgerKind = ReminderKind | "expired";

type BusinessForNotice = { name: string; timezone: string };

export async function runAppointmentLifecycleSweep(now: Date = new Date()): Promise<AppointmentLifecycleResult> {
  const supabase = createServiceSupabaseClient();
  const result: AppointmentLifecycleResult = { expired: 0, expiryNoticesSent: 0, remindersSent: 0, duplicatesSkipped: 0, failed: 0 };
  const businesses = new Map<string, BusinessForNotice>();
  const businessFor = async (businessId: string): Promise<BusinessForNotice> => {
    const cached = businesses.get(businessId);
    if (cached) return cached;
    const loaded = await loadBusinessForNotice(supabase, businessId);
    businesses.set(businessId, loaded);
    return loaded;
  };

  await expirePendingAppointments(supabase, result, businessFor);
  await sendDueReminders(supabase, now, result, businessFor);
  return result;
}

/** Inserts the ledger row first; true only for the caller that inserted it (i.e. the one allowed to send). */
async function claimNotice(
  supabase: ServiceSupabaseClient,
  appointment: Pick<Appointment, "id" | "business_id" | "starts_at">,
  kind: LedgerKind,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("appointment_notifications")
    .upsert(
      { business_id: appointment.business_id, appointment_id: appointment.id, kind, starts_at: appointment.starts_at },
      { onConflict: "appointment_id,kind,starts_at", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`appointment_notifications claim failed (${error.code ?? "unknown"})`);
  return data && data.length > 0 ? (data[0] as { id: string }).id : null;
}

async function completeNotice(
  supabase: ServiceSupabaseClient,
  businessId: string,
  noticeId: string,
  outcomes: { email: string; channel: string },
): Promise<void> {
  await supabase
    .from("appointment_notifications")
    .update({ email_outcome: outcomes.email, channel_outcome: outcomes.channel, completed_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", noticeId);
}

async function expirePendingAppointments(
  supabase: ServiceSupabaseClient,
  result: AppointmentLifecycleResult,
  businessFor: (businessId: string) => Promise<BusinessForNotice>,
): Promise<void> {
  const { data, error } = await supabase.rpc("expire_stale_pending_appointments", {
    p_expire_after_seconds: PENDING_EXPIRY.expireAfterSeconds,
    p_before_start_seconds: PENDING_EXPIRY.beforeStartSeconds,
    p_min_owner_window_seconds: PENDING_EXPIRY.minOwnerWindowSeconds,
    p_limit: EXPIRE_BATCH,
  });
  if (error) {
    logEvent("appointment_expiry_claim_failed", "unknown", {}, "error");
    result.failed++;
    return;
  }

  for (const appointment of (data ?? []) as Appointment[]) {
    result.expired++;
    try {
      const noticeId = await claimNotice(supabase, appointment, "expired");
      if (!noticeId) {
        result.duplicatesSkipped++;
        continue;
      }
      const business = await businessFor(appointment.business_id);
      const label = formatSlotLabel(new Date(appointment.starts_at), business.timezone);

      const email = appointment.contact_email
        ? await sendAppointmentLifecycleEmail(appointment.business_id, appointment.contact_email, "expired", label)
        : "no_address";
      const channel = await sendAppointmentChannelNotice(supabase, appointment.business_id, appointment, {
        templateKind: "appointment_expired",
        content: `We weren't able to confirm your requested appointment for ${label} in time, so the slot has been released. Please get back in touch to book another time.`,
        businessName: business.name,
        slotLabel: label,
      });
      await completeNotice(supabase, appointment.business_id, noticeId, { email, channel });
      result.expiryNoticesSent++;

      // The owner: one in-app notification (and email if their preference says so).
      const reached =
        email === "sent" || channel === "sent"
          ? "We told the prospect."
          : `We could NOT reach the prospect automatically.${appointment.contact_phone ? ` You can call them on ${appointment.contact_phone}.` : ""}`;
      await dispatchNotification({
        businessId: appointment.business_id,
        category: "appointment_status",
        message: `A booking request for ${label} expired because it wasn't confirmed in time. ${reached}`,
        link: "/dashboard/appointments",
        supabase,
        email: {
          subject: `Booking request expired — ${appointment.contact_name ?? "a prospect"}`,
          heading: "A booking request expired",
          paragraphs: [`It wasn't confirmed in time, so the slot for ${label} has been released.`, reached],
          cta: { label: "Open appointments", url: `${getAppUrl()}/dashboard/appointments` },
        },
      });

      await dispatchWorkflowTrigger(
        supabase,
        appointment.business_id,
        "appointment_status_changed",
        {
          type: "conversation",
          id: appointment.conversation_id ?? appointment.id,
          customerId: appointment.customer_id,
          leadId: null,
          conversationId: appointment.conversation_id,
        },
        { status: "expired" },
      );

      if (appointment.customer_id) {
        // Same effect as the dashboard's decline path: nothing left to confirm.
        await supabase
          .from("copilot_actions")
          .update({ status: "superseded", superseded_at: new Date().toISOString(), snoozed_until: null })
          .eq("business_id", appointment.business_id)
          .eq("customer_id", appointment.customer_id)
          .eq("action_type", "confirm_appointment")
          .in("status", ["open", "snoozed"]);
      }

      logEvent("appointment_expired", appointment.business_id, { appointmentId: appointment.id, email, channel });
    } catch {
      result.failed++;
      logEvent("appointment_expiry_notice_failed", appointment.business_id, { appointmentId: appointment.id }, "error");
    }
  }
}

async function sendDueReminders(
  supabase: ServiceSupabaseClient,
  now: Date,
  result: AppointmentLifecycleResult,
  businessFor: (businessId: string) => Promise<BusinessForNotice>,
): Promise<void> {
  const range = reminderCandidateRange(now);
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("status", "confirmed")
    .gt("starts_at", range.from.toISOString())
    .lte("starts_at", range.to.toISOString())
    .order("starts_at", { ascending: true })
    .limit(MAX_REMINDER_CANDIDATES);
  if (error) {
    logEvent("appointment_reminder_read_failed", "unknown", {}, "error");
    result.failed++;
    return;
  }

  for (const appointment of (data ?? []) as Appointment[]) {
    for (const kind of dueReminderKinds(new Date(appointment.starts_at), now)) {
      try {
        const noticeId = await claimNotice(supabase, appointment, kind);
        if (!noticeId) {
          result.duplicatesSkipped++;
          continue;
        }
        const business = await businessFor(appointment.business_id);
        const label = formatSlotLabel(new Date(appointment.starts_at), business.timezone);
        const email = appointment.contact_email
          ? await sendAppointmentLifecycleEmail(appointment.business_id, appointment.contact_email, "reminder", label)
          : "no_address";
        const channel = await sendAppointmentChannelNotice(supabase, appointment.business_id, appointment, {
          templateKind: "appointment_reminder",
          content: `A reminder of your appointment on ${label}. We look forward to speaking with you.`,
          businessName: business.name,
          slotLabel: label,
        });
        await completeNotice(supabase, appointment.business_id, noticeId, { email, channel });
        result.remindersSent++;
        logEvent("appointment_reminder_sent", appointment.business_id, { appointmentId: appointment.id, kind, email, channel });
      } catch {
        result.failed++;
        logEvent("appointment_reminder_failed", appointment.business_id, { appointmentId: appointment.id, kind }, "error");
      }
    }
  }
}
