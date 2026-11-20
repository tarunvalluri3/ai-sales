/**
 * Widget reliability item 7 (STATE.md 2026-11-20): when a reply escalates and
 * the prospect has already given a phone number or email, the widget says
 * "Our team will contact you at +91 98•••••210" instead of asking for contact
 * details again. Masked because the widget may be on a shared screen.
 * Pure, no I/O.
 */

const DOT = "•";

/** "+91 98765 43210" -> "+91 98•••••210"; "(415) 555-0134" -> "41•••••134". Null when there are too few digits. */
export function maskPhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return null;
  // With a leading "+", anything beyond a 10-digit national number is the country code.
  const hasCountryCode = trimmed.startsWith("+") && digits.length > 10;
  const countryCode = hasCountryCode ? digits.slice(0, digits.length - 10) : "";
  const national = hasCountryCode ? digits.slice(digits.length - 10) : digits;
  const keepStart = national.length >= 9 ? 2 : 0;
  const keepEnd = national.length >= 9 ? 3 : 2;
  const masked = national.slice(0, keepStart) + DOT.repeat(national.length - keepStart - keepEnd) + national.slice(-keepEnd);
  return countryCode ? `+${countryCode} ${masked}` : masked;
}

/** "rahul@gmail.com" -> "r•••@gmail.com". Null when it isn't an email. */
export function maskEmail(raw: string): string | null {
  const trimmed = raw.trim();
  const at = trimmed.lastIndexOf("@");
  if (at < 1 || at === trimmed.length - 1 || trimmed.length > 254) return null;
  const domain = trimmed.slice(at + 1);
  if (!/^[^\s@]+\.[^\s@]+$/.test(domain)) return null;
  return `${trimmed[0]}${DOT.repeat(3)}@${domain}`;
}

/** The contact to show: phone first (the team calls), then email. */
export function maskFollowUpContact(phone: string | null | undefined, email: string | null | undefined): string | null {
  if (phone) {
    const masked = maskPhone(phone);
    if (masked) return masked;
  }
  if (email) return maskEmail(email);
  return null;
}
