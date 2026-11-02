import { NextRequest, NextResponse } from "next/server";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { buildInstagramConnectUrl } from "@/lib/instagram";
import { getEntitlementForBusiness } from "@/lib/subscription";
import { logAndGetUserMessage } from "@/lib/errors";

/**
 * "Connect Instagram": a real top-level navigation (a Server Action cannot
 * redirect cross-origin to Meta's login dialog). Needs a signed-in org:admin
 * of an entitled business; writes the single-use state for that business
 * and redirects to Facebook Login for Business (Instagram API with Unified
 * Login).
 */
export async function GET(request: NextRequest) {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const back = (query: string) => NextResponse.redirect(new URL(`/dashboard/instagram?${query}`, request.nextUrl.origin));

  if (requireMinRole(orgRole, "org:admin")) {
    return back("error=forbidden");
  }

  // The page hides the button when not entitled; this route refuses on its
  // own because an admin could navigate to it by hand.
  const entitlement = await getEntitlementForBusiness(businessId);
  if (!entitlement.channels.instagram) {
    return back("error=not_entitled");
  }

  try {
    const { url } = await buildInstagramConnectUrl(businessId, userId);
    return NextResponse.redirect(url);
  } catch (error) {
    logAndGetUserMessage(error);
    return back("error=config");
  }
}
