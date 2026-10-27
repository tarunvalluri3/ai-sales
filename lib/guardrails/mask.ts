/**
 * Masks sensitive numbers in visitor text before it is stored or sent to the
 * model (guardrails Phase 1). Pure, no I/O. This is an ENFORCING guardrail
 * from day one (not log-only): a card number in a chat transcript is a
 * liability whether or not the classifier ever fires.
 *
 * It must never damage what a sales conversation legitimately contains, so
 * the rules are deliberately narrow:
 *  - cards: 13-19 digits (spaces/dashes allowed) that pass the Luhn check --
 *    a phone number, order id or price does not;
 *  - Aadhaar: 12 digits only with an Aadhaar keyword nearby, or grouped
 *    4-4-4 and passing the Verhoeff check -- a "+91 ..." phone is untouched;
 *  - OTP / PIN / CVV: only digits that follow such a keyword ("pin code" is a
 *    postal code and is left alone);
 *  - passwords: the token after "password is/:/=";
 *  - PAN and US SSN formats.
 */

export type SensitiveKind = "card" | "aadhaar" | "otp" | "password" | "pan" | "ssn";

export type MaskResult = {
  text: string;
  /** Distinct kinds that were masked, in the order first found. */
  kinds: SensitiveKind[];
};

const PLACEHOLDER: Record<SensitiveKind, string> = {
  card: "[card number removed]",
  aadhaar: "[Aadhaar number removed]",
  otp: "[code removed]",
  password: "[password removed]",
  pan: "[PAN removed]",
  ssn: "[ID number removed]",
};

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

function verhoeffValid(digits: string): boolean {
  let c = 0;
  const reversed = digits.split("").reverse();
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(reversed[i])]];
  }
  return c === 0;
}

const CARD_CANDIDATE_RE = /(?<![\d])(?:\d[ -]?){12,18}\d(?![\d])/g;
const AADHAAR_CONTEXT_RE = /(aadhaar|aadhar|adhaar|uidai|\buid\b|आधार|ఆధార్)([^\d\n]{0,24})((?:\d[ -]?){11}\d)(?![\d])/giu;
const AADHAAR_GROUPED_RE = /(?<![\d])[2-9]\d{3}[ -]\d{4}[ -]\d{4}(?![\d])/g;
// "pin" but not "pin code"/"pincode" (an Indian postal code, ordinary sales data).
const SECRET_CODE_WORDS =
  "otp|one[\\s-]?time[\\s-]?(?:password|passcode|code|pin)|verification code|security code|passcode|pin(?!\\s*code)|cvv2?|cvc";
const CODE_AFTER_KEYWORD_RE = new RegExp(`\\b(${SECRET_CODE_WORDS})\\b([^\\d\\n]{0,25}?)(\\d{3,8})(?!\\d)`, "giu");
const CODE_BEFORE_KEYWORD_RE = /(?<![\d])(\d{4,8})(\s*(?:is|=)?\s*(?:my|the|your)?\s*(?:otp|cvv2?|cvc)\b)/giu;
const PASSWORD_RE = /\b(password|passwd|pwd)(\s*(?:is|:|=)\s*)(\S{3,})/giu;
const PAN_RE = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const SSN_RE = /(?<![\d-])\d{3}-\d{2}-\d{4}(?![\d-])/g;

/** Masks sensitive numbers; `kinds` is empty (and `text` unchanged) when nothing matched. */
export function maskSensitiveNumbers(input: string): MaskResult {
  const found: SensitiveKind[] = [];
  const note = (kind: SensitiveKind) => {
    if (!found.includes(kind)) found.push(kind);
  };
  let text = input;

  text = text.replace(CARD_CANDIDATE_RE, (match) => {
    const digits = match.replace(/[ -]/g, "");
    if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) return match;
    note("card");
    return PLACEHOLDER.card;
  });
  text = text.replace(AADHAAR_CONTEXT_RE, (_m, keyword: string, gap: string) => {
    note("aadhaar");
    return `${keyword}${gap}${PLACEHOLDER.aadhaar}`;
  });
  text = text.replace(AADHAAR_GROUPED_RE, (match) => {
    if (!verhoeffValid(match.replace(/[ -]/g, ""))) return match;
    note("aadhaar");
    return PLACEHOLDER.aadhaar;
  });
  text = text.replace(CODE_AFTER_KEYWORD_RE, (_m, keyword: string, gap: string) => {
    note("otp");
    return `${keyword}${gap}${PLACEHOLDER.otp}`;
  });
  text = text.replace(CODE_BEFORE_KEYWORD_RE, (_m, _digits: string, tail: string) => {
    note("otp");
    return `${PLACEHOLDER.otp}${tail}`;
  });
  text = text.replace(PASSWORD_RE, (_m, keyword: string, glue: string) => {
    note("password");
    return `${keyword}${glue}${PLACEHOLDER.password}`;
  });
  text = text.replace(PAN_RE, () => {
    note("pan");
    return PLACEHOLDER.pan;
  });
  text = text.replace(SSN_RE, () => {
    note("ssn");
    return PLACEHOLDER.ssn;
  });

  return { text, kinds: found };
}
