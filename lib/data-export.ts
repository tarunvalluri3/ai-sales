import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";

/**
 * Full self-service export of everything this business owns (Phase 22e).
 * Every query is scoped to `businessId` in addition to the existing RLS
 * policies already covering these tables (defense in depth, same
 * convention as every list function in this codebase). `businessId` must
 * come from `requireBusinessContext()` or an equivalent validated lookup.
 *
 * `knowledge_chunks.embedding` is deliberately excluded -- a raw pgvector
 * array is not meaningful to a human reading their own export, and this
 * keeps the payload small. `ai_response_metrics` is excluded too --
 * internal operational telemetry, not data the business itself entered
 * or a prospect shared, so it falls outside what this export is for.
 */
export async function exportBusinessData(businessId: string): Promise<Record<string, unknown>> {
  const supabase = createServerSupabaseClient();

  const [
    business,
    products,
    services,
    faqs,
    knowledgeDocuments,
    knowledgeChunks,
    conversations,
    messages,
    leads,
    auditLog,
  ] = await Promise.all([
    supabase.from("businesses").select("*").eq("id", businessId).single(),
    supabase.from("products").select("*").eq("business_id", businessId),
    supabase.from("services").select("*").eq("business_id", businessId),
    supabase.from("faqs").select("*").eq("business_id", businessId),
    supabase.from("knowledge_documents").select("*").eq("business_id", businessId),
    supabase
      .from("knowledge_chunks")
      .select("id, document_id, chunk_index, content, char_count, created_at")
      .eq("business_id", businessId),
    supabase.from("conversations").select("*").eq("business_id", businessId),
    supabase.from("messages").select("*").eq("business_id", businessId),
    supabase.from("leads").select("*").eq("business_id", businessId),
    supabase.from("audit_log").select("*").eq("business_id", businessId),
  ]);

  for (const result of [
    business,
    products,
    services,
    faqs,
    knowledgeDocuments,
    knowledgeChunks,
    conversations,
    messages,
    leads,
    auditLog,
  ]) {
    if (result.error) {
      throw new AppError(
        "Something went wrong preparing your data export. Please try again.",
        "exportBusinessData failed",
        result.error,
      );
    }
  }

  return {
    exportedAt: new Date().toISOString(),
    business: business.data,
    products: products.data,
    services: services.data,
    faqs: faqs.data,
    knowledgeDocuments: knowledgeDocuments.data,
    knowledgeChunks: knowledgeChunks.data,
    conversations: conversations.data,
    messages: messages.data,
    leads: leads.data,
    auditLog: auditLog.data,
  };
}
