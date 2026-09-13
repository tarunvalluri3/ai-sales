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
import type { Message } from "@/lib/supabase/types";

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

export type PriorityReason = { label: string; weight: number };

export type PriorityItem = {
  customer: CustomerSummary;
  priority: number;
  reasons: PriorityReason[];
  recommendedAction: string;
};

const STALLED_HOURS = 48;
const MAX_PRIORITY_ITEMS = 50;

/**
 * Deterministic priority score + one recommended action for a customer
 * snapshot. Pure function, no I/O -- every input is a real stored field,
 * every weight is a fixed constant declared here, nothing is invented.
 */
export function computePriority(customer: CustomerSummary, nowMs: number = Date.now()): { priority: number; reasons: PriorityReason[]; recommendedAction: string } {
  const reasons: PriorityReason[] = [];
  let priority = 0;

  if (customer.needsAttention) {
    priority += 50;
    reasons.push({ label: "Conversation needs attention", weight: 50 });
  }

  if (customer.latestAppointmentStatus === "pending") {
    priority += 40;
    reasons.push({ label: "Appointment awaiting confirmation", weight: 40 });
  } else if (customer.latestAppointmentStatus === "confirmed" && customer.latestAppointmentStartsAt) {
    const hoursUntil = (new Date(customer.latestAppointmentStartsAt).getTime() - nowMs) / (60 * 60 * 1000);
    if (hoursUntil >= 0 && hoursUntil <= 24) {
      priority += 25;
      reasons.push({ label: "Appointment within 24 hours", weight: 25 });
    }
  }

  if (customer.latestLead) {
    const scoreWeight = customer.latestLead.score * 5;
    priority += scoreWeight;
    if (scoreWeight > 0) {
      reasons.push({ label: `Lead score ${customer.latestLead.score}/${MAX_LEAD_SCORE}`, weight: scoreWeight });
    }
  }

  const hoursSinceActivity = (nowMs - new Date(customer.lastActivityAt).getTime()) / (60 * 60 * 1000);
  const isOpenLead = customer.latestLead && customer.latestLead.status !== "converted" && customer.latestLead.status !== "lost";
  const isStalled = isOpenLead && hoursSinceActivity > STALLED_HOURS;
  if (isStalled) {
    priority += 20;
    reasons.push({ label: `No activity for ${Math.round(hoursSinceActivity)}h`, weight: 20 });
  }

  if (customer.humanControlled) {
    priority += 10;
    reasons.push({ label: "Currently human-controlled", weight: 10 });
  }

  let recommendedAction = "Review";
  if (customer.needsAttention) recommendedAction = "Review and respond";
  else if (customer.latestAppointmentStatus === "pending") recommendedAction = "Confirm or decline the appointment";
  else if (customer.latestAppointmentStatus === "confirmed" && reasons.some((r) => r.label === "Appointment within 24 hours")) recommendedAction = "Confirm attendance";
  else if (isStalled) recommendedAction = "Follow up";
  else if (customer.latestLead?.qualification === "hot") recommendedAction = "Follow up and offer a consultation";
  else if (customer.latestLead && !customer.latestAppointmentStatus) recommendedAction = "Invite to book";

  return { priority, reasons, recommendedAction };
}

/**
 * "What should I do today" -- every customer with a nonzero deterministic
 * priority, highest first, capped at MAX_PRIORITY_ITEMS. `businessId`
 * must come from `requireBusinessContext()`. Reuses `listCustomersForBusiness()`'s
 * existing bounded aggregation -- same known performance ceiling
 * documented there.
 */
export async function getTodayPriorityList(businessId: string): Promise<PriorityItem[]> {
  const customers = await listCustomersForBusiness(businessId);
  const nowMs = Date.now();

  return customers
    .map((customer) => {
      const { priority, reasons, recommendedAction } = computePriority(customer, nowMs);
      return { customer, priority, reasons, recommendedAction };
    })
    .filter((item) => item.priority > 0)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_PRIORITY_ITEMS);
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
