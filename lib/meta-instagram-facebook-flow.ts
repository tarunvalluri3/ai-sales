import { z } from "zod";
import { graphFailureMetadata, type ConnectLog, type GraphCall } from "@/lib/meta-instagram-connect-flow";
import { isPermissionError, PAGE_SUBSCRIBED_FIELDS, permissionNamedInError } from "@/lib/meta-instagram-rules";

/**
 * Account discovery for "Instagram API with Facebook Login" (Messenger API
 * support for Instagram), the default META_IG_LOGIN_MODE. Pure: no env, no
 * Supabase, no server-only -- lib/instagram.ts injects graphRequest and
 * logEvent, scripts/run-meta-instagram-tests.mjs injects a fake Graph API.
 *
 * Steps (Meta docs: Instagram Messaging "Get started" and "Get long-lived
 * tokens"), each logged as one `ig_connect_*` line:
 *  1. GET /oauth/access_token (code -> short-lived User token)
 *  2. GET /oauth/access_token grant_type=fb_exchange_token (-> long-lived
 *     User token; Page tokens derived from it have no expiry)
 *  3. GET /me?fields=id (the app-scoped Facebook user id, matched by the
 *     deauthorize / data-deletion callbacks)
 *  4. GET /me/accounts?fields=id,name,access_token,instagram_business_account{id,username}
 *     following paging cursors; keep only Pages with a linked Instagram
 *     professional account.
 * Logs carry ids, counts and Meta error codes only -- never a token, the
 * code, the app secret or message text.
 */

export type FacebookFlowError = "exchange_failed" | "long_lived_failed" | "me_failed" | "pages_failed" | "no_linked_pages";

export type LinkedPage = {
  pageId: string;
  pageName: string | null;
  /** Page access token derived from the long-lived User token (no expiry). Never logged. */
  pageToken: string;
  igId: string;
  username: string | null;
};

export type FacebookDiscoverResult =
  | { ok: true; userToken: string; facebookUserId: string; pages: LinkedPage[] }
  | { ok: false; error: FacebookFlowError };

export type FacebookDiscoverInput = {
  graph: GraphCall;
  log: ConnectLog;
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
};

const ID_PATTERN = /^\d{1,32}$/;
/** Safety cap on /me/accounts paging (100 Pages per page). */
const MAX_ACCOUNT_PAGES = 10;
export const PAGE_FIELDS = "id,name,access_token,instagram_business_account{id,username}";

const pageSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  name: z.string().optional(),
  access_token: z.string().min(1).optional(),
  instagram_business_account: z
    .object({ id: z.string().regex(ID_PATTERN), username: z.string().optional() })
    .optional(),
});

const accountsSchema = z.object({
  data: z.array(z.unknown()),
  paging: z
    .object({ cursors: z.object({ after: z.string().optional() }).optional(), next: z.string().optional() })
    .optional(),
});

/** A Page row with a linked Instagram account and a Page token, or null. */
export function toLinkedPage(raw: unknown): LinkedPage | null {
  const parsed = pageSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.instagram_business_account || !parsed.data.access_token) return null;
  return {
    pageId: parsed.data.id,
    pageName: parsed.data.name ?? null,
    pageToken: parsed.data.access_token,
    igId: parsed.data.instagram_business_account.id,
    username: parsed.data.instagram_business_account.username ?? null,
  };
}

export async function discoverFacebookPages(input: FacebookDiscoverInput): Promise<FacebookDiscoverResult> {
  const { graph, log } = input;

  // 1. code -> short-lived User token
  const exchanged = await graph<{ access_token?: string }>("GET", "/oauth/access_token", {
    query: { client_id: input.appId, client_secret: input.appSecret, redirect_uri: input.redirectUri, code: input.code },
  });
  if (!exchanged.ok || typeof exchanged.data.access_token !== "string" || exchanged.data.access_token.length === 0) {
    log(
      "ig_connect_failed",
      exchanged.ok
        ? { step: "code_exchange", status: 200, reason: "empty_response" }
        : { step: "code_exchange", ...graphFailureMetadata(exchanged) },
      "error",
    );
    return { ok: false, error: "exchange_failed" };
  }
  log("ig_connect_code_exchanged", { step: "code_exchange", status: 200, loginMode: "facebook" });

  // 2. short-lived -> long-lived User token
  const longLived = await graph<{ access_token?: string; expires_in?: number }>("GET", "/oauth/access_token", {
    query: {
      grant_type: "fb_exchange_token",
      client_id: input.appId,
      client_secret: input.appSecret,
      fb_exchange_token: exchanged.data.access_token,
    },
  });
  if (!longLived.ok || typeof longLived.data.access_token !== "string" || longLived.data.access_token.length === 0) {
    log(
      "ig_connect_failed",
      longLived.ok
        ? { step: "long_lived_exchange", status: 200, reason: "empty_response" }
        : { step: "long_lived_exchange", ...graphFailureMetadata(longLived) },
      "error",
    );
    return { ok: false, error: "long_lived_failed" };
  }
  const userToken = longLived.data.access_token;
  log("ig_connect_long_lived", {
    step: "long_lived_exchange",
    status: 200,
    expiresInDays: typeof longLived.data.expires_in === "number" ? Math.round(longLived.data.expires_in / 86400) : null,
  });

  // 3. app-scoped Facebook user id
  const me = await graph<{ id?: string | number }>("GET", "/me", { token: userToken, query: { fields: "id" } });
  const facebookUserId = me.ok && me.data.id !== undefined && me.data.id !== null ? String(me.data.id) : null;
  if (!facebookUserId || !ID_PATTERN.test(facebookUserId)) {
    log(
      "ig_connect_failed",
      me.ok ? { step: "me", status: 200, reason: "no_id" } : { step: "me", ...graphFailureMetadata(me) },
      "error",
    );
    return { ok: false, error: "me_failed" };
  }
  log("ig_connect_me", { step: "me", status: 200, facebookUserId });

  // 4. Pages (+ Page tokens + linked Instagram account), following paging
  const pages: LinkedPage[] = [];
  let totalPages = 0;
  let after: string | undefined;
  for (let page = 0; page < MAX_ACCOUNT_PAGES; page++) {
    const query: Record<string, string> = { fields: PAGE_FIELDS, limit: "100" };
    if (after) query.after = after;
    const accounts = await graph<unknown>("GET", "/me/accounts", { token: userToken, query });
    if (!accounts.ok) {
      log("ig_connect_failed", { step: "pages", page, ...graphFailureMetadata(accounts) }, "error");
      return { ok: false, error: "pages_failed" };
    }
    const parsed = accountsSchema.safeParse(accounts.data);
    if (!parsed.success) {
      log("ig_connect_failed", { step: "pages", page, status: 200, reason: "unexpected_shape" }, "error");
      return { ok: false, error: "pages_failed" };
    }
    totalPages += parsed.data.data.length;
    for (const raw of parsed.data.data) {
      const linked = toLinkedPage(raw);
      if (linked && !pages.some((existing) => existing.igId === linked.igId)) pages.push(linked);
    }
    after = parsed.data.paging?.next ? parsed.data.paging.cursors?.after : undefined;
    if (!after) break;
  }

  log("ig_connect_pages", {
    step: "pages",
    status: 200,
    pageCount: totalPages,
    linkedCount: pages.length,
    pageIds: pages.map((linked) => linked.pageId).join(","),
    accountIds: pages.map((linked) => linked.igId).join(","),
    usernames: pages.map((linked) => linked.username ?? "").join(","),
  });

  if (pages.length === 0) {
    log("ig_connect_failed", { step: "pages", reason: "no_linked_pages", pageCount: totalPages }, "error");
    return { ok: false, error: "no_linked_pages" };
  }
  return { ok: true, userToken, facebookUserId, pages };
}

const permissionsSchema = z.object({
  data: z.array(z.object({ permission: z.string(), status: z.string() })),
});

/** Permission names only, never anything else. */
function safePermissionName(name: string): string {
  return /^[a-z_]{1,64}$/.test(name) ? name : "other";
}

export type SubscribePageInput = {
  graph: GraphCall;
  log: ConnectLog;
  /** Long-lived User token: used ONLY for GET /me/permissions. */
  userToken: string;
  /** The Page from /me/accounts (or GET /<PAGE_ID>); its pageToken is what subscribes. */
  page: LinkedPage;
};

export type SubscribePageResult = { ok: true } | { ok: false; error: "subscribe_failed" | "subscribe_permission" };

/**
 * Installs our app on the Page so Meta delivers its linked Instagram
 * account's messaging webhooks:
 *  1. GET /me/permissions (User token) -- logs granted/declined permission
 *     names so a failed subscribe can be told apart from a missing grant.
 *     Diagnostic only; a failure here does not stop the subscribe.
 *  2. POST /<PAGE_ID>/subscribed_apps with the PAGE token (Messenger
 *     Platform webhooks: "using the Page's access token").
 * On failure the log carries Meta's own message; the reason names a
 * permission only when Meta's text names it.
 */
export async function subscribeFacebookPage(input: SubscribePageInput): Promise<SubscribePageResult> {
  const { graph, log, userToken, page } = input;

  const permissions = await graph<unknown>("GET", "/me/permissions", { token: userToken });
  const parsedPermissions = permissions.ok ? permissionsSchema.safeParse(permissions.data) : null;
  if (parsedPermissions?.success) {
    const names = (status: string) =>
      parsedPermissions.data.data
        .filter((row) => row.status === status)
        .map((row) => safePermissionName(row.permission))
        .join(",");
    log("ig_connect_permissions", {
      step: "permissions",
      status: 200,
      pageId: page.pageId,
      granted: names("granted"),
      declined: names("declined"),
      expired: names("expired"),
    });
  } else {
    log(
      "ig_connect_permissions_failed",
      permissions.ok
        ? { step: "permissions", pageId: page.pageId, status: 200, reason: "unexpected_shape" }
        : { step: "permissions", pageId: page.pageId, ...graphFailureMetadata(permissions) },
      "error",
    );
  }

  const subscribed = await graph<{ success?: boolean }>("POST", `/${page.pageId}/subscribed_apps`, {
    token: page.pageToken,
    form: { subscribed_fields: PAGE_SUBSCRIBED_FIELDS.join(",") },
  });
  if (!subscribed.ok || subscribed.data?.success !== true) {
    if (subscribed.ok) {
      log(
        "ig_connect_failed",
        { step: "subscribe", pageId: page.pageId, accountId: page.igId, status: 200, reason: "success_not_true" },
        "error",
      );
      return { ok: false, error: "subscribe_failed" };
    }
    const namedPermission = permissionNamedInError(subscribed.error);
    log(
      "ig_connect_failed",
      {
        step: "subscribe",
        pageId: page.pageId,
        accountId: page.igId,
        fields: PAGE_SUBSCRIBED_FIELDS.join(","),
        reason: namedPermission ? `missing_permission_${namedPermission}` : "subscribe_failed",
        ...graphFailureMetadata(subscribed),
      },
      "error",
    );
    return { ok: false, error: isPermissionError(subscribed.error) ? "subscribe_permission" : "subscribe_failed" };
  }

  log("ig_connect_subscribed", {
    step: "subscribe",
    loginMode: "facebook",
    pageId: page.pageId,
    accountId: page.igId,
    fields: PAGE_SUBSCRIBED_FIELDS.join(","),
    status: 200,
  });
  return { ok: true };
}
