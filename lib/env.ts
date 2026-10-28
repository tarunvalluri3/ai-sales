import "server-only";
import { z } from "zod";

/**
 * Validates every environment variable currently required by an
 * implemented phase (STATE.md §5 / docs/security.md §5) at import time --
 * fails loudly, at server startup (via instrumentation.ts's register()),
 * rather than at first use inside whichever request path happens to
 * touch a missing variable first. Modeled on lib/embeddings.ts's existing
 * EMBEDDING_DIMENSION module-level-throw pattern. Never logs a secret's
 * value -- only the name of a missing/invalid variable.
 */
const envSchema = z.object({
  CLERK_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  // Token-burn audit (STATE.md, 2026-10-28): both optional here because
  // which one is actually required depends on the environment -- resolved
  // just below, immediately after this schema validates.
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY_DEV: z.string().min(1).optional(),
  GEMINI_CHAT_MODEL: z.string().min(1),
  GEMINI_EMBEDDING_MODEL: z.string().min(1),
  GEMINI_EMBEDDING_DIMENSION: z.string().regex(/^\d+$/, "must be a positive integer"),
  CRON_SECRET: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  NOTIFICATION_EMAIL_FROM: z.string().min(1).optional(),
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  LOCAL_CHROMIUM_PATH: z.string().min(1).optional(),
  WHATSAPP_APP_SECRET: z.string().min(1).optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
  INSTAGRAM_APP_ID: z.string().min(1).optional(),
  INSTAGRAM_APP_SECRET: z.string().min(1).optional(),
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
  INSTAGRAM_OAUTH_REDIRECT_URI: z.string().min(1).optional(),
  /**
   * Phase 17b: Razorpay. All six are `.optional()`, the same "degrade,
   * don't fail startup" posture as RESEND_API_KEY and the WhatsApp and
   * Instagram secrets -- `getRazorpayConfig()` returns null when any piece
   * is missing and every caller handles that as an explicit "not
   * configured" outcome (the billing page says so, the webhook refuses
   * every request, the billing sweep no-ops). A developer without Razorpay
   * keys must still be able to run this app, and a production deploy that
   * loses one variable should lose one feature rather than fail to boot.
   *
   * RAZORPAY_KEY_ID is **public** -- it goes to the browser so Checkout
   * can open -- but is deliberately not NEXT_PUBLIC_*: it is read
   * server-side and returned by a Server Action only to an authenticated
   * org:admin, so there is no reason to bake it into the client bundle for
   * every visitor. The other two are secrets and are never logged, never
   * returned to a client, and never interpolated into an error message.
   */
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  RAZORPAY_PLAN_STARTER_MONTHLY: z.string().min(1).optional(),
  RAZORPAY_PLAN_GROWTH_MONTHLY: z.string().min(1).optional(),
  RAZORPAY_PLAN_SCALE_MONTHLY: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(
    `Missing or invalid required environment variable(s): ${issues}. See .env.example and docs/security.md §5.`,
  );
}

/**
 * Which Gemini key this process actually uses -- production (Vercel's own
 * VERCEL_ENV, set on every deploy) uses GEMINI_API_KEY; every other
 * environment (local dev, Vercel preview) uses GEMINI_API_KEY_DEV. Missing
 * the one this environment needs fails loudly here, at startup, rather
 * than silently falling back to the production key (the exact accidental
 * spend the token-burn audit, STATE.md, found no safeguard against).
 *
 * `process.env.GEMINI_API_KEY` is reassigned to the resolved value so
 * every existing `process.env.GEMINI_API_KEY!` read elsewhere (lib/rag.ts's
 * getChatModel(), lib/embeddings.ts's getEmbeddingsClient()) keeps working
 * unchanged -- this is wiring, not a call-site rewrite. Those two files
 * only ever run after instrumentation.ts's register() has already imported
 * this module (Next.js's documented startup order), so the reassignment
 * below always happens first.
 */
const isProductionEnvironment = process.env.VERCEL_ENV === "production";
const resolvedGeminiApiKey = isProductionEnvironment ? parsed.data.GEMINI_API_KEY : parsed.data.GEMINI_API_KEY_DEV;

if (!resolvedGeminiApiKey) {
  throw new Error(
    isProductionEnvironment
      ? "Missing required environment variable: GEMINI_API_KEY (production). See .env.example and docs/security.md §5."
      : "Missing required environment variable: GEMINI_API_KEY_DEV. Every non-production environment (local dev, Vercel preview) uses this, never GEMINI_API_KEY -- see .env.example and docs/security.md §5.",
  );
}
process.env.GEMINI_API_KEY = resolvedGeminiApiKey;

export const env = { ...parsed.data, GEMINI_API_KEY: resolvedGeminiApiKey };
