"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { createBusinessHoursException, deleteBusinessHoursException } from "@/lib/appointment-exceptions";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { logAndGetUserMessage } from "@/lib/errors";

export type ExceptionActionState = {
  error?: string;
  success?: boolean;
};

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Use HH:MM (24-hour).");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");

const createSchema = z
  .object({
    date: dateSchema,
    mode: z.enum(["close_all_day", "close_range", "open_override"]),
    startTime: z.union([timeSchema, z.literal("")]).optional(),
    endTime: z.union([timeSchema, z.literal("")]).optional(),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.mode === "close_all_day" || (v.startTime && v.endTime), {
    message: "Enter a start and end time.",
    path: ["startTime"],
  })
  .refine((v) => !v.startTime || !v.endTime || v.startTime < v.endTime, {
    message: "End time must be after start time.",
    path: ["endTime"],
  });

/** Admin-only (matches business-hours' own gate): adds a whole-day closure, a partial-day closure, or an exceptional opening for one date. One row per date -- an existing override for the same date must be deleted first. */
export async function createExceptionAction(_prevState: ExceptionActionState, formData: FormData): Promise<ExceptionActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  const parsed = createSchema.safeParse({
    date: formData.get("date"),
    mode: formData.get("mode"),
    startTime: formData.get("startTime") ?? "",
    endTime: formData.get("endTime") ?? "",
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const isClosed = parsed.data.mode !== "open_override";
  const startTime = parsed.data.mode === "close_all_day" ? null : parsed.data.startTime || null;
  const endTime = parsed.data.mode === "close_all_day" ? null : parsed.data.endTime || null;

  let created;
  try {
    created = await createBusinessHoursException(businessId, {
      date: parsed.data.date,
      isClosed,
      startTime,
      endTime,
      reason: parsed.data.reason?.trim() || null,
    });
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!created) {
    return { error: "There's already a schedule override for this date. Delete it below to change it." };
  }

  await recordAuditLogEntry(businessId, userId, "appointment_exception.created", "business_hours_exception", created.id, {
    date: parsed.data.date,
    isClosed,
  });

  revalidatePath("/dashboard/appointments/availability");
  return { success: true };
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deleteExceptionAction(_prevState: ExceptionActionState, formData: FormData): Promise<ExceptionActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  const parsed = deleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  let deleted: boolean;
  try {
    deleted = await deleteBusinessHoursException(businessId, parsed.data.id);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!deleted) {
    return { error: "This schedule override no longer exists." };
  }

  await recordAuditLogEntry(businessId, userId, "appointment_exception.deleted", "business_hours_exception", parsed.data.id);

  revalidatePath("/dashboard/appointments/availability");
  return { success: true };
}
