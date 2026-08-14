import type { NextConfig } from "next";

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

export default nextConfig;
