import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { embedText } from "@/lib/embeddings";
import { logEvent } from "@/lib/logger";

/**
 * Product/service embeddings computed AFTER the owner's save has been
 * answered (perf/reply-and-save-speed, STATE.md 2026-11-21). The Gemini
 * embedding call (~430 ms p50 in production) used to sit in front of the
 * insert/update, so every "Add product" waited for it.
 *
 * Only callers that pass `embedLater` (the dashboard/onboarding Server
 * Actions, with Next's `after()`) defer; every other caller still embeds
 * inline. Until the deferred write lands, the row has no embedding (a new
 * item) or its previous one (an edit): match_products/match_services skip
 * a row with no embedding, and the catalog pre-fetch in the chat prompt
 * (lib/catalog-prefetch.ts) lists small catalogs without embeddings anyway.
 *
 * The write is tenant-scoped in the query (business_id AND id) and only
 * applies if the row is still the version that was saved (`updated_at`
 * unchanged): if the owner edited it again meanwhile, that edit's own
 * deferred embedding wins and this stale one is dropped. It uses the
 * service-role client because it runs after the response, as background
 * ingestion work; business_id comes from the validated session of the
 * action that scheduled it, never from input.
 */
export type EmbedLater = (task: () => Promise<void>) => void;

export type CatalogTable = "products" | "services";

export type CatalogEmbeddingDeps = {
  embed: (text: string, businessId: string) => Promise<number[]>;
  update: (
    table: CatalogTable,
    businessId: string,
    id: string,
    updatedAt: string,
    embedding: number[],
  ) => Promise<{ updated: boolean; failed: boolean }>;
  log: (event: string, businessId: string, level: "info" | "error") => void;
};

const defaultDeps: CatalogEmbeddingDeps = {
  embed: (text, businessId) => embedText(text, { feature: "embed_ingest", trigger: "dashboard", businessId }),
  update: async (table, businessId, id, updatedAt, embedding) => {
    const { data, error } = await createServiceSupabaseClient()
      .from(table)
      .update({ embedding })
      .eq("business_id", businessId)
      .eq("id", id)
      .eq("updated_at", updatedAt)
      .select("id");
    return { updated: (data ?? []).length > 0, failed: Boolean(error) };
  },
  log: (event, businessId, level) => logEvent(event, businessId, {}, level),
};

const ITEM = { products: "product", services: "service" } as const;

/** Embeds `text` and stores it on the row, if the row is still the saved version. Never throws. */
export async function writeCatalogEmbedding(
  table: CatalogTable,
  businessId: string,
  id: string,
  updatedAt: string,
  text: string,
  deps: CatalogEmbeddingDeps = defaultDeps,
): Promise<void> {
  const item = ITEM[table];
  let embedding: number[];
  try {
    embedding = await deps.embed(text, businessId);
  } catch {
    // Same event the inline path logs; the row simply stays unembedded until next saved.
    deps.log(`${item}_embedding_failed`, businessId, "error");
    return;
  }
  try {
    const result = await deps.update(table, businessId, id, updatedAt, embedding);
    if (result.failed) deps.log(`${item}_embedding_write_failed`, businessId, "error");
    else if (!result.updated) deps.log(`${item}_embedding_superseded`, businessId, "info");
  } catch {
    deps.log(`${item}_embedding_write_failed`, businessId, "error");
  }
}
