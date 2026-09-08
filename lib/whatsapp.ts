import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Conversation, WhatsappConnection } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";
import { createConversation } from "@/lib/conversations";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const VERIFY_TIMEOUT_MS = 10_000;

/** Reads a business's own WhatsApp connection (no token). `businessId` must come from `requireBusinessContext()`. */
export async function getWhatsappConnectionForBusiness(businessId: string): Promise<WhatsappConnection | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("whatsapp_connections")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    throw new AppError(
      "Something went wrong loading your WhatsApp connection. Please try again.",
      "getWhatsappConnectionForBusiness failed",
      error,
    );
  }

  return data;
}

export type ConnectWhatsappInput = {
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber: string;
  accessToken: string;
};

export type ConnectWhatsappResult =
  | { success: true; connection: WhatsappConnection }
  | { success: false; error: string };

/**
 * Verifies the submitted token/phone_number_id against Meta's Graph API
 * before writing anything (a typo'd token/id must not silently sit
 * `status='connected'` and then fail on every real inbound message), then
 * upserts both whatsapp_connections and whatsapp_credentials. Uses the
 * service-role client even though the caller is an authenticated admin --
 * whatsapp_credentials has zero `authenticated` grant by design (see the
 * migration's doc comment); authorization is already enforced by the
 * calling Server Action's requireMinRole("org:admin") before this runs,
 * same pattern as lib/tools/request-callback.ts's service-role writes on
 * the widget's already-authorized path.
 */
export async function connectWhatsappNumber(
  businessId: string,
  input: ConnectWhatsappInput,
): Promise<ConnectWhatsappResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  let verifiedName: string | null = null;
  try {
    const response = await fetch(
      `${GRAPH_API_BASE}/${encodeURIComponent(input.phoneNumberId)}?fields=verified_name,display_phone_number`,
      {
        headers: { Authorization: `Bearer ${input.accessToken}` },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return { success: false, error: "Meta rejected this phone number ID or access token. Double-check both and try again." };
    }

    const body = (await response.json()) as { verified_name?: string };
    verifiedName = body.verified_name ?? null;
  } catch {
    return { success: false, error: "Couldn't reach Meta's API to verify this connection. Please try again." };
  } finally {
    clearTimeout(timeout);
  }

  const supabase = createServiceSupabaseClient();
  const nowIso = new Date().toISOString();

  const { error: credentialsError } = await supabase.from("whatsapp_credentials").upsert(
    { business_id: businessId, access_token: input.accessToken, token_updated_at: nowIso },
    { onConflict: "business_id" },
  );

  if (credentialsError) {
    throw new AppError(
      "Something went wrong saving your WhatsApp credentials. Please try again.",
      "connectWhatsappNumber credentials upsert failed",
      credentialsError,
    );
  }

  const { data: connection, error: connectionError } = await supabase
    .from("whatsapp_connections")
    .upsert(
      {
        business_id: businessId,
        phone_number_id: input.phoneNumberId,
        waba_id: input.wabaId,
        display_phone_number: input.displayPhoneNumber,
        verified_name: verifiedName,
        status: "connected",
        last_verified_at: nowIso,
        last_error: null,
        connected_at: nowIso,
        access_token_last4: input.accessToken.slice(-4),
        updated_at: nowIso,
      },
      { onConflict: "business_id" },
    )
    .select()
    .single();

  if (connectionError) {
    throw new AppError(
      "Something went wrong saving your WhatsApp connection. Please try again.",
      "connectWhatsappNumber connection upsert failed",
      connectionError,
    );
  }

  return { success: true, connection };
}

/** Removes a business's WhatsApp connection and credentials. Returns the deleted connection's id, or `null` if none existed. */
export async function disconnectWhatsappNumber(businessId: string): Promise<string | null> {
  const supabase = createServiceSupabaseClient();

  const { data: deletedConnections, error: connectionError } = await supabase
    .from("whatsapp_connections")
    .delete()
    .eq("business_id", businessId)
    .select("id");

  if (connectionError) {
    throw new AppError(
      "Something went wrong disconnecting WhatsApp. Please try again.",
      "disconnectWhatsappNumber connection delete failed",
      connectionError,
    );
  }

  await supabase.from("whatsapp_credentials").delete().eq("business_id", businessId);

  return deletedConnections?.[0]?.id ?? null;
}

/**
 * Resolves an inbound webhook's `phone_number_id` to a business_id --
 * used only by app/api/webhooks/whatsapp/route.ts. A connection that
 * isn't `status = 'connected'` (e.g. mid-setup or errored) resolves to
 * null, same fail-closed shape as resolveBusinessFromWidgetKey().
 */
export async function resolveBusinessFromWhatsappPhoneNumberId(
  supabase: ServiceSupabaseClient,
  phoneNumberId: string,
): Promise<{ businessId: string } | null> {
  const { data, error } = await supabase
    .from("whatsapp_connections")
    .select("business_id")
    .eq("phone_number_id", phoneNumberId)
    .eq("status", "connected")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return { businessId: data.business_id };
}

export const WHATSAPP_CONVERSATION_SOURCE = "whatsapp";

/**
 * Finds this WhatsApp sender's most recent conversation with the
 * business, or starts a new one. Reuses the existing `visitor_id` column
 * (a WhatsApp id is ~15 digits, well within its ≤100 char limit) rather
 * than adding a new column -- but unlike the widget's client-generated
 * `visitorId` (explicitly documented in lib/conversations.ts as never an
 * identity/authorization signal, since any visitor can set it), this
 * value comes from Meta's own HMAC-verified webhook payload
 * (app/api/webhooks/whatsapp/route.ts verifies X-Hub-Signature-256
 * before this is ever called). Still: never treat `visitor_id` as an
 * authorization key from any *unauthenticated* read path -- there is
 * none today, but a future one must not assume this column is safe to
 * trust blindly in every context, since the widget's own writes into it
 * remain unauthenticated.
 */
export async function getOrCreateWhatsappConversation(
  supabase: ServiceSupabaseClient,
  businessId: string,
  waId: string,
): Promise<Conversation> {
  const { data: existing, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("business_id", businessId)
    .eq("source", WHATSAPP_CONVERSATION_SOURCE)
    .eq("visitor_id", waId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError(
      "Something went wrong loading this WhatsApp conversation. Please try again.",
      "getOrCreateWhatsappConversation lookup failed",
      error,
    );
  }

  if (existing) {
    return existing;
  }

  return createConversation(supabase, businessId, WHATSAPP_CONVERSATION_SOURCE, null, waId);
}
