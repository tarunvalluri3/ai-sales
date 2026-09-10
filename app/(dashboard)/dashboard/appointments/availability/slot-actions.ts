"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { blockAppointmentSlot, unblockAppointmentSlot } from "@/lib/appointment-slot-blocks";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { logAndGetUserMessage } from "@/lib/errors";

export type SlotBlockActionState = {
  error?: string;
  success?: boolean;
};

const startsAtSchema = z.object({ startsAt: z.string().trim().min(1) });

/** Admin-only (matches the exceptions form's own gate): blocks one exact slot instant, no reason field -- the quick one-click toggle the visual grid is for. */
export async function blockSlotAction(_prevState: SlotBlockActionState, formData: FormData): Promise<SlotBlockActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  const parsed = startsAtSchema.safeParse({ startsAt: formData.get("startsAt") });
  if (!parsed.success) {
    return { error: "Invalid slot." };
  }

  let blocked;
  try {
    blocked = await blockAppointmentSlot(businessId, parsed.data.startsAt, null);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!blocked) {
    return { error: "This slot is already blocked." };
  }

  await recordAuditLogEntry(businessId, userId, "appointment_slot_block.created", "appointment_blocked_slot", blocked.id, {
    startsAt: parsed.data.startsAt,
  });

  revalidatePath("/dashboard/appointments/availability");
  return { success: true };
}

export async function unblockSlotAction(_prevState: SlotBlockActionState, formData: FormData): Promise<SlotBlockActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  const parsed = startsAtSchema.safeParse({ startsAt: formData.get("startsAt") });
  if (!parsed.success) {
    return { error: "Invalid slot." };
  }

  let unblocked: boolean;
  try {
    unblocked = await unblockAppointmentSlot(businessId, parsed.data.startsAt);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!unblocked) {
    return { error: "This slot is no longer blocked." };
  }

  await recordAuditLogEntry(businessId, userId, "appointment_slot_block.deleted", "appointment_blocked_slot", parsed.data.startsAt);

  revalidatePath("/dashboard/appointments/availability");
  return { success: true };
}
