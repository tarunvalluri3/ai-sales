import { z } from "zod";
import type { GraphResult } from "@/lib/meta-graph";
import type { LogMetadata } from "@/lib/logger";
import type { GraphError } from "@/lib/meta-instagram-rules";

/**
 * The account-discovery half of the Instagram connect callback, kept free
 * of env, Supabase and server-only so scripts/run-meta-instagram-tests.mjs
 * can run it against a fake Graph API. lib/instagram.ts injects the real
 * graphRequest and logEvent.
 *
 * Steps, each logged as one `ig_connect_*` line: exchange the code, read
 * /me, list /me/assigned_instagram_accounts, and -- when that list is empty
 * or fails (reported for some Unified Login tokens) -- fall back to
 * debug_token's granular_scopes target_ids, looking each id up for its
 * username. Logs carry ids, counts, scope names and Meta error codes only:
 * never the access token, the code, the app secret or message text.
 */

export type ConnectFlowError = "exchange_failed" | "me_failed" | "accounts_failed" | "no_accounts";

export type DiscoveredAccount = { id: string; username: string | null };

export type DiscoverResult =
  | {
      ok: true;
      token: string;
      systemUserId: string;
      clientBusinessId: string | null;
      accounts: DiscoveredAccount[];
      source: "assigned" | "debug_token";
    }
  | { ok: false; error: ConnectFlowError };

export type GraphCall = <T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  options?: { token?: string; query?: Record<string, string>; form?: Record<string, string> },
) => Promise<GraphResult<T>>;

export type ConnectLog = (event: string, metadata: LogMetadata, level?: "info" | "error") => void;

export type DiscoverInput = {
  graph: GraphCall;
  log: ConnectLog;
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
};

const IG_ID_PATTERN = /^\d{1,32}$/;
const MAX_FALLBACK_IDS = 25;
/** Scopes whose target_ids are the Instagram accounts the person shared, in order of preference. */
const FALLBACK_SCOPES = ["instagram_basic", "instagram_manage_messages"] as const;

const assignedAccountsSchema = z.object({
  data: z.array(z.object({ id: z.string().regex(IG_ID_PATTERN), username: z.string().optional() })),
});

const debugTokenSchema = z.object({
  data: z.object({
    type: z.string().optional(),
    is_valid: z.boolean().optional(),
    app_id: z.string().optional(),
    scopes: z.array(z.string()).optional(),
    granular_scopes: z
      .array(z.object({ scope: z.string(), target_ids: z.array(z.union([z.string(), z.number()])).optional() }))
      .optional(),
  }),
});

const igUserSchema = z.object({ id: z.string().regex(IG_ID_PATTERN), username: z.string().optional() });

/** Safe fields from a failed Graph call: HTTP status and Meta's error code/subcode/type/fbtrace_id. */
export function graphFailureMetadata(result: { status: number; error: GraphError | null }): LogMetadata {
  return {
    status: result.status,
    metaCode: result.error?.code ?? null,
    metaSubcode: result.error?.error_subcode ?? null,
    metaType: result.error?.type ?? null,
    fbtraceId: result.error?.fbtrace_id ?? null,
    // Meta's own words (sanitized in readGraphError; never a token).
    metaMessage: result.error?.message ?? null,
    metaUserMessage: result.error?.error_user_msg ?? null,
  };
}

/** Only scope names, never ids beyond the Instagram ones, and never anything shaped like a token. */
function safeScopeName(scope: string): string {
  return /^[a-z_]{1,64}$/.test(scope) ? scope : "other";
}

export async function discoverInstagramAccounts(input: DiscoverInput): Promise<DiscoverResult> {
  const { graph, log } = input;

  const exchanged = await graph<{ access_token?: string; token_type?: string }>("GET", "/oauth/access_token", {
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
  const token = exchanged.data.access_token;
  log("ig_connect_code_exchanged", {
    step: "code_exchange",
    status: 200,
    tokenType: typeof exchanged.data.token_type === "string" ? safeScopeName(exchanged.data.token_type) : null,
  });

  const me = await graph<{ id?: string | number; client_business_id?: string | number }>("GET", "/me", {
    token,
    query: { fields: "id,client_business_id" },
  });
  if (!me.ok || me.data.id === undefined || me.data.id === null) {
    log(
      "ig_connect_failed",
      me.ok ? { step: "me", status: 200, reason: "no_id" } : { step: "me", ...graphFailureMetadata(me) },
      "error",
    );
    return { ok: false, error: "me_failed" };
  }
  const systemUserId = String(me.data.id);
  const clientBusinessId =
    me.data.client_business_id !== undefined && me.data.client_business_id !== null ? String(me.data.client_business_id) : null;
  log("ig_connect_me", {
    step: "me",
    status: 200,
    metaUserId: IG_ID_PATTERN.test(systemUserId) ? systemUserId : "non_numeric",
    hasClientBusinessId: clientBusinessId !== null,
  });

  const assigned = await graph<unknown>("GET", "/me/assigned_instagram_accounts", {
    token,
    query: { fields: "id,username" },
  });
  const parsed = assigned.ok ? assignedAccountsSchema.safeParse(assigned.data) : null;
  let assignedFailed = false;
  if (!assigned.ok) {
    assignedFailed = true;
    log("ig_connect_assigned_accounts", { step: "assigned_accounts", ...graphFailureMetadata(assigned) }, "error");
  } else if (!parsed?.success) {
    assignedFailed = true;
    log("ig_connect_assigned_accounts", { step: "assigned_accounts", status: 200, reason: "unexpected_shape" }, "error");
  } else {
    const accounts = parsed.data.data.map((account) => ({ id: account.id, username: account.username ?? null }));
    log("ig_connect_assigned_accounts", {
      step: "assigned_accounts",
      status: 200,
      count: accounts.length,
      accountIds: accounts.map((account) => account.id).join(","),
      usernames: accounts.map((account) => account.username ?? "").join(","),
    });
    if (accounts.length > 0) {
      return { ok: true, token, systemUserId, clientBusinessId, accounts, source: "assigned" };
    }
  }

  const fallback = await discoverFromDebugToken(input, token);
  if (fallback.length > 0) {
    log("ig_connect_fallback_used", {
      step: "fallback",
      count: fallback.length,
      accountIds: fallback.map((account) => account.id).join(","),
      usernames: fallback.map((account) => account.username ?? "").join(","),
    });
    return { ok: true, token, systemUserId, clientBusinessId, accounts: fallback, source: "debug_token" };
  }

  const error: ConnectFlowError = assignedFailed ? "accounts_failed" : "no_accounts";
  log("ig_connect_failed", { step: "discover_accounts", reason: error }, "error");
  return { ok: false, error };
}

/**
 * debug_token is called with the app access token (`<app id>|<app secret>`)
 * in the Authorization header, so the secret never appears in a URL; the
 * user token is the `input_token` query value, as Meta documents.
 */
async function discoverFromDebugToken(input: DiscoverInput, token: string): Promise<DiscoveredAccount[]> {
  const { graph, log } = input;
  const debug = await graph<unknown>("GET", "/debug_token", {
    token: `${input.appId}|${input.appSecret}`,
    query: { input_token: token },
  });
  if (!debug.ok) {
    log("ig_connect_debug_token", { step: "debug_token", ...graphFailureMetadata(debug) }, "error");
    return [];
  }
  const parsed = debugTokenSchema.safeParse(debug.data);
  if (!parsed.success) {
    log("ig_connect_debug_token", { step: "debug_token", status: 200, reason: "unexpected_shape" }, "error");
    return [];
  }

  const data = parsed.data.data;
  const granular = data.granular_scopes ?? [];
  const idsFor = (scope: string) =>
    (granular.find((entry) => entry.scope === scope)?.target_ids ?? []).map(String).filter((id) => IG_ID_PATTERN.test(id));

  log("ig_connect_debug_token", {
    step: "debug_token",
    status: 200,
    tokenType: data.type ? safeScopeName(data.type.toLowerCase()) : null,
    isValid: data.is_valid ?? null,
    appIdMatches: data.app_id === undefined ? null : data.app_id === input.appId,
    scopes: (data.scopes ?? []).map(safeScopeName).join(","),
    granularScopes: granular
      .map((entry) => `${safeScopeName(entry.scope)}:${entry.target_ids?.length ?? 0}`)
      .join(","),
    instagramBasicIds: idsFor("instagram_basic").join(","),
    instagramManageMessagesIds: idsFor("instagram_manage_messages").join(","),
  });

  let candidateIds: string[] = [];
  for (const scope of FALLBACK_SCOPES) {
    candidateIds = idsFor(scope);
    if (candidateIds.length > 0) break;
  }
  candidateIds = [...new Set(candidateIds)].slice(0, MAX_FALLBACK_IDS);

  const accounts: DiscoveredAccount[] = [];
  for (const id of candidateIds) {
    const lookup = await graph<unknown>("GET", `/${id}`, { token, query: { fields: "id,username" } });
    const user = lookup.ok ? igUserSchema.safeParse(lookup.data) : null;
    if (!lookup.ok) {
      log("ig_connect_fallback_lookup", { step: "fallback_lookup", accountId: id, ...graphFailureMetadata(lookup) }, "error");
      continue;
    }
    if (!user?.success || user.data.id !== id) {
      log("ig_connect_fallback_lookup", { step: "fallback_lookup", accountId: id, status: 200, reason: "unexpected_shape" }, "error");
      continue;
    }
    log("ig_connect_fallback_lookup", { step: "fallback_lookup", accountId: id, status: 200, username: user.data.username ?? null });
    accounts.push({ id, username: user.data.username ?? null });
  }
  return accounts;
}
