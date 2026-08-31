import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { extractTextFromHtml } from "@/lib/html-extract";
import { renderPageText } from "@/lib/browser-render";
import { enqueueIngestion } from "@/lib/knowledge";
import { AppError } from "@/lib/errors";
import { logEvent } from "@/lib/logger";
import type { KnowledgeDocument } from "@/lib/supabase/types";
import { knowledgeContentSchema } from "@/lib/schemas/knowledge";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_CONTENT_LENGTH = 20_000;
/**
 * A plain fetch() + tag-strip (lib/html-extract.ts) cannot run JavaScript,
 * so a client-rendered page (React/Vue/etc. with no server-side rendering)
 * returns only its static shell -- typically just the <title> text, since
 * the real content lives inside a <script> bundle that never executes here.
 * Observed in production: a real such page extracted to exactly 16
 * characters ("Waves Web Studio", the <title> alone). Below this floor the
 * result is almost certainly a JS-rendered shell, not real page content --
 * fall back to a real headless-browser render (lib/browser-render.ts)
 * rather than silently saving a near-empty document as a successful import
 * (previously: the model would ground zero real answers in it while the
 * dashboard still showed "Ready").
 */
const MIN_CONTENT_LENGTH = 100;

/**
 * Fetches a URL and extracts plain text, bounded by size and time. Tries a
 * plain fetch() + tag-strip first (fast, works for the large majority of
 * server-rendered/static sites, unchanged from before); if that returns too
 * little text, falls back to a real headless-browser render
 * (lib/browser-render.ts) for client-rendered (JS-only) sites. Every failure
 * throws `AppError` with a safe, specific user-facing message (no raw
 * network/parse detail) -- `logAndGetUserMessage` (lib/errors.ts) is the
 * single funnel every caller already routes through, so this is what
 * actually reaches the dashboard.
 */
async function fetchUrlContent(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal, redirect: "follow" });
  } catch {
    throw new AppError("Could not reach this URL. Check that it's correct and publicly accessible.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new AppError(`This URL returned an error (status ${response.status}).`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new AppError("This URL doesn't look like a web page (unsupported content type).");
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_RESPONSE_BYTES) {
    throw new AppError("This page is too large to import.");
  }

  const html = new TextDecoder("utf-8").decode(buffer);
  const text = contentType.includes("text/html") ? extractTextFromHtml(html) : html.trim();

  if (text.length >= MIN_CONTENT_LENGTH) {
    return text.slice(0, MAX_CONTENT_LENGTH);
  }

  // The fast path returned too little (or no) text -- almost certainly a
  // client-rendered page. Try a real browser render before giving up.
  const rendered = await renderPageText(url);

  if (rendered.length < MIN_CONTENT_LENGTH) {
    throw new AppError(
      "This page didn't have enough readable content, even after rendering it directly -- it may require sign-in, block automated access, or genuinely have little text. Paste the page's content in manually instead using \"Add knowledge manually.\"",
    );
  }

  return rendered.slice(0, MAX_CONTENT_LENGTH);
}

/**
 * Creates a knowledge document from a URL (Phase 24), fetched once at
 * add-time -- draft by default, same approval-step convention as every
 * other manually-added knowledge document (lib/knowledge.ts's
 * createKnowledgeDocument). `refreshIntervalHours` opts the document
 * into the scheduled sweep (refreshDueUrlKnowledgeSources) below; null
 * means a one-time import.
 */
export async function createUrlKnowledgeDocument(
  businessId: string,
  url: string,
  title: string,
  refreshIntervalHours: number | null,
): Promise<KnowledgeDocument> {
  const content = knowledgeContentSchema.parse(await fetchUrlContent(url));

  const supabase = createServerSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .insert({
      business_id: businessId,
      source_type: "url",
      source_id: null,
      title,
      content,
      status: "draft",
      source_url: url,
      refresh_interval_hours: refreshIntervalHours,
      last_refreshed_at: now,
    })
    .select()
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong saving this knowledge document. Please try again.",
      "createUrlKnowledgeDocument failed",
      error,
    );
  }

  await enqueueIngestion(supabase, businessId, data.id);

  return data;
}

/** Manually re-fetches a URL source's content right now, scoped to the given business. Returns `false` for a cross-tenant, nonexistent, or non-url id. */
export async function refreshUrlKnowledgeDocument(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data: document, error: fetchError } = await supabase
    .from("knowledge_documents")
    .select("id, source_url")
    .eq("business_id", businessId)
    .eq("id", id)
    .eq("source_type", "url")
    .maybeSingle();

  if (fetchError || !document || !document.source_url) {
    return false;
  }

  const content = knowledgeContentSchema.parse(await fetchUrlContent(document.source_url));
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("knowledge_documents")
    .update({ content, last_refreshed_at: now })
    .eq("business_id", businessId)
    .eq("id", id);

  if (updateError) {
    throw new AppError(
      "Something went wrong refreshing this knowledge document. Please try again.",
      "refreshUrlKnowledgeDocument update failed",
      updateError,
    );
  }

  await enqueueIngestion(supabase, businessId, id);
  return true;
}

const MAX_URL_REFRESH_PER_RUN = 5;

/**
 * Scheduled auto-refresh for URL knowledge sources (Phase 24) -- part of
 * the shared daily cron sweep (app/api/cron/process-ingestion-queue),
 * not its own Vercel Cron job (Hobby-plan cron job cap). Finds
 * `source_type = 'url'` documents with a configured refresh interval
 * whose last refresh is now overdue, re-fetches each, and re-enqueues
 * ingestion. A fetch failure for one URL is logged and skipped -- it
 * does not block the others, and the document's last-known-good content
 * stays in place (never blanked out) until a refresh actually succeeds.
 */
export async function refreshDueUrlKnowledgeSources(): Promise<{ refreshed: number; failed: number }> {
  const supabase = createServiceSupabaseClient();

  const { data: documents, error } = await supabase
    .from("knowledge_documents")
    .select("id, business_id, source_url, refresh_interval_hours, last_refreshed_at")
    .eq("source_type", "url")
    .not("refresh_interval_hours", "is", null)
    .limit(MAX_URL_REFRESH_PER_RUN * 4);

  if (error || !documents) {
    return { refreshed: 0, failed: 0 };
  }

  const now = Date.now();
  const due = documents
    .filter((document) => {
      if (!document.last_refreshed_at || !document.refresh_interval_hours) return false;
      const dueAt = new Date(document.last_refreshed_at).getTime() + document.refresh_interval_hours * 60 * 60 * 1000;
      return dueAt <= now;
    })
    .slice(0, MAX_URL_REFRESH_PER_RUN);

  let refreshed = 0;
  let failed = 0;

  for (const document of due) {
    if (!document.source_url) continue;
    try {
      const content = knowledgeContentSchema.parse(await fetchUrlContent(document.source_url));
      const refreshedAt = new Date().toISOString();

      await supabase
        .from("knowledge_documents")
        .update({ content, last_refreshed_at: refreshedAt })
        .eq("id", document.id);

      await enqueueIngestion(supabase, document.business_id, document.id);
      refreshed++;
    } catch (refreshError) {
      failed++;
      logEvent(
        "url_knowledge_refresh_failed",
        document.business_id,
        { documentId: document.id, error: refreshError instanceof Error ? refreshError.message.slice(0, 200) : "unknown" },
        "error",
      );
    }
  }

  return { refreshed, failed };
}
