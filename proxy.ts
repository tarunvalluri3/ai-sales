import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { evaluatePlatformAdminAccess } from "@/lib/platform-admin";

// Phase 33 (docs/phases.md): /apache is the internal platform-admin panel.
// This is the FIRST of two mandatory checks (the second runs again in
// every /apache layout, Server Action and route handler via
// requirePlatformAdmin() -- middleware alone is never sufficient,
// AGENTS.md §2/§3). A bare 404 here, never a redirect, so the route's
// existence is not revealed to a non-admin by a 403 or a sign-in bounce.
const isApacheRoute = createRouteMatcher(["/apache(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isApacheRoute(req)) {
    const { userId, sessionClaims } = await auth();
    const ctx = await evaluatePlatformAdminAccess(userId, sessionClaims, "viewer");
    if (!ctx) {
      return new NextResponse(null, { status: 404 });
    }
    // Never cache or serve an admin response from an edge/CDN cache
    // (approved security brief, item 9/10).
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
