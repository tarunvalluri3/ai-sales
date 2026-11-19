import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-contact";
import { INDUSTRY_PAGES } from "@/components/site/industries";

/** Public pages for search engines. App, auth and admin routes are excluded (see robots.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] = "monthly") => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  });
  return [
    page("", 1, "weekly"),
    page("/product", 0.9, "weekly"),
    page("/pricing", 0.9, "weekly"),
    page("/solutions", 0.8),
    ...INDUSTRY_PAGES.map((i) => page(`/solutions/${i.slug}`, 0.8)),
    page("/integrations", 0.7),
    page("/security", 0.6),
    page("/about", 0.6),
    page("/contact", 0.5),
    page("/privacy", 0.3, "yearly"),
    page("/terms", 0.3, "yearly"),
    page("/refunds", 0.3, "yearly"),
    page("/shipping", 0.3, "yearly"),
    page("/data-deletion", 0.2, "yearly"),
  ];
}
