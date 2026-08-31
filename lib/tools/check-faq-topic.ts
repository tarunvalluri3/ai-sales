import "server-only";
import { z } from "zod";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/logger";
import { escapeLikePattern } from "@/lib/sql-escape";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export const CheckFaqTopicInputSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("The topic or question the prospect is asking about, in their own words."),
});

/**
 * Shaped for `bindTools()`, same convention as `checkProductDetailsTool`.
 */
export const checkFaqTopicTool = {
  name: "check_faq_topic",
  description:
    "Does a lookup against this business's real FAQ entries for a specific topic, returning the exact stored answer. Use this when a prospect's question matches a known FAQ topic and the literal, approved wording matters more than a paraphrase.",
  schema: CheckFaqTopicInputSchema,
};

export type CheckFaqTopicResult =
  | { found: true; question: string; answer: string }
  | { found: false; reason: "not_found" | "invalid_input" | "lookup_failed" };

/**
 * Authorized executor for the `check_faq_topic` tool. `businessId` comes
 * from `askSalesEmployee`'s own already-trusted parameter -- never from
 * `rawArgs`, and not part of `CheckFaqTopicInputSchema` -- same tenant
 * boundary as `executeCheckProductDetails` (docs/security.md §1, §8, §9).
 *
 * Matches by substring, not exact match, unlike `check_product_details`:
 * FAQ `question` values are full sentences a prospect will rarely phrase
 * verbatim, so an exact match would almost never fire. A substring match
 * can legitimately return more than one row for a common keyword -- the
 * first match by `created_at` is taken deterministically rather than
 * erroring, same ordering `listFaqsForBusiness()` already uses.
 */
export async function executeCheckFaqTopic(
  supabase: SupabaseClient,
  businessId: string,
  rawArgs: unknown,
): Promise<CheckFaqTopicResult> {
  const parsed = CheckFaqTopicInputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    logEvent("tool_invoked", businessId, { tool: "check_faq_topic", result: "invalid_input" }, "error");
    return { found: false, reason: "invalid_input" };
  }

  const { topic } = parsed.data;

  const { data, error } = await supabase
    .from("faqs")
    .select("question, answer")
    .eq("business_id", businessId)
    .eq("status", "approved")
    .ilike("question", `%${escapeLikePattern(topic)}%`)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    logEvent("tool_invoked", businessId, { tool: "check_faq_topic", result: "lookup_failed" }, "error");
    return { found: false, reason: "lookup_failed" };
  }

  const faq = data[0];
  if (!faq) {
    logEvent("tool_invoked", businessId, { tool: "check_faq_topic", result: "not_found" });
    return { found: false, reason: "not_found" };
  }

  logEvent("tool_invoked", businessId, { tool: "check_faq_topic", result: "found" });
  return { found: true, question: faq.question, answer: faq.answer };
}
