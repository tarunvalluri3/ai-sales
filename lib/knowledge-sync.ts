import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { KnowledgeSourceType } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";
import { enqueueIngestion } from "@/lib/knowledge";

/**
 * Keeps a generated knowledge document (and its chunks) in sync with one
 * product/service/FAQ row. Called from lib/products.ts, lib/services.ts,
 * and lib/faqs.ts after every successful create/update. `sourceType` must
 * not be "manual" -- that source type is owned by lib/knowledge.ts.
 */
export async function syncGeneratedDocument(
  businessId: string,
  sourceType: Exclude<KnowledgeSourceType, "manual">,
  sourceId: string,
  title: string,
  content: string,
): Promise<void> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("knowledge_documents")
    .upsert(
      { business_id: businessId, source_type: sourceType, source_id: sourceId, title, content },
      { onConflict: "business_id,source_type,source_id" },
    )
    .select("id")
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong updating this record's knowledge document. Please try again.",
      "syncGeneratedDocument upsert failed",
      error,
    );
  }

  await enqueueIngestion(supabase, businessId, data.id);
}

/**
 * Deletes the generated knowledge document (and its chunks, via cascade)
 * for a product/service/FAQ row. Called from lib/products.ts,
 * lib/services.ts, and lib/faqs.ts after every successful delete.
 */
export async function deleteGeneratedDocument(
  businessId: string,
  sourceType: Exclude<KnowledgeSourceType, "manual">,
  sourceId: string,
): Promise<void> {
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("knowledge_documents")
    .delete()
    .eq("business_id", businessId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);

  if (error) {
    throw new AppError(
      "Something went wrong removing this record's knowledge document. Please try again.",
      "deleteGeneratedDocument failed",
      error,
    );
  }
}
