/**
 * Verifies the contact details a model passes to a write tool against what the
 * visitor actually typed in this conversation (guardrails Phase 3). Pure, no
 * I/O, not `server-only`.
 *
 * The tool schemas already tell the model to pass only details the prospect
 * typed -- but that is a request to a model, and model output is untrusted
 * (AGENTS.md rule 5). The Phase 0 red-team saw the model tell a visitor that
 * callbacks were "confirmed" for contacts the system had not recorded, and a
 * booking sends a confirmation email TO whatever address the model passes.
 * So the server checks, in code, that each detail really occurs in the
 * visitor's own messages (or is the channel's verified identity, e.g. the
 * WhatsApp number). A detail that does not is dropped, not trusted.
 */

export type ContactArgs = {
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
};

export type VerifiedContact = {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  /** Which supplied details were dropped because the visitor never typed them. */
  rejected: ("name" | "email" | "phone")[];
};

const digitsOf = (text: string): string => text.replace(/\D/g, "");

/** The comparable tail of a phone number: country code and formatting vary, the last 10 digits do not. */
function phoneKey(phone: string): string {
  const digits = digitsOf(phone);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function verifyContactAgainstTranscript(
  args: ContactArgs,
  visitorTexts: string[],
  channelPhone: string | null = null,
): VerifiedContact {
  const rejected: VerifiedContact["rejected"] = [];
  const lowered = visitorTexts.map((text) => text.toLowerCase());
  const joined = lowered.join("\n");
  // Per-message digit runs, so digits from two different messages are never glued into a number.
  const digitBlobs = visitorTexts.map(digitsOf);

  let contactEmail: string | null = null;
  if (args.contactEmail) {
    const email = args.contactEmail.trim().toLowerCase();
    if (email && joined.includes(email)) contactEmail = args.contactEmail.trim();
    else rejected.push("email");
  }

  let contactPhone: string | null = null;
  if (args.contactPhone) {
    const key = phoneKey(args.contactPhone);
    const typed = key.length >= 7 && digitBlobs.some((blob) => blob.includes(key));
    const isChannelIdentity = channelPhone !== null && key.length >= 7 && phoneKey(channelPhone) === key;
    if (typed || isChannelIdentity) contactPhone = args.contactPhone.trim();
    else rejected.push("phone");
  }

  let contactName: string | null = null;
  if (args.contactName) {
    const tokens = args.contactName.toLowerCase().split(/\s+/).filter((token) => token.length >= 2);
    if (tokens.length > 0 && tokens.every((token) => joined.includes(token))) contactName = args.contactName.trim();
    else rejected.push("name");
  }

  return { contactName, contactEmail, contactPhone, rejected };
}
