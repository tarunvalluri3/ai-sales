import { timeZoneAbbreviation } from "@/lib/timezones";
import { weekFromBusinessHours, type DefaultDayHours } from "@/lib/business-hours-defaults";
import type { BusinessHours } from "@/lib/supabase/types";

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function timeLabel(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

export function summarizeWeeklyHours(week: DefaultDayHours[], timezone: string) {
  const groups: { first: number; last: number; hours: string }[] = [];
  for (let index = 1; index <= 7; index++) {
    const day = week[index % 7];
    if (!day?.isOpen || day.startTime === "" || day.endTime === "") continue;
    const hours = `${timeLabel(day.startTime ?? "09:00")} – ${timeLabel(day.endTime ?? "18:00")}`;
    const previous = groups.at(-1);
    if (previous?.last === index - 1 && previous.hours === hours) previous.last = index;
    else groups.push({ first: index, last: index, hours });
  }
  if (!groups.length) return "Closed every day";
  const schedule = groups.map(({ first, last, hours }) =>
    `${days[first]}${first === last ? "" : `–${days[last]}`}, ${hours}`).join("; ");
  return `Open ${schedule}${timezone ? ` (${timeZoneAbbreviation(timezone)})` : ""}`;
}

export function summarizeSavedHours(hours: BusinessHours[], timezone: string) {
  return hours.length ? summarizeWeeklyHours(weekFromBusinessHours(hours), timezone) : "Business hours are unset";
}
