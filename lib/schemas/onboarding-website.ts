import { z } from "zod";

export const onboardingWebsiteSchema = z.string().trim().max(2048).transform((value, ctx) => {
  try {
    const url = new URL(value);
    if (/^https?:\/\//i.test(value) && ["https:", "http:"].includes(url.protocol) && !url.username && !url.password &&
        url.pathname === "/" && !url.search && !url.hash && !/[?#]/.test(value)) return url.origin;
  } catch {
    // Share one message for invalid URLs and URLs with a page path.
  }
  ctx.addIssue({ code: "custom", message: "Enter your website address, like https://example.com, without a page path." });
  return z.NEVER;
});

export function websiteOrigin(value: string | null): string {
  if (!value) return "";
  try {
    const parsed = onboardingWebsiteSchema.safeParse(new URL(value).origin);
    return parsed.success ? parsed.data : "";
  } catch {
    return "";
  }
}
