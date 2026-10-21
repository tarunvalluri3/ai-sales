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
  GEMINI_API_KEY: z.string().min(1),
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

export const env = parsed.data;
