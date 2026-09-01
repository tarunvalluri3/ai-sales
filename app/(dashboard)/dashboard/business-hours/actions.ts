"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { setBusinessHours, updateBusinessSla, type DayHoursInput } from "@/lib/business-hours";
import { updateAppointmentSettings } from "@/lib/appointments";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { logAndGetUserMessage } from "@/lib/errors";

export type BusinessHoursState = {
  error?: string;
  success?: boolean;
};

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Use HH:MM (24-hour).");

export async function updateBusinessHoursAction(
  _prevState: BusinessHoursState,
  formData: FormData,
): Promise<BusinessHoursState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  const days: DayHoursInput[] = [];
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    const isOpen = formData.get(`day-${dayOfWeek}-open`) === "on";
    const startRaw = formData.get(`day-${dayOfWeek}-start`);
    const endRaw = formData.get(`day-${dayOfWeek}-end`);

    if (isOpen) {
      const startParsed = timeSchema.safeParse(startRaw);
      const endParsed = timeSchema.safeParse(endRaw);
      if (!startParsed.success || !endParsed.success) {
        return { error: "Enter valid start/end times for every open day." };
      }
      days.push({ dayOfWeek, isOpen: true, startTime: startParsed.data, endTime: endParsed.data });
    } else {
      days.push({ dayOfWeek, isOpen: false, startTime: null, endTime: null });
    }
  }

  const slaRaw = formData.get("slaMinutes");
  const slaMinutes = slaRaw && slaRaw !== "" ? Number(slaRaw) : null;
  if (slaMinutes !== null && (!Number.isInteger(slaMinutes) || slaMinutes < 1)) {
    return { error: "SLA minutes must be a positive whole number." };
  }

  try {
    await setBusinessHours(businessId, days);
    await updateBusinessSla(businessId, slaMinutes);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  await recordAuditLogEntry(businessId, userId, "business_hours.updated", "business", businessId);

  revalidatePath("/dashboard/business-hours");
  return { success: true };
}

export type AppointmentSettingsState = {
  error?: string;
  success?: boolean;
};

/**
 * Phase C: appointment booking is derived directly from the business
 * hours set above (its own recurring weekly schedule), so this setting
 * lives on the same page rather than a separate one -- an owner
 * configuring hours and enabling booking is one coherent task.
 */
export async function updateAppointmentSettingsAction(
  _prevState: AppointmentSettingsState,
  formData: FormData,
): Promise<AppointmentSettingsState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  const enabled = formData.get("appointmentsEnabled") === "on";
  const slotMinutesRaw = formData.get("appointmentSlotMinutes");
  const slotMinutes = Number(slotMinutesRaw);
  if (!Number.isInteger(slotMinutes) || slotMinutes < 5 || slotMinutes > 240) {
    return { error: "Slot length must be a whole number of minutes between 5 and 240." };
  }

  try {
    const supabase = createServerSupabaseClient();
    await updateAppointmentSettings(supabase, businessId, { enabled, slotMinutes });
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  await recordAuditLogEntry(businessId, userId, "appointment_settings.updated", "business", businessId);

  revalidatePath("/dashboard/business-hours");
  return { success: true };
}
