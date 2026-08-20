import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { regenerateChunksForDocument } from "@/lib/knowledge";
import { logEvent } from "@/lib/logger";
import type { KnowledgeDocument } from "@/lib/supabase/types";

/**
 * Phase 23's background knowledge-ingestion queue. A knowledge document's
 * own row (title/content) is written synchronously by lib/knowledge.ts /
 * lib/knowledge-sync.ts; `enqueueIngestion` there just flips it back to
 * 'pending' -- the actual chunking + Gemini embedding call happens here,
 * off the request path, triggered two ways: an `after()` call right after
 * the enqueueing request completes (near-instant in the common case), and
 * a daily Vercel Cron sweep (app/api/cron/process-ingestion-queue/route.ts)
 * as a backstop for anything the immediate trigger missed or that's
 * waiting out a retry backoff -- Vercel's Hobby plan caps cron at once a
 * day, so the immediate trigger, not the cron, is what keeps normal
 * ingestion fast.
 *
 * Uses the service-role client throughout: this runs with no Clerk
 * session (cron has none at all; `after()` runs detached from the
 * request that scheduled it) and must be able to claim/process any
 * business's due job, not just one tenant's -- a legitimate second use
 * of the service-role client alongside the public widget path (see
 * lib/supabase/service.ts's own doc comment).
 */

const MAX_JOBS_PER_RUN = 5;
const MAX_INGESTION_ATTEMPTS = 5;
const BACKOFF_BASE_SECONDS = 60;
const MAX_BACKOFF_SECONDS = 60 * 60;

export type ProcessQueueResult = {
  processed: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
};

/** Exponential backoff, capped at 1 hour: 1m, 2m, 4m, 8m, 16m for a 5-attempt max. */
function backoffSeconds(attempts: number): number {
  return Math.min(BACKOFF_BASE_SECONDS * 2 ** (attempts - 1), MAX_BACKOFF_SECONDS);
}

/** Never persist a raw error object (may contain content excerpts) -- message text only, truncated. */
function errorMessageOnly(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

/**
 * Claims up to `MAX_JOBS_PER_RUN` due jobs (via the atomic, lock-safe
 * `claim_knowledge_ingestion_jobs` function) and processes each one:
 * regenerate its chunks/embeddings, and record the outcome. A failure
 * schedules a backoff retry, or -- past `MAX_INGESTION_ATTEMPTS` --
 * dead-letters the document ('failed', terminal, surfaced in the
 * Knowledge page's ingestion status UI with a manual Retry action).
 * Safe to call concurrently (the claim itself is what prevents
 * double-processing, not a lock held by this function).
 */
export async function processIngestionQueue(): Promise<ProcessQueueResult> {
  const supabase = createServiceSupabaseClient();

  const { data: jobs, error: claimError } = await supabase.rpc("claim_knowledge_ingestion_jobs", {
    p_limit: MAX_JOBS_PER_RUN,
  });

  if (claimError) {
    logEvent("knowledge_ingestion_claim_failed", "unknown", {}, "error");
    return { processed: 0, succeeded: 0, failed: 0, deadLettered: 0 };
  }

  const claimed = (jobs ?? []) as KnowledgeDocument[];
  let succeeded = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const document of claimed) {
    try {
      await regenerateChunksForDocument(supabase, document.business_id, document.id, document.content);

      await supabase
        .from("knowledge_documents")
        .update({
          ingestion_status: "complete",
          ingestion_last_error: null,
          ingestion_updated_at: new Date().toISOString(),
        })
        .eq("id", document.id);

      succeeded++;
      logEvent("knowledge_ingestion_succeeded", document.business_id, {
        documentId: document.id,
        attempts: document.ingestion_attempts + 1,
      });
    } catch (error) {
      const attempts = document.ingestion_attempts + 1;
      const isDeadLetter = attempts >= MAX_INGESTION_ATTEMPTS;

      await supabase
        .from("knowledge_documents")
        .update({
          ingestion_status: isDeadLetter ? "failed" : "pending",
          ingestion_attempts: attempts,
          ingestion_last_error: errorMessageOnly(error),
          ingestion_next_attempt_at: new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString(),
          ingestion_updated_at: new Date().toISOString(),
        })
        .eq("id", document.id);

      failed++;
      if (isDeadLetter) {
        deadLettered++;
      }
      logEvent(
        isDeadLetter ? "knowledge_ingestion_dead_lettered" : "knowledge_ingestion_retry_scheduled",
        document.business_id,
        { documentId: document.id, attempts },
        isDeadLetter ? "error" : undefined,
      );
    }
  }

  return { processed: claimed.length, succeeded, failed, deadLettered };
}
