import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Framing-sensitive: /widget/embed is deliberately loaded cross-origin
 * inside an <iframe> by design (public/widget-loader.js's whole
 * architecture depends on it -- docs/security.md §4). X-Frame-Options
 * must never be added there, or to /api/* (JSON responses, framing is
 * moot and app/api/chat/route.ts already manages its own CORS headers).
 * The other three headers below are framing-neutral and safe everywhere,
 * including the widget and API routes (Phase 19b, docs/phase-19-audit-findings.md §10).
 */
const FRAME_DENY_SOURCES = [
  "/",
  "/dashboard/:path*",
  "/onboarding/:path*",
  "/session-tasks/:path*",
  "/sign-in/:path*",
  "/sign-up/:path*",
];

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      ...FRAME_DENY_SOURCES.map((source) => ({
        source,
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      })),
    ];
  },
};

/**
 * SENTRY_AUTH_TOKEN is deliberately the org:ci-scoped token (docs/deployment.md),
 * never the broader user token used one-time to create the project --
 * this only needs release/source-map upload access, and only at build
 * time. silent:!CI keeps local `npm run build` quiet while still
 * logging in CI for visibility. Absent locally/without the token, the
 * plugin no-ops the upload rather than failing the build.
 */
export default withSentryConfig(nextConfig, {
  org: "waves-web-studio",
  project: "ai-sales",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
