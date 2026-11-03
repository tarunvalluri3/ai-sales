/**
 * Which deployment this process is (development / staging / production), and
 * whether a Supabase project is the PRODUCTION one. Pure and dependency-free
 * on purpose: lib/env.ts uses it at server startup, and the Node scripts and
 * test runners (scripts/lib/production-guard.mjs) import this same file, so
 * the app and every script agree on what "production" means.
 *
 * Why it exists (LAUNCH_AUDIT.md §3, §15): the Gemini key used to be picked by
 * Vercel's own `VERCEL_ENV`, which is undefined on a VPS -- so a VPS
 * production server silently used the dev key -- and nothing stopped a local
 * script or test from running against the production database.
 *
 * Resolution order for the app environment:
 *   1. `APP_ENV` (development | staging | production) -- explicit, set this on
 *      the VPS and in every Vercel environment.
 *   2. `VERCEL_ENV` (production -> production, preview -> staging,
 *      development -> development) -- so existing Vercel deploys keep working.
 *   3. otherwise `development`.
 */

export type AppEnvironment = "development" | "staging" | "production";

export const APP_ENVIRONMENTS: readonly AppEnvironment[] = ["development", "staging", "production"];

/**
 * Supabase project refs that are PRODUCTION. Not secrets: the ref is part of
 * the public `NEXT_PUBLIC_SUPABASE_URL` every browser receives. Built in so the
 * guard still works when nobody remembered to set
 * `PRODUCTION_SUPABASE_PROJECT_REFS`; that variable adds refs, it never removes
 * this one. (`bykeztxvejpwfcxgsubm` is production per docs/deployment.md §1.)
 */
export const BUILT_IN_PRODUCTION_SUPABASE_REFS: readonly string[] = ["bykeztxvejpwfcxgsubm"];

type Env = Record<string, string | undefined>;

export type ResolvedAppEnvironment = {
  environment: AppEnvironment;
  /** Where the value came from, for startup diagnostics. */
  source: "APP_ENV" | "VERCEL_ENV" | "default";
};

export class InvalidAppEnvironmentError extends Error {}

export function resolveAppEnvironment(env: Env): ResolvedAppEnvironment {
  const explicit = env.APP_ENV?.trim();
  if (explicit) {
    if ((APP_ENVIRONMENTS as readonly string[]).includes(explicit)) {
      return { environment: explicit as AppEnvironment, source: "APP_ENV" };
    }
    throw new InvalidAppEnvironmentError(
      `APP_ENV must be one of ${APP_ENVIRONMENTS.join(", ")} (got an unrecognised value).`,
    );
  }
  const vercel = env.VERCEL_ENV?.trim();
  if (vercel === "production") return { environment: "production", source: "VERCEL_ENV" };
  if (vercel === "preview") return { environment: "staging", source: "VERCEL_ENV" };
  if (vercel === "development") return { environment: "development", source: "VERCEL_ENV" };
  return { environment: "development", source: "default" };
}

/**
 * True when a production server (`next start`, NODE_ENV=production) has no
 * explicit environment at all -- the VPS case the audit found. Ignored during
 * `next build` (NEXT_PHASE=phase-production-build), which also runs with
 * NODE_ENV=production but serves no traffic.
 */
export function isAmbiguousProductionServer(env: Env): boolean {
  if (env.NODE_ENV !== "production") return false;
  if (env.NEXT_PHASE === "phase-production-build") return false;
  return !env.APP_ENV?.trim() && !env.VERCEL_ENV?.trim();
}

/** The Supabase project ref from a URL like https://<ref>.supabase.co, or null. */
export function supabaseProjectRefFromUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    const match = /^([a-z0-9]{20})\.supabase\.(co|in|net)$/i.exec(hostname);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

export function productionSupabaseRefs(env: Env): string[] {
  const extra = (env.PRODUCTION_SUPABASE_PROJECT_REFS ?? "")
    .split(",")
    .map((ref) => ref.trim().toLowerCase())
    .filter((ref) => ref.length > 0);
  return [...new Set([...BUILT_IN_PRODUCTION_SUPABASE_REFS, ...extra])];
}

export function isProductionSupabaseRef(ref: string | null | undefined, env: Env): boolean {
  if (!ref) return false;
  return productionSupabaseRefs(env).includes(ref.trim().toLowerCase());
}

/** Which Gemini key variable this environment must use. Only production uses the production key. */
export function geminiKeyVariableFor(environment: AppEnvironment): "GEMINI_API_KEY" | "GEMINI_API_KEY_DEV" {
  return environment === "production" ? "GEMINI_API_KEY" : "GEMINI_API_KEY_DEV";
}

/**
 * Non-fatal mismatches worth a loud startup line (never values, only names):
 * a non-production server talking to the production database, or production
 * running on a Clerk development instance.
 */
export function environmentWarnings(environment: AppEnvironment, env: Env): string[] {
  const warnings: string[] = [];
  const ref = supabaseProjectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  if (environment !== "production" && isProductionSupabaseRef(ref, env)) {
    warnings.push(
      `APP_ENV resolves to "${environment}" but NEXT_PUBLIC_SUPABASE_URL points at the PRODUCTION Supabase project. ` +
        "Point local development at the staging project (see .env.example).",
    );
  }
  if (environment === "production" && ref && !isProductionSupabaseRef(ref, env)) {
    warnings.push(
      "APP_ENV is production but NEXT_PUBLIC_SUPABASE_URL is not a known production project. " +
        "Add its ref to PRODUCTION_SUPABASE_PROJECT_REFS if this is intended.",
    );
  }
  if (environment === "production" && env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")) {
    warnings.push("APP_ENV is production but Clerk is a development instance (pk_test_ key).");
  }
  if (environment === "production" && !env.VERCEL_ENV?.trim() && !env.NEXT_PUBLIC_APP_URL?.trim()) {
    warnings.push(
      "NEXT_PUBLIC_APP_URL is not set on a non-Vercel production server: links in emails fall back to https://ai-sales.vercel.app. " +
        "Set it (at build time too -- NEXT_PUBLIC_* values are inlined into the build).",
    );
  }
  return warnings;
}
