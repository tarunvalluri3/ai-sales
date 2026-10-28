/**
 * Phase 33 Stop 4 (docs/phases.md): masks a prospect's email/phone for
 * display on /apache's cross-tenant Conversations & Leads pages, per the
 * approved security brief's own examples (`t•••@gmail.com`,
 * `+91 98•••••210`). Deliberately NOT "server-only" and free of any I/O --
 * pure string functions, unit-tested directly
 * (scripts/run-admin-pii-mask-tests.mjs), same reason lib/plans.ts and
 * lib/copilot-lifecycle.ts are.
 *
 * This is a DISPLAY mask only, not encryption or redaction at rest -- the
 * real value is still in the database and in `revealEmail`/`revealPhone`'s
 * return value, which lib/admin-tenant-actions.ts-style callers must gate
 * behind an audited, rate-limited reveal action (lib/admin-rate-limit.ts's
 * `admin_pii_reveal` scope, built in Stop 1) before ever showing it.
 */

export function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) return email; // malformed -- show as-is rather than guess
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  const visible = local.slice(0, 1);
  return `${visible}${"•".repeat(Math.max(local.length - 1, 3))}${domain}`;
}

/**
 * This app is India-only for v1 (lib/plans.ts's own GST_RATE_PERCENT
 * comment) -- "+91" is the only country code this recognizes explicitly,
 * since the digit count after any OTHER "+<digits>" prefix is genuinely
 * ambiguous without a real phone-number library. A number with no
 * recognized country code is masked as a plain digit string.
 */
const RECOGNIZED_COUNTRY_CODE = "+91";

export function maskPhone(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!/^\+?\d+$/.test(cleaned) || cleaned.replace(/\D/g, "").length === 0) return phone; // malformed -- show as-is rather than guess

  const hasRecognizedCode = cleaned.startsWith(RECOGNIZED_COUNTRY_CODE);
  const countryCode = hasRecognizedCode ? RECOGNIZED_COUNTRY_CODE : "";
  const rest = hasRecognizedCode ? cleaned.slice(RECOGNIZED_COUNTRY_CODE.length) : cleaned.replace(/^\+/, "");

  const prefix = countryCode ? `${countryCode} ` : "";
  if (rest.length <= 5) return `${prefix}${"•".repeat(rest.length)}`;

  const visiblePrefix = rest.slice(0, 2);
  const visibleSuffix = rest.slice(-3);
  const maskedLength = rest.length - visiblePrefix.length - visibleSuffix.length;
  return `${prefix}${visiblePrefix}${"•".repeat(maskedLength)}${visibleSuffix}`;
}
