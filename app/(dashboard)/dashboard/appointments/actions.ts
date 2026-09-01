"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { confirmAppointment, declineAppointment, cancelAppointment } from "@/lib/appointments";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { logAndGetUserMessage } from "@/lib/errors";

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

/** Owner approves a pending, AI-booked appointment. */
export async function confirmAppointmentAction(
  _prevState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const result = await runTransition(formData, confirmAppointment, "This appointment is no longer pending.");
  if (!result.ok) return { error: result.error };

  await recordAuditLogEntry(result.businessId, result.userId, "appointment.confirmed", "appointment", result.id);
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
  revalidatePath("/dashboard/appointments");
  return { success: true };
}
