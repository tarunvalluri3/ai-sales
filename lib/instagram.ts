import "server-only";
import crypto from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Conversation, InstagramConnection } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";
import { logEvent } from "@/lib/logger";
import { createConversation } from "@/lib/conversations";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Phase 26's Instagram DM integration -- mirrors lib/whatsapp.ts's shape
 * (connection CRUD, business_id resolution, conversation get-or-create)
 * except for the one thing WhatsApp never needed: OAuth. Instagram
 * business messaging requires a business to connect *through this app's
 * own Meta App* via Meta's "Instagram API with Instagram Login" business
 * login flow, rather than pasting a permanent token generated directly in
 * their own Meta Business Manager. Every endpoint below was live-verified
 * against developers.facebook.com during implementation (2026-09-12), not
 * assumed from training data -- see STATE.md for the confirmed values.
 */

const OAUTH_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const SHORT_LIVED_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const LONG_LIVED_TOKEN_URL = "https://graph.instagram.com/access_token";
const REFRESH_TOKEN_URL = "https://graph.instagram.com/refresh_access_token";
const GRAPH_API_VERSION = "v25.0";
const GRAPH_API_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;
const OAUTH_SCOPES = "instagram_business_basic,instagram_business_manage_messages";
const STATE_TTL_MS = 10 * 60 * 1000;
const REFRESH_WINDOW_DAYS = 5;
const REQUEST_TIMEOUT_MS = 10_000;

function errorMessageOnly(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Reads a business's own Instagram connection (no token). `businessId` must come from `requireBusinessContext()`. */
export async function getInstagramConnectionForBusiness(businessId: string): Promise<InstagramConnection | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("instagram_connections")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    throw new AppError(
      "Something went wrong loading your Instagram connection. Please try again.",
      "getInstagramConnectionForBusiness failed",
      error,
    );
  }

  return data;
}

/**
 * Starts the OAuth flow: generates a single-use, short-lived CSRF state
 * token, records it (service-role only -- never client-readable) against
 * the already-authenticated caller's businessId/userId, and returns
 * Meta's authorize URL to redirect to. `businessId`/`userId` must come
 * from `requireBusinessContext()` -- this is where authorization is
 * actually enforced (the callback route that consumes this state later
 * has no Clerk session to check against).
 */
export async function buildInstagramAuthorizeUrl(
  businessId: string,
  userId: string,
): Promise<{ url: string }> {
  const appId = process.env.INSTAGRAM_APP_ID;
  const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI;
  if (!appId || !redirectUri) {
    throw new AppError(
      "Instagram isn't configured yet. Please try again later.",
      "buildInstagramAuthorizeUrl missing INSTAGRAM_APP_ID or INSTAGRAM_OAUTH_REDIRECT_URI",
    );
  }

  const state = crypto.randomBytes(32).toString("base64url");
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("instagram_oauth_states").insert({
    state,
    business_id: businessId,
    initiated_by_user_id: userId,
    expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  });

  if (error) {
    throw new AppError(
      "Something went wrong starting the Instagram connection. Please try again.",
      "buildInstagramAuthorizeUrl state insert failed",
      error,
    );
  }

  const url = new URL(OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OAUTH_SCOPES);
  url.searchParams.set("state", state);

  return { url: url.toString() };
}

export type ConnectInstagramResult =
  | { success: true; connection: InstagramConnection; initiatedByUserId: string }
  | { success: false; error: string };

/**
 * Completes the OAuth round-trip: consumes the CSRF state (single-use,
 * fail-closed if missing/expired -- this IS the callback's entire trust
 * mechanism, since Meta's redirect carries no Clerk session), exchanges
 * the authorization code for a short-lived then long-lived token, looks
 * up the connected account's username, and upserts both
 * instagram_credentials and instagram_connections via the service-role
 * client (same "authorization already checked upstream" pattern as
 * connectWhatsappNumber() -- here, checked when the state row was
 * created, not at write time, since there is no session to check now).
 */
export async function completeInstagramOAuthCallback(
  code: string,
  state: string,
): Promise<ConnectInstagramResult> {
  const supabase = createServiceSupabaseClient();

  const { data: stateRow, error: stateError } = await supabase
    .from("instagram_oauth_states")
    .delete()
    .eq("state", state)
    .select("business_id, initiated_by_user_id, expires_at")
    .maybeSingle();

  if (stateError || !stateRow) {
    return { success: false, error: "This connection link is invalid or was already used. Please try connecting again." };
  }

  if (new Date(stateRow.expires_at) < new Date()) {
    return { success: false, error: "This connection link expired. Please try connecting again." };
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    return { success: false, error: "Instagram isn't configured yet. Please try again later." };
  }

  let shortLivedToken: string;
  let instagramBusinessAccountId: string;
  try {
    const body = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });
    const response = await fetchWithTimeout(SHORT_LIVED_TOKEN_URL, { method: "POST", body });
    if (!response.ok) {
      return { success: false, error: "Meta rejected this connection attempt. Please try connecting again." };
    }
    const parsed = (await response.json()) as { access_token?: string; user_id?: number | string };
    if (!parsed.access_token || parsed.user_id == null) {
      return { success: false, error: "Meta returned an unexpected response. Please try connecting again." };
    }
    shortLivedToken = parsed.access_token;
    instagramBusinessAccountId = String(parsed.user_id);
  } catch {
    return { success: false, error: "Couldn't reach Meta's API to complete this connection. Please try again." };
  }

  let longLivedToken: string;
  let expiresInSeconds: number;
  try {
    const url = new URL(LONG_LIVED_TOKEN_URL);
    url.searchParams.set("grant_type", "ig_exchange_token");
    url.searchParams.set("client_secret", appSecret);
    url.searchParams.set("access_token", shortLivedToken);
    const response = await fetchWithTimeout(url.toString());
    if (!response.ok) {
      return { success: false, error: "Meta rejected this connection attempt. Please try connecting again." };
    }
    const parsed = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!parsed.access_token) {
      return { success: false, error: "Meta returned an unexpected response. Please try connecting again." };
    }
    longLivedToken = parsed.access_token;
    expiresInSeconds = parsed.expires_in ?? 60 * 24 * 60 * 60;
  } catch {
    return { success: false, error: "Couldn't reach Meta's API to complete this connection. Please try again." };
  }

  // Getting a valid token only proves the credentials work -- it does not
  // tell Meta to actually deliver this account's messages to our webhook.
  // That requires this separate subscription call, unconditionally on
  // every connect/reconnect (idempotent at Meta's end). Same "verify
  // first, subscribe second, write third" invariant as
  // connectWhatsappNumber()'s WABA subscription call: a subscription
  // failure must not silently leave `status='connected'` while Meta
  // never sends us a single message.
  try {
    const url = new URL(`${GRAPH_API_BASE}/me/subscribed_apps`);
    url.searchParams.set("subscribed_fields", "messages");
    url.searchParams.set("access_token", longLivedToken);
    const response = await fetchWithTimeout(url.toString(), { method: "POST" });
    if (!response.ok) {
      return {
        success: false,
        error: "Meta accepted your credentials but refused to enable message delivery for this Instagram account. Please try connecting again.",
      };
    }
  } catch {
    return {
      success: false,
      error: "Couldn't reach Meta's API to enable message delivery for this Instagram account. Please try again.",
    };
  }

  let igUsername: string | null = null;
  try {
    const url = new URL(`${GRAPH_API_BASE}/me`);
    url.searchParams.set("fields", "username");
    url.searchParams.set("access_token", longLivedToken);
    const response = await fetchWithTimeout(url.toString());
    if (response.ok) {
      const parsed = (await response.json()) as { username?: string };
      igUsername = parsed.username ?? null;
    }
  } catch {
    // Non-fatal -- the connection still works without a display username.
  }

  const nowIso = new Date().toISOString();

  const { error: credentialsError } = await supabase.from("instagram_credentials").upsert(
    { business_id: stateRow.business_id, access_token: longLivedToken, token_updated_at: nowIso },
    { onConflict: "business_id" },
  );

  if (credentialsError) {
    throw new AppError(
      "Something went wrong saving your Instagram credentials. Please try again.",
      "completeInstagramOAuthCallback credentials upsert failed",
      credentialsError,
    );
  }

  const { data: connection, error: connectionError } = await supabase
    .from("instagram_connections")
    .upsert(
      {
        business_id: stateRow.business_id,
        instagram_business_account_id: instagramBusinessAccountId,
        ig_username: igUsername,
        status: "connected",
        token_expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
        access_token_last4: longLivedToken.slice(-4),
        last_verified_at: nowIso,
        last_error: null,
        connected_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "business_id" },
    )
    .select()
    .single();

  if (connectionError) {
    throw new AppError(
      "Something went wrong saving your Instagram connection. Please try again.",
      "completeInstagramOAuthCallback connection upsert failed",
      connectionError,
    );
  }

  return { success: true, connection, initiatedByUserId: stateRow.initiated_by_user_id };
}

/** Removes a business's Instagram connection and credentials. Returns the deleted connection's id, or `null` if none existed. */
export async function disconnectInstagramNumber(businessId: string): Promise<string | null> {
  const supabase = createServiceSupabaseClient();

  const { data: deletedConnections, error: connectionError } = await supabase
    .from("instagram_connections")
    .delete()
    .eq("business_id", businessId)
    .select("id");

  if (connectionError) {
    throw new AppError(
      "Something went wrong disconnecting Instagram. Please try again.",
      "disconnectInstagramNumber connection delete failed",
      connectionError,
    );
  }

  await supabase.from("instagram_credentials").delete().eq("business_id", businessId);

  return deletedConnections?.[0]?.id ?? null;
}

/**
 * Resolves an inbound webhook's receiving-account id to a business_id --
 * used only by app/api/webhooks/instagram/route.ts. A connection that
 * isn't `status = 'connected'` resolves to null, same fail-closed shape
 * as resolveBusinessFromWhatsappPhoneNumberId().
 */
export async function resolveBusinessFromInstagramAccountId(
  supabase: ServiceSupabaseClient,
  instagramBusinessAccountId: string,
): Promise<{ businessId: string } | null> {
  const { data, error } = await supabase
    .from("instagram_connections")
    .select("business_id")
    .eq("instagram_business_account_id", instagramBusinessAccountId)
    .eq("status", "connected")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return { businessId: data.business_id };
}

export const INSTAGRAM_CONVERSATION_SOURCE = "instagram";

/**
 * Finds this Instagram sender's most recent conversation with the
 * business, or starts a new one. Reuses `visitor_id`, same pattern as
 * getOrCreateWhatsappConversation() -- the id comes from Meta's own
 * HMAC-verified webhook payload, never client input.
 */
export async function getOrCreateInstagramConversation(
  supabase: ServiceSupabaseClient,
  businessId: string,
  igSenderId: string,
): Promise<Conversation> {
  const { data: existing, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("business_id", businessId)
    .eq("source", INSTAGRAM_CONVERSATION_SOURCE)
    .eq("visitor_id", igSenderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError(
      "Something went wrong loading this Instagram conversation. Please try again.",
      "getOrCreateInstagramConversation lookup failed",
      error,
    );
  }

  if (existing) {
    return existing;
  }

  return createConversation(supabase, businessId, INSTAGRAM_CONVERSATION_SOURCE, null, igSenderId);
}

/**
 * Refreshes one business's long-lived token before it expires. Meta's
 * refresh re-uses the existing long-lived token as input (no separate
 * refresh_token, confirmed live) -- the token must be at least 24h old
 * and not yet expired. On failure, marks the connection `error` with safe
 * copy and leaves the still-technically-valid existing token in place
 * (only ever replaced on a successful refresh) -- recovery is a manual
 * "Reconnect with Instagram" from the dashboard, not an auto-disconnect.
 */
export async function refreshInstagramToken(businessId: string): Promise<{ success: boolean }> {
  const supabase = createServiceSupabaseClient();

  const { data: credentials } = await supabase
    .from("instagram_credentials")
    .select("access_token")
    .eq("business_id", businessId)
    .maybeSingle<{ access_token: string }>();

  if (!credentials) {
    return { success: false };
  }

  try {
    const url = new URL(REFRESH_TOKEN_URL);
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", credentials.access_token);
    const response = await fetchWithTimeout(url.toString());
    if (!response.ok) {
      throw new Error(`Refresh endpoint responded with status ${response.status}`);
    }
    const parsed = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!parsed.access_token) {
      throw new Error("Refresh endpoint returned no access_token");
    }

    const nowIso = new Date().toISOString();
    await supabase
      .from("instagram_credentials")
      .update({ access_token: parsed.access_token, token_updated_at: nowIso })
      .eq("business_id", businessId);
    await supabase
      .from("instagram_connections")
      .update({
        status: "connected",
        last_error: null,
        token_expires_at: new Date(Date.now() + (parsed.expires_in ?? 60 * 24 * 60 * 60) * 1000).toISOString(),
        access_token_last4: parsed.access_token.slice(-4),
        last_verified_at: nowIso,
        updated_at: nowIso,
      })
      .eq("business_id", businessId);

    logEvent("instagram_token_refresh_succeeded", businessId, {});
    return { success: true };
  } catch (error) {
    await supabase
      .from("instagram_connections")
      .update({ status: "error", last_error: errorMessageOnly(error), updated_at: new Date().toISOString() })
      .eq("business_id", businessId);

    logEvent("instagram_token_refresh_failed", businessId, {}, "error");
    return { success: false };
  }
}

export type RefreshDueInstagramTokensResult = {
  processed: number;
  succeeded: number;
  failed: number;
};

/** Sweeps connections whose token expires within REFRESH_WINDOW_DAYS. Called from the shared daily cron. */
export async function refreshDueInstagramTokens(): Promise<RefreshDueInstagramTokensResult> {
  const supabase = createServiceSupabaseClient();

  const { data: due, error } = await supabase
    .from("instagram_connections")
    .select("business_id")
    .eq("status", "connected")
    .lt("token_expires_at", new Date(Date.now() + REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString());

  if (error) {
    logEvent("instagram_token_refresh_sweep_failed", "unknown", {}, "error");
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;
  for (const row of due ?? []) {
    const result = await refreshInstagramToken(row.business_id);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return { processed: (due ?? []).length, succeeded, failed };
}
