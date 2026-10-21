import { NextRequest, NextResponse } from "next/server";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { buildInstagramAuthorizeUrl } from "@/lib/instagram";
import { getEntitlementForBusiness } from "@/lib/subscription";
import { logAndGetUserMessage } from "@/lib/errors";

/**
 * Phase 26's "Connect with Instagram" entry point. A real top-level
 * browser navigation (not a Server Action -- a Server Action can't
 * produce a cross-origin redirect to Meta's own OAuth dialog), gated by
 * the same authenticated-dashboard-session + org:admin bar as WhatsApp's
 * connect flow. Redirects straight to Meta; the actual trust boundary is
 * the CSRF state row buildInstagramAuthorizeUrl() writes, consumed later
 * by the callback route with no session of its own.
 */
export async function GET(request: NextRequest) {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return NextResponse.redirect(new URL("/dashboard/instagram?error=forbidden", request.nextUrl.origin));
  }

  // Phase 17a: Instagram is on no plan's channel entitlement yet. This is
  // the enforcement half -- the dashboard page explains it and hides the
  // button, but this route is a plain GET an admin could navigate to by
  // hand, so it refuses on its own. Same registry
  // (lib/plans.ts's `channels`), so flipping Instagram on later needs no
  // change here.
  const entitlement = await getEntitlementForBusiness(businessId);
  if (!entitlement.channels.instagram) {
    return NextResponse.redirect(
      new URL("/dashboard/instagram?error=not_entitled", request.nextUrl.origin),
    );
  }

  try {
    const { url } = await buildInstagramAuthorizeUrl(businessId, userId);
    return NextResponse.redirect(url);
  } catch (error) {
    logAndGetUserMessage(error);
    return NextResponse.redirect(new URL("/dashboard/instagram?error=config", request.nextUrl.origin));
  }
}
