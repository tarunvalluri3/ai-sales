import { NextRequest, NextResponse } from "next/server";
import { completeInstagramConnect, consumeInstagramOAuthState } from "@/lib/instagram";
import { logAndGetUserMessage } from "@/lib/errors";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { isInstagramAllowed } from "@/lib/subscription";

/**
 * Meta redirects here after Facebook Login for Business. No Clerk session is
 * assumed (cross-site navigation): the single-use, 10-minute state row is
 * the whole trust mechanism, and the business comes from that row, never
 * from this request. The state is consumed on every path, including a
 * cancel, so it can never be replayed. Redirects carry only short codes,
 * never Meta's raw error text.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const back = (query: string) => NextResponse.redirect(new URL(`/dashboard/instagram?${query}`, request.nextUrl.origin));

  const state = params.get("state");
  const code = params.get("code");
  const cancelled = params.get("error") !== null || params.get("error_reason") !== null;

  if (!state) {
    return back("error=invalid_state");
  }

  try {
    const checked = await consumeInstagramOAuthState(state);
    if (!checked.ok) {
      return back(`error=${checked.error}`);
    }

    if (cancelled) {
      return back("error=denied");
    }
    // Re-checked here, not only at /connect: access may have been switched
    // off in the 10 minutes the state was alive.
    if (!(await isInstagramAllowed(createServiceSupabaseClient(), checked.businessId))) {
      return back("error=not_entitled");
    }
    if (!code) {
      return back("error=invalid_state");
    }

    const result = await completeInstagramConnect(checked.businessId, checked.userId, code);
    if (result.kind === "error") {
      return back(`error=${result.error}`);
    }
    if (result.kind === "choose") {
      return back(`select=${encodeURIComponent(result.selectionId)}`);
    }
    return back("connected=1");
  } catch (error) {
    logAndGetUserMessage(error);
    return back("error=unexpected");
  }
}
