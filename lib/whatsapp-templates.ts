/**
 * WhatsApp message templates (production readiness, item 4). Pure, no
 * server-only import, so the unit tests import it directly.
 *
 * Outside the 24-hour customer-service window Meta only delivers APPROVED
 * templates. Template names live in config (env), never in code paths:
 * a template is used only once its env var is set, i.e. after it has been
 * approved. Until then a notice that needs one fails visibly
 * (`template_not_configured`) instead of being sent and rejected.
 *
 * IMPORTANT: templates are approved per WhatsApp Business Account (WABA).
 * Each business connects its OWN number/WABA, so each WABA needs these
 * templates approved under the same names (see LAUNCH_AUDIT.md handoff).
 *
 * The `body` below is the exact text to submit in WhatsApp Manager
 * (category UTILITY). Every parameter is plain text; {{3}} is the slot
 * label already formatted in the business's own time zone.
 */

export type WhatsappTemplateKind =
  | "appointment_confirmed"
  | "appointment_declined"
  | "appointment_cancelled"
  | "appointment_reminder"
  | "appointment_expired";

export type WhatsappTemplateDefinition = {
  /** Env var holding the approved template's name. */
  envVar: string;
  /** Suggested name to submit to Meta (lowercase, underscores). */
  suggestedName: string;
  category: "UTILITY";
  body: string;
  /** What each {{n}} is, in order. */
  parameters: string[];
  /** Sample values Meta asks for when submitting. */
  example: string[];
};

const PARAMS = ["Customer's first name (or \"there\")", "Business name", "Date and time, e.g. Tue 4 Nov, 3:00 pm"];
const EXAMPLE = ["Priya", "Waves Demo Store", "Tue 4 Nov, 3:00 pm"];

export const WHATSAPP_TEMPLATES: Record<WhatsappTemplateKind, WhatsappTemplateDefinition> = {
  appointment_confirmed: {
    envVar: "WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMED",
    suggestedName: "appointment_confirmed",
    category: "UTILITY",
    body: "Hi {{1}}, your appointment with {{2}} on {{3}} is confirmed. Reply to this message if you need to change it.",
    parameters: PARAMS,
    example: EXAMPLE,
  },
  appointment_declined: {
    envVar: "WHATSAPP_TEMPLATE_APPOINTMENT_DECLINED",
    suggestedName: "appointment_declined",
    category: "UTILITY",
    body: "Hi {{1}}, {{2}} couldn't confirm your requested appointment on {{3}}. Reply to this message to find another time.",
    parameters: PARAMS,
    example: EXAMPLE,
  },
  appointment_cancelled: {
    envVar: "WHATSAPP_TEMPLATE_APPOINTMENT_CANCELLED",
    suggestedName: "appointment_cancelled",
    category: "UTILITY",
    body: "Hi {{1}}, your appointment with {{2}} on {{3}} has been cancelled. Reply to this message if you'd like to reschedule.",
    parameters: PARAMS,
    example: EXAMPLE,
  },
  appointment_reminder: {
    envVar: "WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER",
    suggestedName: "appointment_reminder",
    category: "UTILITY",
    body: "Hi {{1}}, this is a reminder of your appointment with {{2}} on {{3}}. Reply to this message if you need to change it.",
    parameters: PARAMS,
    example: EXAMPLE,
  },
  appointment_expired: {
    envVar: "WHATSAPP_TEMPLATE_APPOINTMENT_EXPIRED",
    suggestedName: "appointment_expired",
    category: "UTILITY",
    body: "Hi {{1}}, {{2}} wasn't able to confirm your requested appointment on {{3}} in time, so the slot has been released. Reply to this message to book another time.",
    parameters: PARAMS,
    example: EXAMPLE,
  },
};

export const DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE = "en";

export type ResolvedWhatsappTemplate = { kind: WhatsappTemplateKind; name: string; language: string };

/** The approved template for `kind`, or null when its env var is not set (not approved/configured yet). */
export function resolveWhatsappTemplate(
  kind: WhatsappTemplateKind,
  env: Record<string, string | undefined>,
): ResolvedWhatsappTemplate | null {
  const name = env[WHATSAPP_TEMPLATES[kind].envVar]?.trim();
  if (!name) return null;
  const language = env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE;
  return { kind, name, language };
}

/** Meta rejects empty parameters and newlines/tabs/4+ spaces in them; keep each short and single-line. */
export function sanitizeTemplateParam(value: string | null | undefined, fallback: string): string {
  const cleaned = (value ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 200);
  return cleaned.length > 0 ? cleaned : fallback;
}

/** The three body parameters every appointment template uses, in order. */
export function appointmentTemplateParams(input: {
  contactName: string | null;
  businessName: string;
  slotLabel: string;
}): string[] {
  const firstName = (input.contactName ?? "").trim().split(/\s+/)[0] ?? "";
  return [
    sanitizeTemplateParam(firstName, "there"),
    sanitizeTemplateParam(input.businessName, "our team"),
    sanitizeTemplateParam(input.slotLabel, "your requested time"),
  ];
}
