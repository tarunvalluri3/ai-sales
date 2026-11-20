import { z } from "zod";
import type { DayHoursInput } from "@/lib/business-hours";

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Use HH:MM (24-hour).");

export function parseWeeklyHours(formData: FormData): { days: DayHoursInput[] } | { error: string } {
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

  return { days };
}
