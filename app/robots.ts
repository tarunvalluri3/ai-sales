import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-contact";

/** Crawl the public site; keep the app, admin, auth, widget and API out of search. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/apache", "/onboarding", "/sign-in", "/sign-up", "/session-tasks", "/suspended", "/widget", "/api/", "/data-deletion/status"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
