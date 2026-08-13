import "server-only";
import type { ConversationMessage } from "@/lib/rag";
import { extractLead } from "@/lib/lead-extraction";
import { createConversation } from "@/lib/conversations";
import { createLead } from "@/lib/leads";
import { listProductsForBusiness } from "@/lib/products";
import { listServicesForBusiness } from "@/lib/services";
import { normalizeEmail, normalizePhone, leadPersistSchema } from "@/lib/schemas/lead";
import type { Lead, LeadInterestType } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

export type LeadCaptureResult = { created: true; lead: Lead } | { created: false };

/**
 * Resolves an AI-suggested interest name to a real catalog row's id,
 * tenant-scoped. Never trusts a raw id from AI output -- only a name,
 * matched case-insensitively against this business's own products/
 * services (docs/security.md §8). No match, or interestType isn't
 * product/service, returns null.
 */
async function resolveInterestId(
  businessId: string,
  interestType: LeadInterestType | null,
  interestName: string | null,
): Promise<string | null> {
  if (!interestName || (interestType !== "product" && interestType !== "service")) {
    return null;
  }

  const needle = interestName.trim().toLowerCase();
  if (needle === "") {
    return null;
  }

  const catalog =
    interestType === "product"
      ? await listProductsForBusiness(businessId)
      : await listServicesForBusiness(businessId);

  const match = catalog.find((item) => item.name.trim().toLowerCase() === needle);
  return match?.id ?? null;
}

/**
 * Extracts a lead from a conversation transcript and persists it, per
 * PRODUCT.md §8. If the prospect gave neither a usable email nor phone
 * number, no conversation row and no lead row are created at all --
 * this is an intentional v1 tradeoff (see prompts/phase-10-lead-extraction-creation.md
 * Decision 2), not an error.
 */
export async function captureLeadFromConversation(
  businessId: string,
  businessName: string,
  source: string | null,
  transcript: ConversationMessage[],
): Promise<LeadCaptureResult> {
  const extracted = await extractLead(businessName, transcript);

  const contactEmail = normalizeEmail(extracted.contactEmail);
  const contactPhone = normalizePhone(extracted.contactPhone);

  if (contactEmail === null && contactPhone === null) {
    return { created: false };
  }

  const interestId = await resolveInterestId(businessId, extracted.interestType, extracted.interestName);

  const parsed = leadPersistSchema.safeParse({
    contactName: extracted.contactName,
    contactEmail,
    contactPhone,
    interestType: extracted.interestType,
    interestId,
    notes: extracted.notes,
    qualification: extracted.qualification,
    qualificationReason: extracted.qualificationReason,
    source,
  });

  if (!parsed.success) {
    throw new AppError(
      "Something went wrong saving this lead. Please try again.",
      "captureLeadFromConversation: lead payload failed validation",
      parsed.error,
    );
  }

  const conversation = await createConversation(businessId, source);
  const lead = await createLead(businessId, conversation.id, parsed.data);

  return { created: true, lead };
}
