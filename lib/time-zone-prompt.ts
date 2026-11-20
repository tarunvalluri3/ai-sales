import { timeZoneAbbreviation } from "@/lib/timezones";

/**
 * Widget reliability item 3 (live test, 2026-11-20: a US-facing page was offered
 * "Saturday 10 AM" with no zone; "IST" only when asked). Outside the profile tag
 * on purpose: both zones are validated IANA names (DB / normalizeTimezone()),
 * not business- or visitor-written text. The model never converts a time
 * itself -- a visitor's local time only ever comes from a tool's visitorLabel.
 */
export function formatTimeZoneInstruction(businessZone: string | null, visitorZone: string | null): string {
  if (!businessZone || !/^[A-Za-z0-9_+\-/]+$/.test(businessZone)) return "";
  const abbreviation = timeZoneAbbreviation(businessZone);
  let line = `\nTime zone: this business works in ${businessZone} (${abbreviation}). Every day or time you offer, confirm or repeat must name the zone, for example "10:00 AM ${abbreviation}" -- including opening hours and any time the prospect asked for. Read a time the prospect asks for as ${abbreviation} unless they name another zone.\n`;
  if (visitorZone && visitorZone !== businessZone && /^[A-Za-z0-9_+\-/]+$/.test(visitorZone)) {
    line += `The prospect's browser is set to ${visitorZone}, a different zone. When a tool result gives a visitorLabel for a time, write it in brackets right after the business time, for example "10:00 AM ${abbreviation} (11:30 PM Fri, your time)". Never convert a time between zones yourself; without a visitorLabel, give the ${abbreviation} time only.\n`;
  }
  return line;
}
