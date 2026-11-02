import "server-only";
import crypto from "node:crypto";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Conversation, InstagramConnection } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";
import { logEvent, type LogMetadata } from "@/lib/logger";
import { createConversation } from "@/lib/conversations";
import { discoverInstagramAccounts, graphFailureMetadata } from "@/lib/meta-instagram-connect-flow";
import { discoverFacebookPages, PAGE_FIELDS, toLinkedPage, type LinkedPage } from "@/lib/meta-instagram-facebook-flow";
import {
  getMetaConfig,
  getMetaLoginMode,
  graphRequest,
  hasTokenEncryptionKey,
  openToken,
  sealToken,
} from "@/lib/meta-graph";
import {
  buildFacebookLoginUrl,
  buildUnifiedLoginUrl,
  checkOAuthState,
  instagramGraphNode,
  isPermissionError,
  OAUTH_STATE_TTL_MS,
  PAGE_SUBSCRIBED_FIELDS,
  SUBSCRIBED_FIELDS,
  type MetaLoginMode,
} from "@/lib/meta-instagram-rules";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Instagram DMs through Meta. Two login flows, picked by META_IG_LOGIN_MODE
 * for NEW connections (each connection row remembers its own `login_mode`,
 * and sends/disconnects follow the row):
 *
 *  - "facebook" (default): Instagram API with Facebook Login (Messenger API
 *    support for Instagram). The client logs in with Facebook and picks the
 *    Facebook Page linked to its Instagram professional account. We exchange
 *    for a long-lived User token, read the Page access token from
 *    /me/accounts (no expiry when derived from a long-lived User token),
 *    install the app on the Page (POST /<PAGE_ID>/subscribed_apps) and send
 *    with POST /<PAGE_ID>/messages.
 *  - "unified": Instagram API with Unified Login (Facebook Login for Business,
 *    Business Integration System User token, POST /<IG_ID>/...). Kept for a
 *    switch back; see STATE.md.
 *
 * Endpoints follow Meta's docs on graph.facebook.com (v26.0) -- see STATE.md.
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
  | "long_lived_failed"
  | "me_failed"
  | "accounts_failed"
  | "pages_failed"
  | "no_accounts"
  | "no_linked_pages"
  | "account_in_use"
  | "subscribe_failed"
  | "subscribe_permission"
  | "selection_expired"
  | "unexpected";

/** One choosable Instagram account. Facebook mode adds the linked Page (never its token). */
export type InstagramAccountChoice = {
  id: string;
  username: string | null;
  pageId?: string;
  pageName?: string | null;
};

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

  const loginInput = { appId: config.appId, configId: config.loginConfigId, redirectUri: config.redirectUri, state };
  return {
    url: getMetaLoginMode() === "unified" ? buildUnifiedLoginUrl(loginInput) : buildFacebookLoginUrl(loginInput),
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

/** The non-secret ids a connection row records, per login mode. */
type ConnectionIds = {
  loginMode: MetaLoginMode;
  metaSystemUserId: string | null;
  clientBusinessId: string | null;
  facebookUserId: string | null;
  facebookPageId: string | null;
  facebookPageName: string | null;
};

/**
 * Finishes the login for a business whose state was already verified,
 * using the flow META_IG_LOGIN_MODE selects. One account -> connect it;
 * several -> park the (encrypted) token so the client can choose.
 */
export async function completeInstagramConnect(
  businessId: string,
  userId: string,
  code: string,
): Promise<CompleteConnectResult> {
  const config = getMetaConfig();
  if (!config || !hasTokenEncryptionKey()) return { kind: "error", error: "config" };
  const discoverInput = {
    graph: graphRequest,
    log: (event: string, metadata: LogMetadata, level?: "info" | "error") => logEvent(event, businessId, metadata, level),
    appId: config.appId,
    appSecret: config.appSecret,
    redirectUri: config.redirectUri,
    code,
  };

  if (getMetaLoginMode() === "facebook") {
    const discovered = await discoverFacebookPages(discoverInput);
    if (!discovered.ok) return { kind: "error", error: discovered.error };
    const { userToken, facebookUserId, pages } = discovered;

    if (pages.length === 1) {
      return connectFacebookPage(businessId, userId, facebookUserId, pages[0]);
    }
    return parkSelection(businessId, userId, userToken, {
      loginMode: "facebook",
      metaSystemUserId: null,
      clientBusinessId: null,
      facebookUserId,
      accounts: pages.map((page) => ({ id: page.igId, username: page.username, pageId: page.pageId, pageName: page.pageName })),
    });
  }

  const discovered = await discoverInstagramAccounts(discoverInput);
  if (!discovered.ok) return { kind: "error", error: discovered.error };
  const { token, systemUserId, clientBusinessId, accounts } = discovered;

  if (accounts.length === 1) {
    return connectUnifiedAccount(businessId, userId, token, systemUserId, clientBusinessId, accounts[0]);
  }
  return parkSelection(businessId, userId, token, {
    loginMode: "unified",
    metaSystemUserId: systemUserId,
    clientBusinessId,
    facebookUserId: null,
    accounts,
  });
}

/** Stores the token (encrypted) and the choosable accounts for 15 minutes. */
async function parkSelection(
  businessId: string,
  userId: string,
  token: string,
  selection: {
    loginMode: MetaLoginMode;
    metaSystemUserId: string | null;
    clientBusinessId: string | null;
    facebookUserId: string | null;
    accounts: InstagramAccountChoice[];
  },
): Promise<CompleteConnectResult> {
  const supabase = createServiceSupabaseClient();
  await supabase.from("instagram_pending_selections").delete().eq("business_id", businessId);
  const { data, error } = await supabase
    .from("instagram_pending_selections")
    .insert({
      business_id: businessId,
      initiated_by_user_id: userId,
      access_token_encrypted: sealToken(token),
      login_mode: selection.loginMode,
      meta_system_user_id: selection.metaSystemUserId,
      client_business_id: selection.clientBusinessId,
      facebook_user_id: selection.facebookUserId,
      accounts: selection.accounts,
      expires_at: new Date(Date.now() + SELECTION_TTL_MS).toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new AppError(
      "Something went wrong saving your Instagram accounts. Please try again.",
      "parkSelection pending selection insert failed",
      error,
    );
  }

  logEvent("ig_connect_choose", businessId, {
    step: "choose",
    loginMode: selection.loginMode,
    count: selection.accounts.length,
    selectionId: data.id,
  });
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
    .select("access_token_encrypted, login_mode, meta_system_user_id, client_business_id, facebook_user_id, accounts, expires_at")
    .maybeSingle<{
      access_token_encrypted: string;
      login_mode: MetaLoginMode;
      meta_system_user_id: string | null;
      client_business_id: string | null;
      facebook_user_id: string | null;
      accounts: InstagramAccountChoice[];
      expires_at: string;
    }>();

  if (!data || new Date(data.expires_at) <= new Date()) return { kind: "error", error: "selection_expired" };

  const account = data.accounts.find((candidate) => candidate.id === accountId);
  if (!account) return { kind: "error", error: "selection_expired" };
  const token = openToken(data.access_token_encrypted);

  if (data.login_mode === "facebook") {
    if (!data.facebook_user_id || !account.pageId || !IG_ID_PATTERN.test(account.pageId)) {
      return { kind: "error", error: "selection_expired" };
    }
    // The pending row holds the long-lived USER token; read the chosen
    // Page's own token now and re-check that it is still linked.
    const page = await graphRequest<unknown>("GET", `/${account.pageId}`, { token, query: { fields: PAGE_FIELDS } });
    const linked = page.ok ? toLinkedPage(page.data) : null;
    if (!linked || linked.igId !== account.id) {
      logEvent(
        "ig_connect_failed",
        businessId,
        page.ok
          ? { step: "choose_page", pageId: account.pageId, status: 200, reason: "page_not_linked" }
          : { step: "choose_page", pageId: account.pageId, ...graphFailureMetadata(page) },
        "error",
      );
      return { kind: "error", error: "pages_failed" };
    }
    return connectFacebookPage(businessId, userId, data.facebook_user_id, linked);
  }

  if (!data.meta_system_user_id) return { kind: "error", error: "selection_expired" };
  return connectUnifiedAccount(businessId, userId, token, data.meta_system_user_id, data.client_business_id, {
    id: account.id,
    username: account.username,
  });
}

/**
 * Facebook Login: installs our app on the Page (POST /<PAGE_ID>/subscribed_apps
 * with the Page token) so Meta delivers its linked Instagram account's
 * messaging webhooks, then stores the connection with the Page token.
 * Subscribe first: a stored "connected" row that Meta never sends messages
 * for would look healthy and silently drop every DM.
 */
async function connectFacebookPage(
  businessId: string,
  userId: string,
  facebookUserId: string,
  page: LinkedPage,
): Promise<CompleteConnectResult> {
  if (!IG_ID_PATTERN.test(page.igId) || !IG_ID_PATTERN.test(page.pageId)) {
    logEvent("ig_connect_failed", businessId, { step: "connect", reason: "invalid_account_id" }, "error");
    return { kind: "error", error: "unexpected" };
  }

  const subscribed = await graphRequest<{ success?: boolean }>("POST", `/${page.pageId}/subscribed_apps`, {
    token: page.pageToken,
    form: { subscribed_fields: PAGE_SUBSCRIBED_FIELDS.join(",") },
  });
  if (!subscribed.ok || subscribed.data.success !== true) {
    // Meta requires pages_manage_metadata for this call; a missing grant
    // comes back as a permission error and gets its own code + log reason.
    const missingPermission = !subscribed.ok && isPermissionError(subscribed.error);
    logEvent(
      "ig_connect_failed",
      businessId,
      subscribed.ok
        ? { step: "subscribe", pageId: page.pageId, accountId: page.igId, status: 200, reason: "success_not_true" }
        : {
            step: "subscribe",
            pageId: page.pageId,
            accountId: page.igId,
            reason: missingPermission ? "missing_permission_pages_manage_metadata" : "graph_error",
            ...graphFailureMetadata(subscribed),
          },
      "error",
    );
    return { kind: "error", error: missingPermission ? "subscribe_permission" : "subscribe_failed" };
  }
  logEvent("ig_connect_subscribed", businessId, {
    step: "subscribe",
    loginMode: "facebook",
    pageId: page.pageId,
    accountId: page.igId,
    fields: PAGE_SUBSCRIBED_FIELDS.join(","),
    status: 200,
  });

  return saveConnection(businessId, userId, page.pageToken, { id: page.igId, username: page.username }, {
    loginMode: "facebook",
    metaSystemUserId: null,
    clientBusinessId: null,
    facebookUserId,
    facebookPageId: page.pageId,
    facebookPageName: page.pageName,
  });
}

/** Unified Login: subscribes the Instagram account to our webhooks, then stores the connection with the system user token. */
async function connectUnifiedAccount(
  businessId: string,
  userId: string,
  token: string,
  systemUserId: string,
  clientBusinessId: string | null,
  account: InstagramAccountChoice,
): Promise<CompleteConnectResult> {
  if (!IG_ID_PATTERN.test(account.id)) {
    logEvent("ig_connect_failed", businessId, { step: "connect", reason: "invalid_account_id" }, "error");
    return { kind: "error", error: "unexpected" };
  }

  const subscribed = await graphRequest<{ success?: boolean }>("POST", `/${account.id}/subscribed_apps`, {
    token,
    form: { subscribed_fields: SUBSCRIBED_FIELDS.join(",") },
  });
  if (!subscribed.ok || subscribed.data.success !== true) {
    logEvent(
      "ig_connect_failed",
      businessId,
      subscribed.ok
        ? { step: "subscribe", accountId: account.id, status: 200, reason: "success_not_true" }
        : { step: "subscribe", accountId: account.id, ...graphFailureMetadata(subscribed) },
      "error",
    );
    return { kind: "error", error: "subscribe_failed" };
  }
  logEvent("ig_connect_subscribed", businessId, { step: "subscribe", loginMode: "unified", accountId: account.id, status: 200 });

  return saveConnection(businessId, userId, token, account, {
    loginMode: "unified",
    metaSystemUserId: systemUserId,
    clientBusinessId,
    facebookUserId: null,
    facebookPageId: null,
    facebookPageName: null,
  });
}

/** Stores the encrypted token and the connection row (shared by both login modes). */
async function saveConnection(
  businessId: string,
  userId: string,
  token: string,
  account: InstagramAccountChoice,
  ids: ConnectionIds,
): Promise<CompleteConnectResult> {
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
      logEvent("ig_connect_failed", businessId, { step: "save", accountId: account.id, reason: "account_in_use" }, "error");
      return { kind: "error", error: "account_in_use" };
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
      "saveConnection credentials upsert failed",
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
        login_mode: ids.loginMode,
        meta_system_user_id: ids.metaSystemUserId,
        client_business_id: ids.clientBusinessId,
        facebook_user_id: ids.facebookUserId,
        facebook_page_id: ids.facebookPageId,
        facebook_page_name: ids.facebookPageName,
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
      "saveConnection connection upsert failed",
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

  logEvent("ig_connect_saved", businessId, {
    step: "save",
    loginMode: ids.loginMode,
    accountId: account.id,
    pageId: ids.facebookPageId,
    username: account.username,
    connectionId: connection.id,
  });
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


/** The Graph node a business's sends go through (see instagramGraphNode), or null without a usable connection. */
export async function getInstagramSendNode(supabase: ServiceSupabaseClient, businessId: string): Promise<string | null> {
  const { data } = await supabase
    .from("instagram_connections")
    .select("login_mode, instagram_business_account_id, facebook_page_id")
    .eq("business_id", businessId)
    .maybeSingle<{ login_mode: MetaLoginMode; instagram_business_account_id: string; facebook_page_id: string | null }>();
  return data ? instagramGraphNode(data) : null;
}

/**
 * Dashboard "Disconnect": unsubscribes from our webhooks when we still hold
 * a working token (best effort, logged) -- the Page for facebook-mode
 * connections, the Instagram account for unified ones -- then deletes the
 * token and the connection row. Conversations stay. Returns the deleted
 * connection's id, or null if none existed.
 */
export async function disconnectInstagram(businessId: string): Promise<string | null> {
  const supabase = createServiceSupabaseClient();

  const { data: connection } = await supabase
    .from("instagram_connections")
    .select("login_mode, instagram_business_account_id, facebook_page_id")
    .eq("business_id", businessId)
    .maybeSingle<{ login_mode: MetaLoginMode; instagram_business_account_id: string; facebook_page_id: string | null }>();

  const token = await getInstagramAccessToken(supabase, businessId);
  const node = connection ? instagramGraphNode(connection) : null;
  if (connection && token && node) {
    const result = await graphRequest("DELETE", `/${node}/subscribed_apps`, { token });
    logEvent(
      result.ok ? "instagram_webhook_unsubscribed" : "instagram_webhook_unsubscribe_failed",
      businessId,
      result.ok
        ? { loginMode: connection.login_mode, node, status: 200 }
        : { loginMode: connection.login_mode, node, ...graphFailureMetadata(result) },
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
