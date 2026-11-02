import "server-only";
import crypto from "node:crypto";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Conversation, InstagramConnection } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";
import { logEvent } from "@/lib/logger";
import { createConversation } from "@/lib/conversations";
import { getMetaConfig, graphRequest, hasTokenEncryptionKey, openToken, sealToken } from "@/lib/meta-graph";
import {
  buildUnifiedLoginUrl,
  checkOAuthState,
  OAUTH_STATE_TTL_MS,
  SUBSCRIBED_FIELDS,
} from "@/lib/meta-instagram-rules";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Instagram DMs through Meta's "Instagram API with Unified Login"
 * (Facebook Login for Business with a config_id). The client signs in with
 * Instagram or Facebook, picks its business portfolio and the Instagram
 * account(s) to share, and we receive a Business Integration System User
 * access token: it belongs to the client's business, does not expire, and
 * can be revoked. Endpoints follow Meta's get-started and webhooks setup
 * guides (graph.facebook.com, v26.0) -- see STATE.md.
 *
 * Trust: the connect route runs inside an authenticated dashboard session
 * and writes a single-use, short-lived state row tied to that business; the
 * callback (no Clerk session) trusts only that row. The token is stored
 * encrypted (lib/token-crypto.ts) in service-role-only tables and never
 * logged.
 */

const SELECTION_TTL_MS = 15 * 60 * 1000;
const IG_ID_PATTERN = /^\d{1,32}$/;

export const INSTAGRAM_CONVERSATION_SOURCE = "instagram";

/** Short codes the dashboard turns into friendly copy (never Meta's raw error text). */
export type InstagramConnectError =
  | "denied"
  | "invalid_state"
  | "expired_state"
  | "config"
  | "exchange_failed"
  | "no_accounts"
  | "subscribe_failed"
  | "selection_expired"
  | "unexpected";

const assignedAccountsSchema = z.object({
  data: z.array(z.object({ id: z.string().regex(IG_ID_PATTERN), username: z.string().optional() })),
});

export type InstagramAccountChoice = { id: string; username: string | null };

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
 * Starts the login: records a random, single-use state (10 minutes) for the
 * already-authenticated caller's business and returns Meta's login dialog
 * URL. `businessId`/`userId` must come from `requireBusinessContext()`.
 */
export async function buildInstagramConnectUrl(businessId: string, userId: string): Promise<{ url: string }> {
  const config = getMetaConfig();
  if (!config || !hasTokenEncryptionKey()) {
    throw new AppError(
      "Instagram isn't configured yet. Please try again later.",
      "buildInstagramConnectUrl missing META_* config or META_TOKEN_ENCRYPTION_KEY",
    );
  }

  const state = crypto.randomBytes(32).toString("base64url");
  const supabase = createServiceSupabaseClient();

  // Housekeeping: expired states for this business are useless; drop them.
  await supabase
    .from("instagram_oauth_states")
    .delete()
    .eq("business_id", businessId)
    .lt("expires_at", new Date().toISOString());

  const { error } = await supabase.from("instagram_oauth_states").insert({
    state,
    business_id: businessId,
    initiated_by_user_id: userId,
    expires_at: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString(),
  });

  if (error) {
    throw new AppError(
      "Something went wrong starting the Instagram connection. Please try again.",
      "buildInstagramConnectUrl state insert failed",
      error,
    );
  }

  return {
    url: buildUnifiedLoginUrl({
      appId: config.appId,
      configId: config.loginConfigId,
      redirectUri: config.redirectUri,
      state,
    }),
  };
}

/** Consumes (deletes) a state row and checks it. Used for both the success and the cancel/error callback. */
export async function consumeInstagramOAuthState(
  state: string,
): Promise<{ ok: true; businessId: string; userId: string } | { ok: false; error: InstagramConnectError }> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("instagram_oauth_states")
    .delete()
    .eq("state", state)
    .select("business_id, initiated_by_user_id, expires_at")
    .maybeSingle();

  const checked = checkOAuthState(error ? null : data, new Date());
  if (!checked.ok) {
    return { ok: false, error: checked.reason === "expired" ? "expired_state" : "invalid_state" };
  }
  return checked;
}

export type CompleteConnectResult =
  | { kind: "connected"; connection: InstagramConnection }
  | { kind: "choose"; selectionId: string }
  | { kind: "error"; error: InstagramConnectError };

/**
 * Finishes the login for a business whose state was already verified:
 * exchanges the code (server-side, app secret), reads the system user id
 * and client_business_id, lists the shared Instagram accounts, then either
 * connects the only one or parks the token so the client can choose.
 */
export async function completeInstagramConnect(
  businessId: string,
  userId: string,
  code: string,
): Promise<CompleteConnectResult> {
  const config = getMetaConfig();
  if (!config || !hasTokenEncryptionKey()) return { kind: "error", error: "config" };

  const exchanged = await graphRequest<{ access_token?: string }>("GET", "/oauth/access_token", {
    query: {
      client_id: config.appId,
      client_secret: config.appSecret,
      redirect_uri: config.redirectUri,
      code,
    },
  });
  if (!exchanged.ok || !exchanged.data.access_token) {
    logEvent("instagram_connect_exchange_failed", businessId, { status: exchanged.ok ? 200 : exchanged.status }, "error");
    return { kind: "error", error: "exchange_failed" };
  }
  const token = exchanged.data.access_token;

  const me = await graphRequest<{ id?: string; client_business_id?: string }>("GET", "/me", {
    token,
    query: { fields: "id,client_business_id" },
  });
  if (!me.ok || !me.data.id) {
    logEvent("instagram_connect_me_failed", businessId, { status: me.ok ? 200 : me.status }, "error");
    return { kind: "error", error: "exchange_failed" };
  }
  const systemUserId = String(me.data.id);
  const clientBusinessId = me.data.client_business_id ? String(me.data.client_business_id) : null;

  const assigned = await graphRequest<unknown>("GET", "/me/assigned_instagram_accounts", {
    token,
    query: { fields: "id,username" },
  });
  const parsedAccounts = assigned.ok ? assignedAccountsSchema.safeParse(assigned.data) : null;
  if (!parsedAccounts?.success) {
    logEvent("instagram_connect_accounts_failed", businessId, { status: assigned.ok ? 200 : assigned.status }, "error");
    return { kind: "error", error: "exchange_failed" };
  }
  const accounts: InstagramAccountChoice[] = parsedAccounts.data.data.map((account) => ({
    id: account.id,
    username: account.username ?? null,
  }));

  if (accounts.length === 0) return { kind: "error", error: "no_accounts" };

  if (accounts.length === 1) {
    return connectInstagramAccount(businessId, userId, token, systemUserId, clientBusinessId, accounts[0]);
  }

  const supabase = createServiceSupabaseClient();
  await supabase.from("instagram_pending_selections").delete().eq("business_id", businessId);
  const { data, error } = await supabase
    .from("instagram_pending_selections")
    .insert({
      business_id: businessId,
      initiated_by_user_id: userId,
      access_token_encrypted: sealToken(token),
      meta_system_user_id: systemUserId,
      client_business_id: clientBusinessId,
      accounts,
      expires_at: new Date(Date.now() + SELECTION_TTL_MS).toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new AppError(
      "Something went wrong saving your Instagram accounts. Please try again.",
      "completeInstagramConnect pending selection insert failed",
      error,
    );
  }

  return { kind: "choose", selectionId: data.id };
}

/** The accounts a business may choose from (no token). Null when the selection is unknown, expired or someone else's. */
export async function getInstagramPendingSelection(
  businessId: string,
  selectionId: string,
): Promise<InstagramAccountChoice[] | null> {
  if (!z.string().uuid().safeParse(selectionId).success) return null;
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase
    .from("instagram_pending_selections")
    .select("accounts, expires_at")
    .eq("id", selectionId)
    .eq("business_id", businessId)
    .maybeSingle<{ accounts: InstagramAccountChoice[]; expires_at: string }>();

  if (!data || new Date(data.expires_at) <= new Date()) return null;
  return data.accounts;
}

/** Connects the account the client picked. `businessId`/`userId` come from the caller's session, never the form. */
export async function finishInstagramSelection(
  businessId: string,
  userId: string,
  selectionId: string,
  accountId: string,
): Promise<CompleteConnectResult> {
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase
    .from("instagram_pending_selections")
    .delete()
    .eq("id", selectionId)
    .eq("business_id", businessId)
    .select("access_token_encrypted, meta_system_user_id, client_business_id, accounts, expires_at")
    .maybeSingle<{
      access_token_encrypted: string;
      meta_system_user_id: string;
      client_business_id: string | null;
      accounts: InstagramAccountChoice[];
      expires_at: string;
    }>();

  if (!data || new Date(data.expires_at) <= new Date()) return { kind: "error", error: "selection_expired" };

  const account = data.accounts.find((candidate) => candidate.id === accountId);
  if (!account) return { kind: "error", error: "selection_expired" };

  return connectInstagramAccount(
    businessId,
    userId,
    openToken(data.access_token_encrypted),
    data.meta_system_user_id,
    data.client_business_id,
    account,
  );
}

/**
 * Subscribes the account to our app's webhooks, then stores the connection.
 * Subscribe first: a stored "connected" row that Meta never sends messages
 * for would look healthy and silently drop every DM.
 */
async function connectInstagramAccount(
  businessId: string,
  userId: string,
  token: string,
  systemUserId: string,
  clientBusinessId: string | null,
  account: InstagramAccountChoice,
): Promise<CompleteConnectResult> {
  if (!IG_ID_PATTERN.test(account.id)) return { kind: "error", error: "exchange_failed" };

  const subscribed = await graphRequest<{ success?: boolean }>("POST", `/${account.id}/subscribed_apps`, {
    token,
    form: { subscribed_fields: SUBSCRIBED_FIELDS.join(",") },
  });
  if (!subscribed.ok || subscribed.data.success !== true) {
    logEvent(
      "instagram_webhook_subscribe_failed",
      businessId,
      { status: subscribed.ok ? 200 : subscribed.status, code: subscribed.ok ? null : (subscribed.error?.code ?? null) },
      "error",
    );
    return { kind: "error", error: "subscribe_failed" };
  }
  logEvent("instagram_webhook_subscribed", businessId, {});

  const supabase = createServiceSupabaseClient();
  const nowIso = new Date().toISOString();

  // One Instagram account can serve one business. If another business held
  // this account, its row is replaced only when it is not connected.
  const { data: existingOwner } = await supabase
    .from("instagram_connections")
    .select("business_id, status")
    .eq("instagram_business_account_id", account.id)
    .maybeSingle<{ business_id: string; status: string }>();
  if (existingOwner && existingOwner.business_id !== businessId) {
    if (existingOwner.status === "connected") {
      logEvent("instagram_account_owned_by_other_business", businessId, {}, "error");
      return { kind: "error", error: "unexpected" };
    }
    await supabase
      .from("instagram_connections")
      .delete()
      .eq("instagram_business_account_id", account.id)
      .eq("business_id", existingOwner.business_id);
  }

  const { error: credentialsError } = await supabase.from("instagram_credentials").upsert(
    { business_id: businessId, access_token_encrypted: sealToken(token), token_updated_at: nowIso },
    { onConflict: "business_id" },
  );
  if (credentialsError) {
    throw new AppError(
      "Something went wrong saving your Instagram credentials. Please try again.",
      "connectInstagramAccount credentials upsert failed",
      credentialsError,
    );
  }

  const { data: connection, error: connectionError } = await supabase
    .from("instagram_connections")
    .upsert(
      {
        business_id: businessId,
        instagram_business_account_id: account.id,
        ig_username: account.username,
        meta_system_user_id: systemUserId,
        client_business_id: clientBusinessId,
        status: "connected",
        access_token_last4: token.slice(-4),
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
      "connectInstagramAccount connection upsert failed",
      connectionError,
    );
  }

  const { error: auditError } = await supabase.from("audit_log").insert({
    business_id: businessId,
    actor_user_id: userId,
    action: "instagram_connection.created",
    target_type: "instagram_connection",
    target_id: connection.id,
  });
  if (auditError) {
    logEvent("instagram_connect_audit_failed", businessId, {}, "error");
  }

  return { kind: "connected", connection };
}

/** Decrypts a business's stored token. Null when there is none (or it can't be decrypted). Never logs it. */
export async function getInstagramAccessToken(
  supabase: ServiceSupabaseClient,
  businessId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("instagram_credentials")
    .select("access_token_encrypted")
    .eq("business_id", businessId)
    .maybeSingle<{ access_token_encrypted: string }>();
  if (!data) return null;
  try {
    return openToken(data.access_token_encrypted);
  } catch {
    logEvent("instagram_token_decrypt_failed", businessId, {}, "error");
    return null;
  }
}

/**
 * Meta said the token is invalid or revoked: delete it and mark the
 * connection disconnected so nothing tries to send again. The dashboard
 * then shows "Reconnect Instagram".
 */
export async function markInstagramConnectionRevoked(
  supabase: ServiceSupabaseClient,
  businessId: string,
): Promise<void> {
  await supabase.from("instagram_credentials").delete().eq("business_id", businessId);
  await supabase
    .from("instagram_connections")
    .update({
      status: "disconnected",
      access_token_last4: null,
      last_error: "token_revoked",
      updated_at: new Date().toISOString(),
    })
    .eq("business_id", businessId);
  logEvent("instagram_token_revoked", businessId, {}, "error");
}

/**
 * Dashboard "Disconnect": unsubscribes the account from our webhooks when
 * we still hold a working token (best effort, logged), then deletes the
 * token and the connection row. Conversations stay. Returns the deleted
 * connection's id, or null if none existed.
 */
export async function disconnectInstagram(businessId: string): Promise<string | null> {
  const supabase = createServiceSupabaseClient();

  const { data: connection } = await supabase
    .from("instagram_connections")
    .select("instagram_business_account_id")
    .eq("business_id", businessId)
    .maybeSingle<{ instagram_business_account_id: string }>();

  const token = await getInstagramAccessToken(supabase, businessId);
  if (connection && token && IG_ID_PATTERN.test(connection.instagram_business_account_id)) {
    const result = await graphRequest("DELETE", `/${connection.instagram_business_account_id}/subscribed_apps`, { token });
    logEvent(
      result.ok ? "instagram_webhook_unsubscribed" : "instagram_webhook_unsubscribe_failed",
      businessId,
      { status: result.ok ? 200 : result.status },
      result.ok ? "info" : "error",
    );
  }

  const { error: credentialsError } = await supabase.from("instagram_credentials").delete().eq("business_id", businessId);
  if (credentialsError) {
    throw new AppError(
      "Something went wrong disconnecting Instagram. Please try again.",
      "disconnectInstagram credentials delete failed",
      credentialsError,
    );
  }
  await supabase.from("instagram_pending_selections").delete().eq("business_id", businessId);

  const { data: deleted, error: connectionError } = await supabase
    .from("instagram_connections")
    .delete()
    .eq("business_id", businessId)
    .select("id");
  if (connectionError) {
    throw new AppError(
      "Something went wrong disconnecting Instagram. Please try again.",
      "disconnectInstagram connection delete failed",
      connectionError,
    );
  }

  return deleted?.[0]?.id ?? null;
}

/**
 * Resolves an inbound webhook's `entry.id` (the client's Instagram account
 * id) to a business. Only a `connected` connection resolves -- unknown or
 * disconnected accounts are ignored.
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

/**
 * Finds this Instagram sender's most recent conversation with the
 * business, or starts a new one. The sender id comes from Meta's own
 * signature-verified webhook payload, never client input.
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
