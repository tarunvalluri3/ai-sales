/**
 * Time zone helpers shared by onboarding, /dashboard/business-hours and their
 * Server Actions. Pure (no I/O, not server-only) so the browser picker, the
 * server validation and the unit tests all use the same rules.
 *
 * Why this is not a fixed allow-list any more (bug, 2026-11-20): onboarding
 * accepted only 21 hard-coded zones and silently turned anything else into
 * "UTC". Chrome's time zone data reports India as the legacy name
 * "Asia/Calcutta" (V8's Intl.supportedValuesOf lists Asia/Calcutta and NOT
 * Asia/Kolkata), and most US zones (Phoenix, Detroit, Anchorage, Honolulu,
 * Indiana/...) were missing too -- so a Hyderabad sign-up got UTC hours.
 */

/** Shown first in the picker, in this order. */
export const COMMON_TIMEZONES = [
  "Asia/Kolkata",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

/**
 * Legacy / backward-link names browsers still report, mapped to the current
 * IANA name. Only names that differ; anything else valid is kept as given.
 */
const TIMEZONE_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Dacca": "Asia/Dhaka",
  "Asia/Thimbu": "Asia/Thimphu",
  "Asia/Ulan_Bator": "Asia/Ulaanbaatar",
  "Asia/Macao": "Asia/Macau",
  "Asia/Istanbul": "Europe/Istanbul",
  "Europe/Kiev": "Europe/Kyiv",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Louisville": "America/Kentucky/Louisville",
  "Australia/ACT": "Australia/Sydney",
  "Australia/NSW": "Australia/Sydney",
  "US/Eastern": "America/New_York",
  "US/Central": "America/Chicago",
  "US/Mountain": "America/Denver",
  "US/Arizona": "America/Phoenix",
  "US/Pacific": "America/Los_Angeles",
  "US/Alaska": "America/Anchorage",
  "US/Hawaii": "Pacific/Honolulu",
  "US/East-Indiana": "America/Indiana/Indianapolis",
  "US/Michigan": "America/Detroit",
  GB: "Europe/London",
  "Etc/UTC": "UTC",
  "Etc/GMT": "UTC",
  GMT: "UTC",
  Zulu: "UTC",
};

function isValidTimezone(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

export type TimezoneResult = { ok: true; timezone: string } | { ok: false; reason: "missing" | "invalid" };

/**
 * Validates a client-supplied time zone and returns its current IANA name.
 * Missing or invalid is an error the caller shows next to the field -- never a
 * silent fallback to UTC.
 */
export function normalizeTimezone(raw: unknown): TimezoneResult {
  if (typeof raw !== "string" || raw.trim() === "") return { ok: false, reason: "missing" };
  const trimmed = raw.trim();
  if (trimmed.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(trimmed)) return { ok: false, reason: "invalid" };
  const mapped = TIMEZONE_ALIASES[trimmed] ?? trimmed;
  if (!isValidTimezone(mapped)) return { ok: false, reason: "invalid" };
  return { ok: true, timezone: mapped };
}

export const TIMEZONE_ERROR_MESSAGES: Record<"missing" | "invalid", string> = {
  missing: "Choose your business time zone.",
  invalid: "That time zone isn't recognised. Choose one from the list.",
};

/** The browser's own zone, normalised; null when it can't be read or isn't valid. Client-only in practice. */
export function detectBrowserTimezone(): string | null {
  try {
    const result = normalizeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    return result.ok ? result.timezone : null;
  } catch {
    return null;
  }
}

/** Every zone the runtime knows, under current names, deduplicated and sorted; the common ones excluded (they're listed first separately). */
export function otherTimezones(): string[] {
  let all: string[] = [];
  try {
    all = Intl.supportedValuesOf("timeZone");
  } catch {
    all = [];
  }
  const names = new Set<string>();
  for (const zone of all) names.add(TIMEZONE_ALIASES[zone] ?? zone);
  names.add("UTC");
  for (const zone of COMMON_TIMEZONES) names.delete(zone);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** "Asia/Kolkata" -> "Kolkata (Asia)", "America/Indiana/Indianapolis" -> "Indianapolis (America / Indiana)". */
export function timezoneLabel(zone: string): string {
  if (!zone.includes("/")) return zone;
  const parts = zone.split("/");
  const city = parts.pop()!.replace(/_/g, " ");
  return `${city} (${parts.join(" / ").replace(/_/g, " ")})`;
}

/** Current UTC offset as "UTC+5:30", for the picker. Falls back to "" if the runtime can't format it. */
export function timezoneOffsetLabel(zone: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    if (!part) return "";
    return part === "GMT" ? "UTC" : part.replace("GMT", "UTC");
  } catch {
    return "";
  }
}
