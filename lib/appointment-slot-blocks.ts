import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AppointmentBlockedSlot } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

/** Blocks one exact slot instant. Returns `null` (not a thrown error) when it's already blocked -- one row per (business, starts_at). */
export async function blockAppointmentSlot(businessId: string, startsAtIso: string, reason: string | null): Promise<AppointmentBlockedSlot | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("appointment_blocked_slots")
    .insert({ business_id: businessId, starts_at: startsAtIso, reason })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return null;
    throw new AppError("Something went wrong blocking this slot. Please try again.", "blockAppointmentSlot failed", error);
  }

  return data;
}

/** Unblocks one exact slot instant. Returns `false` when nothing was blocked there. */
export async function unblockAppointmentSlot(businessId: string, startsAtIso: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("appointment_blocked_slots")
    .delete()
    .eq("business_id", businessId)
    .eq("starts_at", startsAtIso)
    .select("id");

  if (error) {
    throw new AppError("Something went wrong unblocking this slot. Please try again.", "unblockAppointmentSlot failed", error);
  }

  return (data?.length ?? 0) > 0;
}
