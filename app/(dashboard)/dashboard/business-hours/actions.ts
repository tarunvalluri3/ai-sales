"use server";

import { parseWeeklyHours } from "@/lib/schemas/weekly-hours";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { setBusinessHours, updateBusinessSla, updateBusinessTimezone } from "@/lib/business-hours";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { logAndGetUserMessage } from "@/lib/errors";
import { normalizeTimezone, TIMEZONE_ERROR_MESSAGES } from "@/lib/timezones";

export type BusinessHoursState = {
  error?: string;
  success?: boolean;
};

export async function updateBusinessHoursAction(
  _prevState: BusinessHoursState,
  formData: FormData,
): Promise<BusinessHoursState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  const week = parseWeeklyHours(formData);
  if ("error" in week) return week;

  const slaRaw = formData.get("slaMinutes");
  const slaMinutes = slaRaw && slaRaw !== "" ? Number(slaRaw) : null;
  if (slaMinutes !== null && (!Number.isInteger(slaMinutes) || slaMinutes < 1)) {
    return { error: "SLA minutes must be a positive whole number." };
  }

  // Same rule as onboarding: never a silent UTC fallback.
  const zone = normalizeTimezone(formData.get("timezone"));
  if (!zone.ok) {
    return { error: TIMEZONE_ERROR_MESSAGES[zone.reason] };
  }
  const timezone = zone.timezone;

  try {
    await updateBusinessSla(businessId, slaMinutes);
    await updateBusinessTimezone(businessId, timezone);
    await setBusinessHours(businessId, week.days);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  await recordAuditLogEntry(businessId, userId, "business_hours.updated", "business", businessId);

  revalidatePath("/dashboard/business-hours");
  // The onboarding review step embeds this form and shows the readiness result.
  revalidatePath("/onboarding");
  return { success: true };
}
