import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { BusinessHours } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/** Lists the configured hours for a business, one row per day of week it has an entry for. A business with no rows yet is treated as always-open (see `isWithinBusinessHours`) -- this returning `[]` is a valid, unconfigured state, not an error. */
export async function listBusinessHours(businessId: string): Promise<BusinessHours[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("business_hours")
    .select("*")
    .eq("business_id", businessId)
    .order("day_of_week", { ascending: true });

  if (error) {
    throw new AppError(
      "Something went wrong loading your business hours. Please try again.",
      "listBusinessHours failed",
      error,
    );
  }

  return data;
}

export type DayHoursInput = {
  dayOfWeek: number;
  isOpen: boolean;
  startTime: string | null;
  endTime: string | null;
};

/** Replaces a business's full week of hours in one call -- simpler and less error-prone than seven individual upserts from a single settings form submit. */
export async function setBusinessHours(businessId: string, days: DayHoursInput[]): Promise<void> {
  const supabase = createServerSupabaseClient();

  const { error: deleteError } = await supabase.from("business_hours").delete().eq("business_id", businessId);
  if (deleteError) {
    throw new AppError(
      "Something went wrong saving your business hours. Please try again.",
      "setBusinessHours delete failed",
      deleteError,
    );
  }

  const { error: insertError } = await supabase.from("business_hours").insert(
    days.map((day) => ({
      business_id: businessId,
      day_of_week: day.dayOfWeek,
      is_open: day.isOpen,
      start_time: day.isOpen ? day.startTime : null,
      end_time: day.isOpen ? day.endTime : null,
    })),
  );

  if (insertError) {
    throw new AppError(
      "Something went wrong saving your business hours. Please try again.",
      "setBusinessHours insert failed",
      insertError,
    );
  }
}

export async function updateBusinessSla(businessId: string, slaMinutes: number | null): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("businesses").update({ sla_minutes: slaMinutes }).eq("id", businessId);

  if (error) {
    throw new AppError(
      "Something went wrong saving your SLA setting. Please try again.",
      "updateBusinessSla failed",
      error,
    );
  }
}

/**
 * Whether `businessId` is currently within its configured business
 * hours, in the business's own timezone. A business with no
 * `business_hours` rows at all (never configured) is treated as always
 * open -- SLA routing must not silently stop working just because no
 * one has visited the settings page yet. Takes the Supabase client as a
 * parameter so the SLA sweep (service-role, no Clerk session) can share
 * this with any future authenticated caller.
 */
export async function isWithinBusinessHours(supabase: ServiceSupabaseClient, businessId: string): Promise<boolean> {
  const { data: business } = await supabase.from("businesses").select("timezone").eq("id", businessId).maybeSingle();

  const { data: hours } = await supabase.from("business_hours").select("*").eq("business_id", businessId);

  if (!hours || hours.length === 0) {
    return true;
  }

  const timezone = business?.timezone ?? "UTC";
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const weekdayShort = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const currentTime = `${hour}:${minute}:00`;

  const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = WEEKDAY_INDEX[weekdayShort] ?? 0;

  const today = hours.find((row) => row.day_of_week === dayOfWeek);
  if (!today || !today.is_open || !today.start_time || !today.end_time) {
    return false;
  }

  return currentTime >= today.start_time && currentTime <= today.end_time;
}
