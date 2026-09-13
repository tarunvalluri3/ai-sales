/**
 * Shared conservative contact-normalization rules, used by both the
 * dashboard's existing "possibly the same prospect" hint
 * (lib/leads.ts's computePossibleDuplicateLeads) and Phase 28's real
 * customer-identity resolution (lib/customers.ts). Kept in one place so
 * the two can never silently drift apart -- and so it matches, key for
 * key, the generated `email_key`/`phone_key` columns on `public.customers`
 * (supabase/migrations/20260914020000_create_customers_table.sql), which
 * express the identical rule in SQL for the one-time backfill.
 *
 * Deliberately conservative: exact key equality only, never fuzzy
 * matching. A false negative (two rows for the same real person) costs
 * nothing beyond an extra customer row; a false positive would silently
 * merge two different people's data.
 */

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Last-10-digit match key, tolerant of country-code/formatting differences -- an exact match is too strict across a typed number vs. a WhatsApp wa_id. */
export function phoneMatchKey(phone: string): string | null {
  const digits = digitsOnly(phone);
  if (digits.length < 7) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function emailMatchKey(email: string): string {
  return email.trim().toLowerCase();
}
