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
  AI_MONTHLY_TOKEN_LIMIT: z.string().regex(/^\d+$/, "must be a positive integer").optional(),
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
