import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { completeInstagramConnect, consumeInstagramOAuthState } from "@/lib/instagram";
import { logAndGetUserMessage } from "@/lib/errors";
import { logEvent, type LogMetadata } from "@/lib/logger";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { isInstagramAllowed } from "@/lib/subscription";

/**
 * Meta redirects here after Facebook Login for Business. No Clerk session is
 * assumed (cross-site navigation): the single-use, 10-minute state row is
 * the whole trust mechanism, and the business comes from that row, never
 * from this request. The state is consumed on every path, including a
 * cancel, so it can never be replayed. Redirects carry only short codes,
 * never Meta's raw error text.
 *
 * Every step logs one `ig_connect_*` JSON line (lib/logger.ts, the same
 * logger the webhook uses); lib/meta-instagram-connect-flow.ts logs the
 * Graph steps. No line carries the code, a token or the app secret.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let businessId = "unknown";

  const back = async (query: string) => {
    // Error-level events also go to Sentry; send them before the function
    // can be frozen after the response. console output is synchronous.
    await Sentry.flush(2000).catch(() => false);
    return NextResponse.redirect(new URL(`/dashboard/instagram?${query}`, request.nextUrl.origin));
  };
  const fail = (step: string, error: string, metadata: LogMetadata = {}) => {
    logEvent("ig_connect_failed", businessId, { step, reason: error, ...metadata }, "error");
    return back(`error=${error}`);
  };

  const state = params.get("state");
  const code = params.get("code");
  const metaError = params.get("error");
  const metaErrorReason = params.get("error_reason");
  const cancelled = metaError !== null || metaErrorReason !== null;

  logEvent("ig_connect_start", businessId, {
    step: "start",
    hasState: state !== null,
    hasCode: code !== null,
    metaError: metaError && /^[a-z_]{1,64}$/.test(metaError) ? metaError : metaError ? "other" : null,
    metaErrorReason: metaErrorReason && /^[a-z_]{1,64}$/.test(metaErrorReason) ? metaErrorReason : metaErrorReason ? "other" : null,
    redirectUriMatches: redirectUriMatches(request),
  });

  if (!state) {
    return fail("state", "invalid_state");
  }

  try {
    const checked = await consumeInstagramOAuthState(state);
    if (!checked.ok) {
      return fail("state", checked.error);
    }
    businessId = checked.businessId;
    logEvent("ig_connect_state_ok", businessId, { step: "state" });

    if (cancelled) {
      return fail("meta_dialog", "denied");
    }
    // Re-checked here, not only at /connect: access may have been switched
    // off in the 10 minutes the state was alive.
    if (!(await isInstagramAllowed(createServiceSupabaseClient(), checked.businessId))) {
      return fail("access", "not_entitled");
    }
    if (!code) {
      return fail("code", "invalid_state", { reason: "missing_code" });
    }

    const result = await completeInstagramConnect(checked.businessId, checked.userId, code);
    if (result.kind === "error") {
      // The failing step already logged its own ig_connect_failed line.
      return back(`error=${result.error}`);
    }
    if (result.kind === "choose") {
      return back(`select=${encodeURIComponent(result.selectionId)}`);
    }
    return back("connected=1");
  } catch (error) {
    logAndGetUserMessage(error);
    return fail("exception", "unexpected");
  }
}

/** Whether this request arrived on META_REDIRECT_URI (the code exchange must send that exact value). */
function redirectUriMatches(request: NextRequest): boolean | null {
  const configured = process.env.META_REDIRECT_URI;
  if (!configured) return null;
  try {
    const expected = new URL(configured);
    return expected.origin === request.nextUrl.origin && expected.pathname === request.nextUrl.pathname;
  } catch {
    return false;
  }
}
