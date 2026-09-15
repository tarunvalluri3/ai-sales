import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getChatModel } from "@/lib/rag";
import { isWithinUsageQuota } from "@/lib/usage-limit";
import { listCustomersForBusiness, getCustomerProfile, type CustomerSummary } from "@/lib/customers";
import { listMessagesForConversation } from "@/lib/messages";
import { listProductsByIds } from "@/lib/products";
import { listServicesByIds } from "@/lib/services";
import { channelLabel } from "@/lib/conversation-channel";
import { MAX_LEAD_SCORE } from "@/lib/lead-scoring";
import { AppError } from "@/lib/errors";
import type { Message, CopilotDismissal } from "@/lib/supabase/types";
import {
  computePriority,
  isSuppressedByDismissal,
  DISMISSAL_EXPIRY_DAYS,
  PRIORITY_REASON_KEY_LABELS,
  type PriorityReasonKey,
  type PriorityReason,
} from "@/lib/copilot-lifecycle";

export { computePriority, isSuppressedByDismissal, DISMISSAL_EXPIRY_DAYS, PRIORITY_REASON_KEY_LABELS };
export type { PriorityReasonKey, PriorityReason };

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * The AI Sales Copilot (Phase 30). Two halves, deliberately kept
 * separate per the task's own instruction ("do not let the LLM
 * arbitrarily rank records without deterministic supporting data"):
 *
 * 1. `getTodayPriorityList()` -- pure, deterministic, zero AI calls.
 *    Every score/reason traces to a real stored field (needs_attention,
 *    lead score, appointment status, activity recency) -- this is what
 *    orders "what should I do today," never an LLM's own judgment.
 * 2. `generateSalesBrief()` -- the one place this feature calls AI, and
 *    only on demand (a staff click), never as part of building the
 *    priority list itself. Reuses the exact single-shot
 *    `getChatModel().invoke()` pattern already used by
 *    lib/conversation-summary.ts/lib/tag-suggestions.ts -- not a second
 *    AI system, not the RAG/tool-calling agent loop.
 */

export type PriorityItem = {
  customer: CustomerSummary;
  priority: number;
  reasons: PriorityReason[];
  recommendedAction: string;
};

const MAX_PRIORITY_ITEMS = 50;

/**
 * Batched dismissal lookup for a set of customers -- one `.in(...)` query,
 * never one query per customer. Callers should only pass customer ids
 * that already scored `priority > 0`, not the full customer list.
 */
export async function listDismissalsForCustomers(
  supabase: SupabaseClient,
  businessId: string,
  customerIds: string[],
): Promise<Map<string, CopilotDismissal>> {
  if (customerIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("copilot_dismissals")
    .select("*")
    .eq("business_id", businessId)
    .in("customer_id", customerIds);

  if (error) {
    throw new AppError(
      "Something went wrong loading dismissed items. Please try again.",
      "listDismissalsForCustomers failed",
      error,
    );
  }

  return new Map(data.map((row) => [row.customer_id, row]));
}

/**
 * "What should I do today" -- every customer with a nonzero deterministic
 * priority that isn't currently suppressed by a still-valid dismissal,
 * highest first, capped at MAX_PRIORITY_ITEMS. `businessId` must come
 * from `requireBusinessContext()`. Reuses `listCustomersForBusiness()`'s
 * existing bounded aggregation -- same known performance ceiling
 * documented there.
 */
export async function getTodayPriorityList(businessId: string): Promise<PriorityItem[]> {
  const customers = await listCustomersForBusiness(businessId);
  const nowMs = Date.now();

  const scored = customers
    .map((customer) => {
      const { priority, reasons, recommendedAction } = computePriority(customer, nowMs);
      return { customer, priority, reasons, recommendedAction };
    })
    .filter((item) => item.priority > 0);

  if (scored.length === 0) return [];

  const supabase = createServerSupabaseClient();
  const dismissals = await listDismissalsForCustomers(
    supabase,
    businessId,
    scored.map((item) => item.customer.id),
  );

  return scored
    .filter((item) => !isSuppressedByDismissal(item.reasons, dismissals.get(item.customer.id), nowMs))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_PRIORITY_ITEMS);
}

/**
 * Marks a Copilot item handled -- upserts on `(business_id, customer_id)`,
 * storing which reason keys were true right now so a later read can tell
 * a genuinely new reason from one already accounted for.
 */
export async function dismissPriorityItem(
  businessId: string,
  dismissedBy: string,
  customerId: string,
  reasonKeys: PriorityReasonKey[],
): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("copilot_dismissals").upsert(
    {
      business_id: businessId,
      customer_id: customerId,
      reason_keys: reasonKeys,
      dismissed_by: dismissedBy,
      dismissed_at: new Date().toISOString(),
    },
    { onConflict: "business_id,customer_id" },
  );

  if (error) {
    throw new AppError(
      "Something went wrong marking this as handled. Please try again.",
      "dismissPriorityItem failed",
      error,
    );
  }
}

/**
 * Undoes a dismissal. Scoped delete, boolean return (not-found => false),
 * matching `setSalesTaskStatus`'s convention.
 */
export async function undismissPriorityItem(businessId: string, customerId: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("copilot_dismissals")
    .delete()
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong undoing this. Please try again.",
      "undismissPriorityItem failed",
      error,
    );
  }

  return data.length > 0;
}

export type RecentlyHandledItem = {
  customerId: string;
  customerName: string | null;
  reasonKeys: PriorityReasonKey[];
  dismissedAt: string;
  dismissedBy: string;
};

/**
 * Dismissals ordered by most recently handled first, for the "Recently
 * handled" section -- one batched follow-up query for customer display
 * names, not one query per row.
 */
export async function listRecentlyHandled(businessId: string, limit = 20): Promise<RecentlyHandledItem[]> {
  const supabase = createServerSupabaseClient();

  const { data: dismissals, error } = await supabase
    .from("copilot_dismissals")
    .select("*")
    .eq("business_id", businessId)
    .order("dismissed_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new AppError(
      "Something went wrong loading recently handled items. Please try again.",
      "listRecentlyHandled failed",
      error,
    );
  }

  if (dismissals.length === 0) return [];

  const customerIds = dismissals.map((row) => row.customer_id);
  const { data: customers, error: customersError } = await supabase
    .from("customers")
    .select("id, display_name")
    .eq("business_id", businessId)
    .in("id", customerIds);

  if (customersError) {
    throw new AppError(
      "Something went wrong loading recently handled items. Please try again.",
      "listRecentlyHandled customer lookup failed",
      customersError,
    );
  }

  const nameById = new Map(customers.map((row) => [row.id, row.display_name]));

  return dismissals.map((row) => ({
    customerId: row.customer_id,
    customerName: nameById.get(row.customer_id) ?? null,
    reasonKeys: row.reason_keys as PriorityReasonKey[],
    dismissedAt: row.dismissed_at,
    dismissedBy: row.dismissed_by,
  }));
}

const MAX_TRANSCRIPT_CHARS = 6000;
const MAX_BRIEF_LENGTH = 1200;

const ROLE_LABEL: Record<Message["role"], string> = {
  user: "Prospect",
  assistant: "AI",
  human_agent: "Team member",
};

export type SalesBrief = {
  /** Deterministic header -- name/score/status/source/interest -- built entirely from stored fields, never AI-generated. */
  header: string;
  /** The one AI-generated section: conversation narrative, risk, and a recommended next step -- grounded only in the transcript/notes passed to it. Untrusted, display-only, same trust category as `qualification_reason`. */
  narrative: string;
  generatedAt: string;
};

/**
 * Generates a grounded sales brief for one customer, on demand (never
 * cached/persisted, never called from a poll loop). Every claim in
 * `narrative` must trace to the transcript/notes/lead data actually
 * passed into the prompt -- the prompt explicitly forbids inventing a
 * budget, objection, or promise not actually present, same discipline as
 * `lib/conversation-summary.ts`. Throws `AppError` on failure (no
 * silent-partial brief) so the caller can show a real error rather than
 * a confidently-wrong one.
 */
export async function generateSalesBrief(businessId: string, customerId: string): Promise<SalesBrief> {
  const supabase = createServerSupabaseClient();

  const profile = await getCustomerProfile(businessId, customerId);
  if (!profile) {
    throw new AppError("This customer no longer exists.", "generateSalesBrief customer not found");
  }

  const { customer, leads, conversations } = profile;
  const latestLead = leads[0] ?? null;
  const latestConversation = conversations[0] ?? null;

  let interestName: string | null = null;
  if (latestLead?.interest_type === "product" && latestLead.interest_id) {
    const [product] = await listProductsByIds(businessId, [latestLead.interest_id]);
    interestName = product?.name ?? null;
  } else if (latestLead?.interest_type === "service" && latestLead.interest_id) {
    const [service] = await listServicesByIds(businessId, [latestLead.interest_id]);
    interestName = service?.name ?? null;
  }

  const header = [
    customer.display_name ?? "Unnamed prospect",
    "",
    `Score: ${latestLead ? `${latestLead.score}/${MAX_LEAD_SCORE}` : "No lead yet"}`,
    `Status: ${latestLead?.status ?? "—"}`,
    `Source: ${channelLabel(latestConversation?.source ?? null)}`,
    "",
    "Interested in:",
    interestName ?? "Not specified",
  ].join("\n");

  if (!latestConversation) {
    return {
      header,
      narrative: "No conversation on record yet -- nothing to summarize.",
      generatedAt: new Date().toISOString(),
    };
  }

  const withinQuota = await isWithinUsageQuota(supabase, businessId);
  if (!withinQuota) {
    throw new AppError("This business has reached its monthly AI usage limit. Please try again next month.", "generateSalesBrief quota exceeded");
  }

  const messages = await listMessagesForConversation(supabase, businessId, latestConversation.id);
  const transcript = messages.map((message) => `${ROLE_LABEL[message.role]}: ${message.content}`).join("\n").slice(0, MAX_TRANSCRIPT_CHARS);

  const notesLine = latestLead?.notes ? `Notes on file: ${latestLead.notes}` : null;
  const scoreReasonLine = latestLead ? `Deterministic score reason: ${latestLead.qualification_reason}` : null;

  const prompt = `You are writing a short internal sales brief for a staff member about to follow up with this prospect. Using ONLY the conversation transcript and notes below -- never invent a budget, objection, guarantee, or fact not actually present -- write exactly three short sections, each starting with its own line as a plain-text heading (no markdown):

Conversation:
One sentence on the prospect's apparent intent/sentiment.

What happened:
2-4 short bullet-style lines (start each with "- ") on what was actually discussed, in order.

Risk:
One sentence on what could stall this deal, or "None apparent" if nothing stands out.

Recommended next step:
One concrete, specific action for the staff member to take next.

${scoreReasonLine ?? ""}
${notesLine ?? ""}

Transcript:
${transcript}`;

  let narrative: string;
  try {
    const response = await getChatModel().invoke(prompt);
    const text = typeof response.content === "string" ? response.content : String(response.content ?? "");
    narrative = text.trim().slice(0, MAX_BRIEF_LENGTH);
  } catch (error) {
    throw new AppError("Something went wrong generating this brief. Please try again.", "generateSalesBrief invoke failed", error);
  }

  if (!narrative) {
    throw new AppError("The AI didn't return a brief. Please try again.", "generateSalesBrief empty response");
  }

  return { header, narrative, generatedAt: new Date().toISOString() };
}
