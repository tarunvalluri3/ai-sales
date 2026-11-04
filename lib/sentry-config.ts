/**
 * Shared Sentry init settings (production readiness, item 9; LAUNCH_AUDIT.md
 * §1). Pure: imported by sentry.server.config.ts and sentry.edge.config.ts.
 *
 *  - Tracing stays OFF by default (Phase 21's deliberate choice: the free
 *    tier's transaction quota, and the app records its own AI latency/cost),
 *    but SENTRY_TRACES_SAMPLE_RATE (0-1) can now turn on a small sample when
 *    you need distributed traces, without a code change.
 *  - Every event is tagged with the resolved environment (APP_ENV, then
 *    VERCEL_ENV), so staging/dev noise can be filtered out of production
 *    alerts.
 */
import { resolveAppEnvironment } from "@/lib/deployment-env";

export function sentryTracesSampleRate(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 1);
}

export function sentryEnvironment(env: Record<string, string | undefined>): string {
  try {
    return resolveAppEnvironment(env).environment;
  } catch {
    return "development";
  }
}
