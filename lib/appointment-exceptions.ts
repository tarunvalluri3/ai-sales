import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { BusinessHoursException } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

/** Lists this business's upcoming (today or later) schedule overrides, soonest first. `businessId` must come from `requireBusinessContext()`. */
export async function listUpcomingBusinessHoursExceptions(businessId: string): Promise<BusinessHoursException[]> {
  const supabase = createServerSupabaseClient();
  const todayKey = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("business_hours_exceptions")
    .select("*")
    .eq("business_id", businessId)
    .gte("date", todayKey)
    .order("date", { ascending: true });

  if (error) {
    throw new AppError(
      "Something went wrong loading your schedule overrides. Please try again.",
      "listUpcomingBusinessHoursExceptions failed",
      error,
    );
  }

  return data;
}

export type CreateExceptionInput = {
  date: string;
  isClosed: boolean;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
};

/** Returns `null` (not a thrown error) when a row already exists for that date -- one override per date, edit by deleting and re-adding. */
export async function createBusinessHoursException(businessId: string, input: CreateExceptionInput): Promise<BusinessHoursException | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("business_hours_exceptions")
    .insert({
      business_id: businessId,
      date: input.date,
      is_closed: input.isClosed,
      start_time: input.startTime,
      end_time: input.endTime,
      reason: input.reason,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return null;
    throw new AppError(
      "Something went wrong saving this schedule override. Please try again.",
      "createBusinessHoursException failed",
      error,
    );
  }

  return data;
}

export async function deleteBusinessHoursException(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("business_hours_exceptions")
    .delete()
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong removing this schedule override. Please try again.",
      "deleteBusinessHoursException failed",
      error,
    );
  }

  return (data?.length ?? 0) > 0;
}
