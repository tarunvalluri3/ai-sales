"use server";

import { z } from "zod";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { generateWebsiteSuggestions } from "@/lib/website-suggestions";
import { loadWebsiteImport, reviewLeaseActive, updateWebsiteImport } from "@/lib/website-suggestion-state";
import { faqFieldsSchema } from "@/lib/schemas/faq";
import { parseCatalogForm } from "@/lib/schemas/catalog";
import { createFaq } from "@/lib/faqs";
import { createProduct } from "@/lib/products";
import { createService } from "@/lib/services";
import { processIngestionQueue } from "@/lib/ingestion-queue";
import { logAndGetUserMessage } from "@/lib/errors";

type ActionResult = { error?: string; success?: boolean };
const generationRequest = z.object({ documentId: z.uuid(), retry: z.boolean() });
const reviewRequest = z.object({ documentId: z.uuid(), itemId: z.uuid(), operation: z.enum(["approve", "discard"]) });

export async function suggestFromWebsiteAction(input: unknown): Promise<ActionResult> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) return { error: authError };
  const parsed = generationRequest.safeParse(input);
  if (!parsed.success) return { error: "Choose a valid imported page." };
  try {
    const result = await generateWebsiteSuggestions(businessId, parsed.data.documentId, parsed.data.retry);
    revalidatePath("/onboarding");
    return result;
  } catch (error) {
    logAndGetUserMessage(error);
    revalidatePath("/onboarding");
    return { error: "Couldn’t generate suggestions. You can keep setting up your agent." };
  }
}

async function finishReview(businessId: string, documentId: string, itemId: string, lockedAt: number, remove: boolean) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await loadWebsiteImport(businessId, documentId);
    if (!current) return;
    const item = current.suggestions.find((suggestion) => suggestion.id === itemId);
    if (!item || item.lockedAt !== lockedAt) return;
    const suggestions = remove
      ? current.suggestions.filter((suggestion) => suggestion.id !== itemId)
      : current.suggestions.map((suggestion) => suggestion.id === itemId ? { ...suggestion, lockedAt: undefined } : suggestion);
    if (await updateWebsiteImport(current, { suggestions })) return;
  }
  throw new Error("The website review changed while saving.");
}

export async function reviewWebsiteSuggestionAction(form: FormData): Promise<ActionResult> {
  const { businessId, currency, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) return { error: authError };
  const parsed = reviewRequest.safeParse({
    documentId: form.get("documentId"), itemId: form.get("itemId"), operation: form.get("operation"),
  });
  if (!parsed.success) return { error: "Choose a valid suggestion." };
  const { documentId, itemId, operation } = parsed.data;
  try {
    const state = await loadWebsiteImport(businessId, documentId);
    const item = state?.suggestions.find((suggestion) => suggestion.id === itemId);
    if (!state || !item) return { error: "This suggestion is no longer available." };
    if (item.lockedAt && reviewLeaseActive(item.lockedAt)) return { error: "This suggestion is already being saved." };

    if (operation === "discard") {
      const saved = await updateWebsiteImport(state, { suggestions: state.suggestions.filter((suggestion) => suggestion.id !== itemId) });
      if (!saved) return { error: "The review has changed. Refresh and try again." };
      revalidatePath("/onboarding");
      return { success: true };
    }

    const faq = item.kind === "faq" ? faqFieldsSchema.safeParse({ question: form.get("question"), answer: form.get("answer") }) : null;
    const catalog = item.kind === "faq" ? null : parseCatalogForm(form);
    if (faq && !faq.success) return { error: faq.error.issues[0].message };
    if (catalog && !catalog.ok) return { error: Object.values(catalog.fieldErrors)[0] ?? "Enter valid offering details." };
    const lockedAt = Date.now();
    const claimed = await updateWebsiteImport(state, {
      suggestions: state.suggestions.map((suggestion) => suggestion.id === itemId ? { ...suggestion, lockedAt } : suggestion),
    });
    if (!claimed) return { error: "The review has changed. Refresh and try again." };

    try {
      // The same schemas and create services as the ordinary forms. Using the
      // server-generated suggestion ID lets a retry pick up a partially saved item.
      if (faq?.success) await createFaq(businessId, faq.data, itemId);
      if (catalog?.ok && item.kind === "product") await createProduct(businessId, catalog.data, currency, itemId);
      if (catalog?.ok && item.kind === "service") await createService(businessId, catalog.data, currency, itemId);
    } catch (error) {
      await finishReview(businessId, documentId, itemId, lockedAt, false);
      throw error;
    }
    after(() => processIngestionQueue("dashboard"));
    await finishReview(businessId, documentId, itemId, lockedAt, true);
    revalidatePath("/onboarding");
    revalidatePath("/dashboard/faqs");
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/services");
    return { success: true };
  } catch (error) {
    logAndGetUserMessage(error);
    return { error: "Couldn’t save the review. Refresh and try again." };
  }
}
