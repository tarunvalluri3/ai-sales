"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { setBusinessHours, updateBusinessSla, type DayHoursInput } from "@/lib/business-hours";
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
