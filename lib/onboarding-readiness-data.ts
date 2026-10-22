import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Business, IngestionStatus, KnowledgeDocumentStatus } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";
import { listFaqsForBusiness } from "@/lib/faqs";
import { listProductsForBusiness } from "@/lib/products";
import { listServicesForBusiness } from "@/lib/services";
import {
  evaluateReadiness,
  type ReadinessInput,
  type ReadinessKnowledgeSource,
  type ReadinessReport,
} from "@/lib/onboarding-readiness";

/**
 * Server-side half of onboarding readiness: turns a business's real
 * Supabase rows into the pure `ReadinessInput` that lib/onboarding-readiness.ts
 * grades. Every query is tenant-scoped (RLS by the authenticated org, with
 * a defensive `business_id` filter on top). `businessId`/`business` must
 * come from a validated session (requireBusinessContext / getBusinessForOrg),
 * never from client input.
 */

type KnowledgeDocRow = {
  id: string;
  source_type: ReadinessKnowledgeSource["sourceType"];
  source_id: string | null;
  ingestion_status: IngestionStatus;
  status: KnowledgeDocumentStatus;
};

/** Fetches the readiness snapshot and evaluates it in one call. */
export async function loadReadinessReport(businessId: string, business: Business): Promise<ReadinessReport> {
  const [knowledgeDocs, chunkedDocIds, faqs, products, services, openHoursDays, dismissedItemKeys] =
    await Promise.all([
      fetchKnowledgeDocs(businessId),
      fetchDocIdsWithChunks(businessId),
      listFaqsForBusiness(businessId),
      listProductsForBusiness(businessId),
      listServicesForBusiness(businessId),
      countOpenBusinessHoursDays(businessId),
      listDismissedItemKeys(businessId),
    ]);

  // Ingestion status per FAQ-generated document, keyed by the FAQ row id it
  // was synced from (lib/knowledge-sync.ts: source_type 'faq', source_id = faq.id).
  const faqDocStatusBySourceId = new Map<string, IngestionStatus>();
  for (const doc of knowledgeDocs) {
    if (doc.source_type === "faq" && doc.source_id) {
      faqDocStatusBySourceId.set(doc.source_id, doc.ingestion_status);
    }
  }

  const knowledgeSources: ReadinessKnowledgeSource[] = knowledgeDocs.map((doc) => ({
    sourceType: doc.source_type,
    ingestionStatus: doc.ingestion_status,
    documentStatus: doc.status,
    hasChunks: chunkedDocIds.has(doc.id),
  }));

  const input: ReadinessInput = {
    businessType: business.business_type,
    name: business.name,
    description: business.description,
    contactEmail: business.contact_email,
    contactPhone: business.contact_phone,
    website: business.website,
    privacyPolicyUrl: business.privacy_policy_url,
    appointmentsEnabled: business.appointments_enabled,
    alreadyPublished: business.published_at != null,
    knowledgeSources,
    faqs: faqs.map((faq) => ({
      question: faq.question,
      answer: faq.answer,
      generatedDocIngestionStatus: faqDocStatusBySourceId.get(faq.id) ?? null,
    })),
    catalogItems: [...products, ...services].map((item) => ({
      name: item.name,
      description: item.description,
    })),
    openBusinessHoursDayCount: openHoursDays,
    dismissedItemKeys,
  };

  return evaluateReadiness(input);
}

async function fetchKnowledgeDocs(businessId: string): Promise<KnowledgeDocRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("id, source_type, source_id, ingestion_status, status")
    .eq("business_id", businessId);

  if (error) {
    throw new AppError(
      "Something went wrong checking your knowledge readiness. Please try again.",
      "loadReadinessReport: knowledge_documents fetch failed",
      error,
    );
  }
  return (data ?? []) as KnowledgeDocRow[];
}

async function fetchDocIdsWithChunks(businessId: string): Promise<Set<string>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select("document_id")
    .eq("business_id", businessId);

  if (error) {
    throw new AppError(
      "Something went wrong checking your knowledge readiness. Please try again.",
      "loadReadinessReport: knowledge_chunks fetch failed",
      error,
    );
  }
  return new Set((data ?? []).map((row) => row.document_id as string));
}

async function countOpenBusinessHoursDays(businessId: string): Promise<number> {
  const supabase = createServerSupabaseClient();
  const { count, error } = await supabase
    .from("business_hours")
    .select("day_of_week", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("is_open", true);

  if (error) {
    throw new AppError(
      "Something went wrong checking your business hours. Please try again.",
      "loadReadinessReport: business_hours count failed",
      error,
    );
  }
  return count ?? 0;
}

async function listDismissedItemKeys(businessId: string): Promise<string[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("business_readiness_dismissals")
    .select("item_key")
    .eq("business_id", businessId);

  if (error) {
    throw new AppError(
      "Something went wrong loading your readiness settings. Please try again.",
      "loadReadinessReport: dismissals fetch failed",
      error,
    );
  }
  return (data ?? []).map((row) => row.item_key as string);
}

/**
 * Records (or clears) an explicit "doesn't apply to us" acknowledgement for
 * a dismissible readiness item. Authorization (org:admin) and key validity
 * are enforced by the caller (the Server Action). `businessId` must come
 * from a validated session.
 */
export async function setReadinessDismissal(
  businessId: string,
  userId: string,
  itemKey: string,
  dismissed: boolean,
): Promise<void> {
  const supabase = createServerSupabaseClient();

  if (dismissed) {
    const { error } = await supabase
      .from("business_readiness_dismissals")
      .upsert(
        { business_id: businessId, item_key: itemKey, dismissed_by: userId, dismissed_at: new Date().toISOString() },
        { onConflict: "business_id,item_key" },
      );
    if (error) {
      throw new AppError(
        "Something went wrong saving that. Please try again.",
        "setReadinessDismissal upsert failed",
        error,
      );
    }
    return;
  }

  const { error } = await supabase
    .from("business_readiness_dismissals")
    .delete()
    .eq("business_id", businessId)
    .eq("item_key", itemKey);
  if (error) {
    throw new AppError(
      "Something went wrong saving that. Please try again.",
      "setReadinessDismissal delete failed",
      error,
    );
  }
}
