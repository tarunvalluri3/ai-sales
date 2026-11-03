import "server-only";
import { randomInt } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { graphRequest, graphBase, hasTokenEncryptionKey, openToken, sealToken } from "@/lib/meta-graph";
import { getWhatsappAccessToken, whatsappTokenColumns } from "@/lib/whatsapp-token";
import { logEvent } from "@/lib/logger";
import type { WhatsappConnection } from "@/lib/supabase/types";
import {
  finishEmbeddedSignupOnboarding,
  generateRegistrationPin,
  onboardingFailureMessage,
  runEmbeddedSignupOnboarding,
  type GraphCaller,
  type OnboardingResult,
  type OnboardingStep,
} from "@/lib/whatsapp-embedded-signup-rules";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * WhatsApp Embedded Signup, server side (production readiness item 6). The
 * steps and their rules are in lib/whatsapp-embedded-signup-rules.ts; this
 * module supplies the real Graph caller, stores the result, and makes every
 * failure visible on the connection (`setup_step` / `setup_error`) so the owner
 * can press "Finish setup" (retried with the stored token -- the signup code is
 * single-use and lives 30 seconds).
 *
 * Tokens and the registration PIN are stored ENCRYPTED (META_TOKEN_ENCRYPTION_KEY);
 * Embedded Signup refuses to run without that key. Nothing here logs a token,
 * the PIN, the code or the app secret.
 */

export type EmbeddedSignupClientConfig = { appId: string; configId: string; graphVersion: string };

/**
 * Null when Embedded Signup isn't configured on this deployment: the page then
 * shows only the manual form. Needs META_APP_ID, META_APP_SECRET,
 * WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID and META_TOKEN_ENCRYPTION_KEY.
 */
export function getEmbeddedSignupClientConfig(): EmbeddedSignupClientConfig | null {
  const appId = process.env.META_APP_ID?.trim();
  const configId = process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim();
  if (!appId || !configId || !process.env.META_APP_SECRET?.trim() || !hasTokenEncryptionKey()) return null;
  return { appId, configId, graphVersion: graphBase().split("/").pop() ?? "v26.0" };
}

const graphCaller: GraphCaller = async (method, path, options) => {
  const result = await graphRequest<unknown>(method, path, options ?? {});
  return result.ok ? { ok: true, data: result.data } : { ok: false, status: result.status, error: result.error };
};

/** The last step that succeeded, for `whatsapp_connections.setup_step`. */
function stepReached(result: OnboardingResult): WhatsappConnection["setup_step"] {
  if (result.ok) return "complete";
  const previous: Record<OnboardingStep, WhatsappConnection["setup_step"]> = {
    exchange: null,
    phone_lookup: "token_exchanged",
    subscribe: "phone_verified",
    register: "waba_subscribed",
  };
  return previous[result.step];
}

function logOutcome(businessId: string, result: OnboardingResult, attempt: "signup" | "retry"): void {
  if (result.ok) {
    logEvent("whatsapp_embedded_signup_complete", businessId, { attempt });
  } else {
    logEvent(
      "whatsapp_embedded_signup_failed",
      businessId,
      { attempt, step: result.step, code: result.code, metaCode: result.metaCode, metaMessage: result.metaMessage },
      "error",
    );
  }
}

export type EmbeddedSignupOutcome =
  | { ok: true; connection: WhatsappConnection; complete: boolean; message: string | null }
  | { ok: false; error: string };

/**
 * Runs the whole onboarding for a FINISH event + code. Nothing is stored when
 * the code exchange fails (there is no token to keep). After a successful
 * exchange the connection is always stored -- status `connected` only when
 * every step passed, otherwise `error` with the failed step -- so a later step
 * can be retried without running the popup again.
 */
export async function completeEmbeddedSignup(
  businessId: string,
  input: { code: string; wabaId: string; phoneNumberId: string; metaBusinessId: string | null },
): Promise<EmbeddedSignupOutcome> {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret || !hasTokenEncryptionKey()) {
    return { ok: false, error: "WhatsApp signup isn't set up on our side yet. Please contact support." };
  }

  const pin = generateRegistrationPin(() => randomInt(0, 1_000_000) / 1_000_000);
  const result = await runEmbeddedSignupOnboarding(graphCaller, { appId, appSecret, ...input, pin });
  logOutcome(businessId, result, "signup");

  if (!result.ok && result.token === null) {
    return { ok: false, error: onboardingFailureMessage(result.code) };
  }

  const supabase = createServiceSupabaseClient();
  return storeOnboardingResult(supabase, businessId, result, {
    wabaId: input.wabaId,
    phoneNumberId: input.phoneNumberId,
    metaBusinessId: input.metaBusinessId,
    pin,
  });
}

/** "Finish setup": re-runs the steps after the exchange with the stored token and PIN. */
export async function retryEmbeddedSignupSetup(businessId: string): Promise<EmbeddedSignupOutcome> {
  const supabase = createServiceSupabaseClient();
  const { data: connection } = await supabase
    .from("whatsapp_connections")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle<WhatsappConnection>();
  if (!connection || connection.onboarding_method !== "embedded_signup") {
    return { ok: false, error: "There's no WhatsApp signup to finish. Connect with Facebook first." };
  }
  const token = await getWhatsappAccessToken(supabase, businessId);
  if (!token) return { ok: false, error: "We no longer have access to this WhatsApp account. Disconnect it and connect again." };

  const { data: credentials } = await supabase
    .from("whatsapp_credentials")
    .select("registration_pin_encrypted")
    .eq("business_id", businessId)
    .maybeSingle<{ registration_pin_encrypted: string | null }>();
  let pin: string;
  try {
    pin = credentials?.registration_pin_encrypted
      ? openToken(credentials.registration_pin_encrypted)
      : generateRegistrationPin(() => randomInt(0, 1_000_000) / 1_000_000);
  } catch {
    return { ok: false, error: "We couldn't read the saved setup details. Disconnect WhatsApp and connect again." };
  }

  const result = await finishEmbeddedSignupOnboarding(graphCaller, {
    token,
    wabaId: connection.waba_id,
    phoneNumberId: connection.phone_number_id,
    pin,
  });
  logOutcome(businessId, result, "retry");
  return storeOnboardingResult(supabase, businessId, result, {
    wabaId: connection.waba_id,
    phoneNumberId: connection.phone_number_id,
    metaBusinessId: connection.meta_business_id ?? null,
    pin,
  });
}

async function storeOnboardingResult(
  supabase: ServiceSupabaseClient,
  businessId: string,
  result: OnboardingResult,
  ids: { wabaId: string; phoneNumberId: string; metaBusinessId: string | null; pin: string },
): Promise<EmbeddedSignupOutcome> {
  const token = result.token;
  if (!token) return { ok: false, error: "WhatsApp setup failed. Please try again." };
  const nowIso = new Date().toISOString();

  const { error: credentialsError } = await supabase.from("whatsapp_credentials").upsert(
    {
      business_id: businessId,
      ...whatsappTokenColumns(token),
      registration_pin_encrypted: sealToken(ids.pin),
      token_updated_at: nowIso,
    },
    { onConflict: "business_id" },
  );
  if (credentialsError) {
    logEvent("whatsapp_embedded_signup_store_failed", businessId, { table: "credentials", code: credentialsError.code ?? "unknown" }, "error");
    return { ok: false, error: "We couldn't save your WhatsApp connection. Please try again." };
  }

  const complete = result.ok;
  const failureMessage = result.ok ? null : onboardingFailureMessage(result.code);
  const { data: connection, error: connectionError } = await supabase
    .from("whatsapp_connections")
    .upsert(
      {
        business_id: businessId,
        phone_number_id: ids.phoneNumberId,
        waba_id: ids.wabaId,
        display_phone_number: result.phone?.displayPhoneNumber ?? ids.phoneNumberId,
        verified_name: result.phone?.verifiedName ?? null,
        status: complete ? "connected" : "error",
        last_verified_at: nowIso,
        last_error: failureMessage,
        connected_at: complete ? nowIso : null,
        access_token_last4: token.slice(-4),
        onboarding_method: "embedded_signup",
        setup_step: stepReached(result),
        setup_error: result.ok ? null : result.code,
        meta_business_id: ids.metaBusinessId,
        updated_at: nowIso,
      },
      { onConflict: "business_id" },
    )
    .select()
    .single<WhatsappConnection>();

  if (connectionError) {
    // Don't leave a token behind without a connection that explains it.
    const { data: existing } = await supabase.from("whatsapp_connections").select("id").eq("business_id", businessId).maybeSingle();
    if (!existing) await supabase.from("whatsapp_credentials").delete().eq("business_id", businessId);
    // 23505 on phone_number_id: this number is already connected to another business.
    if (connectionError.code === "23505") {
      return { ok: false, error: "This WhatsApp number is already connected to another business on our platform." };
    }
    logEvent("whatsapp_embedded_signup_store_failed", businessId, { table: "connections", code: connectionError.code ?? "unknown" }, "error");
    return { ok: false, error: "We couldn't save your WhatsApp connection. Please try again." };
  }

  return { ok: true, connection, complete, message: failureMessage };
}
