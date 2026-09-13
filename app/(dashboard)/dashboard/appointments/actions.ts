"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  confirmAppointment,
  declineAppointment,
  cancelAppointment,
  markAppointmentCompleted,
  markAppointmentNoShow,
  getAppointmentForBusiness,
} from "@/lib/appointments";
import { notifyAppointmentStatusChange } from "@/lib/appointment-notifications";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { logAndGetUserMessage } from "@/lib/errors";
import type { AppointmentStatusForEmail } from "@/lib/notifications";
import { dispatchWorkflowTrigger } from "@/lib/workflow-engine";
import type { AppointmentStatus } from "@/lib/supabase/types";

export type AppointmentActionState = {
  error?: string;
  success?: boolean;
};

const idSchema = z.object({ id: z.string().uuid() });

type TransitionResult =
  | { ok: true; businessId: string; userId: string; id: string }
  | { ok: false; error: string };

async function runTransition(
  formData: FormData,
  transition: (supabase: ReturnType<typeof createServerSupabaseClient>, businessId: string, id: string) => Promise<boolean>,
  errorIfMissing: string,
): Promise<TransitionResult> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { ok: false, error: authError };
  }

  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: "Invalid appointment." };
  }

  let changed: boolean;
  try {
    const supabase = createServerSupabaseClient();
    changed = await transition(supabase, businessId, parsed.data.id);
  } catch (error) {
    return { ok: false, error: logAndGetUserMessage(error) };
  }

  if (!changed) {
    return { ok: false, error: errorIfMissing };
  }

  return { ok: true, businessId, userId, id: parsed.data.id };
}

/**
 * Fires the prospect-facing email/WhatsApp reply for a status change,
 * deferred past the response via after() so the admin's Confirm/Decline/
 * Cancel click isn't held up by an outbound email/WhatsApp round trip --
 * same non-blocking pattern lib/tools/book-appointment.ts uses for its
 * own new-request alert. Reloads the appointment row rather than
 * threading it through runTransition's generic signature, since only
 * this notification step needs the contact/timing fields.
 */
function notifyStatusChange(businessId: string, id: string, status: AppointmentStatusForEmail): void {
  after(async () => {
    const supabase = createServerSupabaseClient();
    const appointment = await getAppointmentForBusiness(supabase, businessId, id);
    if (!appointment) return;
    await notifyAppointmentStatusChange(businessId, appointment, status);
  });
}

/** Phase 29: `appointment_status_changed` workflow trigger, fired after every confirm/decline/cancel/complete/no-show transition. Re-fetches the appointment for its customer/conversation ids rather than threading them through `runTransition`'s generic signature, same reasoning as `notifyStatusChange` above. */
async function dispatchAppointmentStatusWorkflow(businessId: string, id: string, status: AppointmentStatus): Promise<void> {
  const supabase = createServerSupabaseClient();
  const appointment = await getAppointmentForBusiness(supabase, businessId, id);
  if (!appointment) return;
  await dispatchWorkflowTrigger(
    supabase,
    businessId,
    "appointment_status_changed",
    {
      type: "conversation",
      id: appointment.conversation_id ?? appointment.id,
      customerId: appointment.customer_id,
      leadId: null,
      conversationId: appointment.conversation_id,
    },
    { status },
  );
}

/** Owner approves a pending, AI-booked appointment. */
export async function confirmAppointmentAction(
  _prevState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const result = await runTransition(formData, confirmAppointment, "This appointment is no longer pending.");
  if (!result.ok) return { error: result.error };

  await recordAuditLogEntry(result.businessId, result.userId, "appointment.confirmed", "appointment", result.id);
  notifyStatusChange(result.businessId, result.id, "confirmed");
  await dispatchAppointmentStatusWorkflow(result.businessId, result.id, "confirmed");
  revalidatePath("/dashboard/appointments");
  return { success: true };
}

/** Owner declines a pending appointment, freeing the slot back up. */
export async function declineAppointmentAction(
  _prevState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const result = await runTransition(formData, declineAppointment, "This appointment is no longer pending.");
  if (!result.ok) return { error: result.error };

  await recordAuditLogEntry(result.businessId, result.userId, "appointment.declined", "appointment", result.id);
  notifyStatusChange(result.businessId, result.id, "declined");
  await dispatchAppointmentStatusWorkflow(result.businessId, result.id, "declined");
  revalidatePath("/dashboard/appointments");
  return { success: true };
}

/** Owner cancels a previously confirmed appointment. */
export async function cancelAppointmentAction(
  _prevState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const result = await runTransition(formData, cancelAppointment, "This appointment is no longer confirmed.");
  if (!result.ok) return { error: result.error };

  await recordAuditLogEntry(result.businessId, result.userId, "appointment.cancelled", "appointment", result.id);
  notifyStatusChange(result.businessId, result.id, "cancelled");
  await dispatchAppointmentStatusWorkflow(result.businessId, result.id, "cancelled");
  revalidatePath("/dashboard/appointments");
  return { success: true };
}

/**
 * Owner marks a confirmed, past-due appointment as having actually
 * happened. No prospect-facing notification -- unlike confirm/decline/
 * cancel, this is internal record-keeping, not something the prospect
 * needs to hear about.
 */
export async function completeAppointmentAction(
  _prevState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const result = await runTransition(formData, markAppointmentCompleted, "This appointment is no longer confirmed.");
  if (!result.ok) return { error: result.error };

  await recordAuditLogEntry(result.businessId, result.userId, "appointment.completed", "appointment", result.id);
  await dispatchAppointmentStatusWorkflow(result.businessId, result.id, "completed");
  revalidatePath("/dashboard/appointments");
  return { success: true };
}

/** Owner marks a confirmed, past-due appointment as a no-show. No prospect-facing notification, same reasoning as completeAppointmentAction. */
export async function noShowAppointmentAction(
  _prevState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const result = await runTransition(formData, markAppointmentNoShow, "This appointment is no longer confirmed.");
  if (!result.ok) return { error: result.error };

  await recordAuditLogEntry(result.businessId, result.userId, "appointment.no_show", "appointment", result.id);
  await dispatchAppointmentStatusWorkflow(result.businessId, result.id, "no_show");
  revalidatePath("/dashboard/appointments");
  return { success: true };
}
