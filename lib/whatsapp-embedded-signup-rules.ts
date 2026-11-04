/**
 * WhatsApp Embedded Signup (production readiness item 6, 2026-11-03): the pure
 * half. No I/O, no server-only: the dashboard button (client) parses Meta's
 * postMessage with it, the server runs the onboarding steps through an INJECTED
 * Graph caller, and scripts/run-whatsapp-embedded-signup-tests.mjs drives every
 * branch with mocks (no live Meta call).
 *
 * Per Meta's docs (read 2026-11-03):
 * - Embedded Signup v2/v3 were deprecated on 2026-10-15; v4 is chosen by
 *   creating a NEW Facebook Login for Business configuration with products
 *   selected. The client calls FB.login({ config_id, response_type: "code",
 *   override_default_response_type: true, extras: { setup: {} } }).
 * - The popup posts `{ type: "WA_EMBEDDED_SIGNUP", event, data }` from a
 *   facebook.com origin. FINISH carries phone_number_id + waba_id (+ business_id).
 *   The `code` lives 30 seconds.
 * - Server side, in order: GET /oauth/access_token (client_id, client_secret,
 *   code) -> business token; POST /<WABA_ID>/subscribed_apps; POST
 *   /<PHONE_NUMBER_ID>/register { messaging_product: "whatsapp", pin } (6-digit
 *   two-step PIN; at most 10 register calls per number per 72 h). The customer
 *   adds a payment method in WhatsApp Manager themselves.
 */

/* ------------------------------------------------------------------ *
 * Client: Meta's postMessage
 * ------------------------------------------------------------------ */

export type EmbeddedSignupEvent =
  | { kind: "finish"; finishType: string; wabaId: string; phoneNumberId: string | null; businessId: string | null }
  | { kind: "cancel"; currentStep: string | null }
  | { kind: "error"; message: string; code: string | null; sessionId: string | null };

const ID = /^\d{1,32}$/;

/** True for an origin Meta's docs say the event comes from (`*.facebook.com`, https only). */
export function isMetaOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && (url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com"));
  } catch {
    return false;
  }
}

function str(value: unknown, max = 200): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
}

/**
 * Parses one `message` event payload (already origin-checked). Anything that
 * isn't a well-formed WA_EMBEDDED_SIGNUP event returns null and is ignored.
 * Ids must be numeric strings: they are later used in Graph paths.
 */
export function parseEmbeddedSignupEvent(raw: unknown): EmbeddedSignupEvent | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const { type, event, data } = value as { type?: unknown; event?: unknown; data?: unknown };
  if (type !== "WA_EMBEDDED_SIGNUP" || typeof event !== "string") return null;
  const payload = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;

  if (event === "CANCEL") return { kind: "cancel", currentStep: str(payload.current_step, 64) };
  if (event === "ERROR") {
    return {
      kind: "error",
      message: str(payload.error_message, 300) ?? "Meta reported an error during signup.",
      code: payload.error_code === undefined ? null : String(payload.error_code).slice(0, 32),
      sessionId: str(payload.session_id, 64),
    };
  }
  if (event.startsWith("FINISH")) {
    const wabaId = str(payload.waba_id, 32);
    if (!wabaId || !ID.test(wabaId)) return null;
    const phone = str(payload.phone_number_id, 32);
    const business = str(payload.business_id, 32);
    return {
      kind: "finish",
      finishType: event.slice(0, 64),
      wabaId,
      phoneNumberId: phone && ID.test(phone) ? phone : null,
      businessId: business && ID.test(business) ? business : null,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Server: onboarding steps
 * ------------------------------------------------------------------ */

export type GraphCallResult =
  | { ok: true; data: unknown }
  | { ok: false; status: number; error: { code?: number; message?: string; error_user_msg?: string } | null };

export type GraphCaller = (
  method: "GET" | "POST",
  path: string,
  options?: { token?: string; query?: Record<string, string>; json?: unknown },
) => Promise<GraphCallResult>;

export type OnboardingStep = "exchange" | "phone_lookup" | "subscribe" | "register";

export type OnboardingFailureCode =
  | "exchange_failed"
  | "phone_not_in_waba"
  | "phone_lookup_failed"
  | "subscribe_failed"
  | "register_failed"
  | "register_rate_limited"
  | "register_pin_mismatch";

export type OnboardingResult =
  | {
      ok: true;
      token: string;
      phone: { id: string; displayPhoneNumber: string; verifiedName: string | null };
    }
  | {
      ok: false;
      step: OnboardingStep;
      code: OnboardingFailureCode;
      /** The business token when the exchange already succeeded, so a later step can be retried without a new code. */
      token: string | null;
      phone: { id: string; displayPhoneNumber: string; verifiedName: string | null } | null;
      metaCode: number | null;
      metaMessage: string | null;
    };

function failure(
  step: OnboardingStep,
  code: OnboardingFailureCode,
  result: GraphCallResult | null,
  token: string | null = null,
  phone: Extract<OnboardingResult, { ok: true }>["phone"] | null = null,
): OnboardingResult {
  const error = result && !result.ok ? result.error : null;
  return {
    ok: false,
    step,
    code,
    token,
    phone,
    metaCode: error?.code ?? null,
    metaMessage: (error?.error_user_msg ?? error?.message ?? null)?.slice(0, 300) ?? null,
  };
}

/** A random 6-digit PIN (the number's two-step verification PIN). `random` returns [0, 1). */
export function generateRegistrationPin(random: () => number = Math.random): string {
  return String(Math.floor(random() * 1_000_000)).padStart(6, "0");
}

/**
 * Exchange the code, confirm the phone number belongs to the WABA, subscribe
 * our app to the WABA's webhooks, register the number. Stops at the first
 * failing step. Never throws, never logs (the caller logs step + codes only).
 */
export async function runEmbeddedSignupOnboarding(
  graph: GraphCaller,
  input: { appId: string; appSecret: string; code: string; wabaId: string; phoneNumberId: string; pin: string },
): Promise<OnboardingResult> {
  const exchange = await graph("GET", "/oauth/access_token", {
    query: { client_id: input.appId, client_secret: input.appSecret, code: input.code },
  });
  const token = exchange.ok ? str((exchange.data as { access_token?: unknown })?.access_token, 4096) : null;
  if (!exchange.ok || !token) return failure("exchange", "exchange_failed", exchange);

  return finishEmbeddedSignupOnboarding(graph, { token, wabaId: input.wabaId, phoneNumberId: input.phoneNumberId, pin: input.pin });
}

/** Everything after the exchange, with a stored token: also the "Finish setup" retry. */
export async function finishEmbeddedSignupOnboarding(
  graph: GraphCaller,
  input: { token: string; wabaId: string; phoneNumberId: string; pin: string },
): Promise<OnboardingResult> {
  const { token } = input;
  const numbers = await graph("GET", `/${input.wabaId}/phone_numbers`, {
    token,
    query: { fields: "id,display_phone_number,verified_name", limit: "100" },
  });
  if (!numbers.ok) return failure("phone_lookup", "phone_lookup_failed", numbers, token);
  const list = ((numbers.data as { data?: unknown })?.data ?? []) as Array<Record<string, unknown>>;
  const match = Array.isArray(list) ? list.find((entry) => entry && entry.id === input.phoneNumberId) : undefined;
  if (!match) return failure("phone_lookup", "phone_not_in_waba", null, token);
  const phone = {
    id: input.phoneNumberId,
    displayPhoneNumber: str(match.display_phone_number, 32) ?? input.phoneNumberId,
    verifiedName: str(match.verified_name, 200),
  };

  const subscribe = await graph("POST", `/${input.wabaId}/subscribed_apps`, { token });
  if (!subscribe.ok) return failure("subscribe", "subscribe_failed", subscribe, token, phone);

  const register = await graph("POST", `/${input.phoneNumberId}/register`, {
    token,
    json: { messaging_product: "whatsapp", pin: input.pin },
  });
  if (!register.ok) {
    const metaCode = register.error?.code;
    // 133016: over 10 register attempts per number in 72 h. 133005: two-step
    // verification PIN mismatch (the number already has a different PIN).
    const code: OnboardingFailureCode =
      metaCode === 133016 ? "register_rate_limited" : metaCode === 133005 ? "register_pin_mismatch" : "register_failed";
    return failure("register", code, register, token, phone);
  }

  return { ok: true, token, phone };
}

/** What the owner sees for each failure (never Meta's raw text alone). */
export function onboardingFailureMessage(code: OnboardingFailureCode): string {
  switch (code) {
    case "exchange_failed":
      return "Meta didn't accept the signup (the confirmation expires after 30 seconds). Please run Connect with Facebook again.";
    case "phone_not_in_waba":
      return "The phone number you picked isn't in the WhatsApp Business account you picked. Run the signup again and choose matching ones.";
    case "phone_lookup_failed":
      return "We couldn't read the phone numbers in your WhatsApp Business account. Try Finish setup again in a minute.";
    case "subscribe_failed":
      return "Meta refused to send this account's messages to us. Try Finish setup again; if it keeps failing, contact support.";
    case "register_rate_limited":
      return "Meta limits number registration to 10 attempts in 72 hours, and that limit was reached. Try Finish setup again later.";
    case "register_pin_mismatch":
      return "This number already has a WhatsApp two-step verification PIN. Turn it off in WhatsApp Manager (Phone numbers > Two-step verification), then press Finish setup.";
    case "register_failed":
      return "Meta didn't finish registering the phone number. Try Finish setup again; if it keeps failing, contact support.";
  }
}

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

export const TEMPLATE_STATUSES = [
  "APPROVED",
  "PENDING",
  "REJECTED",
  "PAUSED",
  "DISABLED",
  "IN_APPEAL",
  "LIMIT_EXCEEDED",
  "ARCHIVED",
  "DELETED",
  "PENDING_DELETION",
  "FLAGGED",
  "REINSTATED",
  "LOCKED",
  "UNARCHIVED",
  "NOT_SUBMITTED",
  "SUBMIT_FAILED",
] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export function normaliseTemplateStatus(raw: unknown): TemplateStatus | null {
  if (typeof raw !== "string") return null;
  const upper = raw.toUpperCase();
  return (TEMPLATE_STATUSES as readonly string[]).includes(upper) ? (upper as TemplateStatus) : null;
}

/** POST /<WABA_ID>/message_templates body for one of our UTILITY templates (positional {{n}} params with examples). */
export function buildTemplateCreateBody(definition: {
  name: string;
  language: string;
  body: string;
  example: string[];
}): Record<string, unknown> {
  return {
    name: definition.name,
    language: definition.language,
    category: "UTILITY",
    parameter_format: "POSITIONAL",
    components: [{ type: "BODY", text: definition.body, example: { body_text: [definition.example] } }],
  };
}

export type TemplateListEntry = {
  id: string | null;
  name: string;
  language: string;
  status: TemplateStatus;
  category: string | null;
  rejectedReason: string | null;
};

/** Parses GET /<WABA_ID>/message_templates (fields=id,name,language,status,category,rejected_reason). */
export function parseTemplateList(data: unknown): TemplateListEntry[] {
  const list = (data as { data?: unknown })?.data;
  if (!Array.isArray(list)) return [];
  const out: TemplateListEntry[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const name = str(record.name, 512);
    const language = str(record.language, 16);
    const status = normaliseTemplateStatus(record.status);
    if (!name || !language || !status) continue;
    const rejected = str(record.rejected_reason, 64);
    out.push({
      id: str(record.id, 64),
      name,
      language,
      status,
      category: str(record.category, 32),
      rejectedReason: rejected && rejected !== "NONE" ? rejected : null,
    });
  }
  return out;
}

export type TemplateStatusUpdate = {
  wabaId: string;
  templateId: string | null;
  name: string;
  language: string;
  status: TemplateStatus;
  reason: string | null;
};

/** The `message_template_status_update` webhook change(s) in a WhatsApp webhook body. */
export function parseTemplateStatusUpdates(body: unknown): TemplateStatusUpdate[] {
  const entries = (body as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return [];
  const out: TemplateStatusUpdate[] = [];
  for (const entry of entries) {
    const wabaId = str((entry as { id?: unknown })?.id, 32);
    const changes = (entry as { changes?: unknown })?.changes;
    if (!wabaId || !ID.test(wabaId) || !Array.isArray(changes)) continue;
    for (const change of changes) {
      if ((change as { field?: unknown })?.field !== "message_template_status_update") continue;
      const value = ((change as { value?: unknown })?.value ?? {}) as Record<string, unknown>;
      const name = str(value.message_template_name, 512);
      const language = str(value.message_template_language, 16);
      const status = normaliseTemplateStatus(value.event);
      if (!name || !language || !status) continue;
      const reason = str(value.reason, 200);
      out.push({
        wabaId,
        templateId: value.message_template_id === undefined ? null : String(value.message_template_id).slice(0, 64),
        name,
        language,
        status,
        reason: reason && reason !== "NONE" ? reason : null,
      });
    }
  }
  return out;
}

/** One line per template state, for the owner. */
export function describeTemplateStatus(status: TemplateStatus): { label: string; tone: "ok" | "wait" | "bad" | "none" } {
  switch (status) {
    case "APPROVED":
    case "REINSTATED":
    case "UNARCHIVED":
      return { label: "Approved", tone: "ok" };
    case "PENDING":
    case "IN_APPEAL":
      return { label: "Waiting for Meta's review", tone: "wait" };
    case "NOT_SUBMITTED":
      return { label: "Not submitted yet", tone: "none" };
    case "SUBMIT_FAILED":
      return { label: "Couldn't submit", tone: "bad" };
    case "REJECTED":
      return { label: "Rejected by Meta", tone: "bad" };
    default:
      return { label: status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " "), tone: "bad" };
  }
}
