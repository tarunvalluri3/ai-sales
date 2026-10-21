import { isIndianStateCode } from "@/lib/india-states";

/**
 * GSTIN validation for Phase 17c's tax invoices: structure, check digit,
 * and agreement with the stated state. Pure and NOT "server-only" -- the
 * billing form's Server Action, the invoice builder and the tests all use
 * it.
 *
 * A GSTIN is 15 characters:
 *
 *   2 digits  state code           (36 = Telangana)
 *   10 chars  the holder's PAN     (5 letters, 4 digits, 1 letter)
 *   1 char    entity number        (1-9 then A-Z: the holder's n-th registration in that state)
 *   1 char    'Z', always
 *   1 char    check digit
 *
 * The database holds the same structural pattern as a CHECK constraint
 * (20261025000000). The check digit is NOT in the database: it is checked
 * here, at the boundary, so a typo is rejected at checkout instead of being
 * discovered on an issued invoice -- which, being immutable, could never be
 * corrected.
 */

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const CODEPOINT_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * The GSTN check character for the first 14 characters: a mod-36 sum in
 * which every second character is doubled, each product being folded back
 * into base 36 (quotient + remainder) before it is added up.
 */
export function gstinCheckCharacter(first14: string): string | null {
  if (first14.length !== 14) return null;
  let sum = 0;
  for (let index = 0; index < 14; index++) {
    const value = CODEPOINT_CHARS.indexOf(first14[index]);
    if (value < 0) return null;
    const product = value * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CODEPOINT_CHARS[(36 - (sum % 36)) % 36];
}

export type GstinProblem = "format" | "check_digit" | "state_unknown" | "state_mismatch";

export type GstinValidation =
  | { ok: true; gstin: string; stateCode: string }
  | { ok: false; problem: GstinProblem };

/**
 * Validates a GSTIN. Upper-cases and trims first, so a lower-case entry is
 * accepted rather than rejected for a reason the customer cannot see.
 *
 * `expectedStateCode`, when given, must equal the GSTIN's own first two
 * digits: a GSTIN carries its holder's state, and an invoice showing one
 * state in the address and another in the GSTIN is wrong on its face.
 */
export function validateGstin(input: string, expectedStateCode?: string): GstinValidation {
  const gstin = input.trim().toUpperCase();
  if (!GSTIN_PATTERN.test(gstin)) return { ok: false, problem: "format" };

  if (gstinCheckCharacter(gstin.slice(0, 14)) !== gstin[14]) {
    return { ok: false, problem: "check_digit" };
  }

  const stateCode = gstin.slice(0, 2);
  if (!isIndianStateCode(stateCode)) return { ok: false, problem: "state_unknown" };
  if (expectedStateCode !== undefined && stateCode !== expectedStateCode) {
    return { ok: false, problem: "state_mismatch" };
  }
  return { ok: true, gstin, stateCode };
}

/** The customer-facing sentence for each way a GSTIN can be wrong. */
export function gstinProblemMessage(problem: GstinProblem): string {
  switch (problem) {
    case "format":
      return "That does not look like a valid 15-character GSTIN.";
    case "check_digit":
      return "That GSTIN is not valid -- its last character does not match the rest. Please check it for a typo.";
    case "state_unknown":
      return "The first two digits of that GSTIN are not a state we can invoice.";
    case "state_mismatch":
      return "Your GSTIN's state code does not match the state you selected.";
  }
}
