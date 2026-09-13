import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Segment, SegmentCondition } from "@/lib/supabase/types";
import type { SegmentPersistInput } from "@/lib/schemas/segment";
import { AppError } from "@/lib/errors";
import { listCustomersForBusiness, type CustomerSummary } from "@/lib/customers";

const UNIQUE_VIOLATION = "23505";

/** Lists a business's saved segments, alphabetical. `businessId` must come from `requireBusinessContext()`. */
export async function listSegmentsForBusiness(businessId: string): Promise<Segment[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("segments")
    .select("*")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

  if (error) {
    throw new AppError("Something went wrong loading segments. Please try again.", "listSegmentsForBusiness failed", error);
  }

  return data as Segment[];
}

/** Creates a segment. Throws a friendly message on a duplicate name (case-insensitive), the one failure mode a user can act on. */
export async function createSegment(businessId: string, input: SegmentPersistInput): Promise<Segment> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("segments")
    .insert({
      business_id: businessId,
      name: input.name,
      description: input.description,
      match_type: input.rule.matchType,
      conditions: input.rule.conditions,
    })
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new AppError("A segment with this name already exists.", "createSegment duplicate name", error);
    }
    throw new AppError("Something went wrong creating this segment. Please try again.", "createSegment failed", error);
  }

  return data as Segment;
}

/** Updates a segment's name/description/rule. `false` (not thrown) if `id` doesn't belong to `businessId`. */
export async function updateSegment(businessId: string, id: string, input: SegmentPersistInput): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("segments")
    .update({
      name: input.name,
      description: input.description,
      match_type: input.rule.matchType,
      conditions: input.rule.conditions,
    })
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new AppError("A segment with this name already exists.", "updateSegment duplicate name", error);
    }
    throw new AppError("Something went wrong updating this segment. Please try again.", "updateSegment failed", error);
  }

  return data.length > 0;
}

/** Deletes a segment. `false` if `id` doesn't belong to `businessId`. */
export async function deleteSegment(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("segments").delete().eq("business_id", businessId).eq("id", id).select("id");

  if (error) {
    throw new AppError("Something went wrong deleting this segment. Please try again.", "deleteSegment failed", error);
  }

  return data.length > 0;
}

const CHANNEL_ALIASES: Record<string, string> = { website: "chat_widget" };

function toChannelValue(value: string | number | boolean | null): string | null {
  if (typeof value !== "string") return null;
  return CHANNEL_ALIASES[value] ?? value;
}

function compareNumeric(actual: number, operator: SegmentCondition["operator"], value: string | number | boolean | null): boolean {
  const target = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (Number.isNaN(target)) return false;
  switch (operator) {
    case "eq":
      return actual === target;
    case "neq":
      return actual !== target;
    case "gt":
      return actual > target;
    case "gte":
      return actual >= target;
    case "lt":
      return actual < target;
    case "lte":
      return actual <= target;
    default:
      return false;
  }
}

function compareEquality(actual: string | boolean | null, operator: SegmentCondition["operator"], value: string | number | boolean | null): boolean {
  if (operator === "exists") return actual !== null && actual !== undefined;
  if (operator === "not_exists") return actual === null || actual === undefined;
  if (operator !== "eq" && operator !== "neq") return false;
  const matches = actual !== null && String(actual).toLowerCase() === String(value).toLowerCase();
  return operator === "eq" ? matches : !matches;
}

/**
 * Evaluates one condition against a customer snapshot. Fails closed
 * (returns `false`) on any type/shape mismatch -- an unevaluable
 * condition is treated as "does not match," never as a thrown error that
 * would take down the whole segment evaluation over one bad row.
 */
function evaluateCondition(condition: SegmentCondition, customer: CustomerSummary, nowMs: number): boolean {
  const { field, operator, value } = condition;

  switch (field) {
    case "score":
      return customer.latestLead ? compareNumeric(customer.latestLead.score, operator, value) : false;
    case "status":
      return compareEquality(customer.latestLead?.status ?? null, operator, value);
    case "qualification":
      return compareEquality(customer.latestLead?.qualification ?? null, operator, value);
    case "interest_type":
      return compareEquality(customer.latestLead?.interestType ?? null, operator, value);
    case "channel":
      return compareEquality(customer.latestChannel, operator, toChannelValue(value) ?? value);
    case "appointment_status":
      return compareEquality(customer.latestAppointmentStatus, operator, value);
    case "has_email":
      return operator === "exists" ? customer.email !== null : operator === "not_exists" ? customer.email === null : false;
    case "has_phone":
      return operator === "exists" ? customer.phone !== null : operator === "not_exists" ? customer.phone === null : false;
    case "has_conversation":
      return operator === "exists" ? customer.conversationCount > 0 : operator === "not_exists" ? customer.conversationCount === 0 : false;
    case "has_appointment":
      return operator === "exists" ? customer.appointmentCount > 0 : operator === "not_exists" ? customer.appointmentCount === 0 : false;
    case "needs_attention": {
      const target = value === true || value === "true";
      if (operator === "eq") return customer.needsAttention === target;
      if (operator === "neq") return customer.needsAttention !== target;
      return false;
    }
    case "human_controlled": {
      const target = value === true || value === "true";
      if (operator === "eq") return customer.humanControlled === target;
      if (operator === "neq") return customer.humanControlled !== target;
      return false;
    }
    case "tag":
      return typeof value === "string" && customer.tagNames.some((name) => name.toLowerCase() === value.toLowerCase());
    case "no_tag":
      return typeof value === "string" && !customer.tagNames.some((name) => name.toLowerCase() === value.toLowerCase());
    case "last_activity_hours":
      return compareNumeric((nowMs - new Date(customer.lastActivityAt).getTime()) / (60 * 60 * 1000), operator, value);
    case "conversation_age_hours":
      return compareNumeric((nowMs - new Date(customer.firstSeenAt).getTime()) / (60 * 60 * 1000), operator, value);
    default:
      return false;
  }
}

/** Evaluates a segment's rule against one customer snapshot. Pure function -- no I/O. */
export function customerMatchesSegment(
  rule: { matchType: "all" | "any"; conditions: SegmentCondition[] },
  customer: CustomerSummary,
  nowMs: number = Date.now(),
): boolean {
  if (rule.conditions.length === 0) return false;
  const results = rule.conditions.map((condition) => evaluateCondition(condition, customer, nowMs));
  return rule.matchType === "all" ? results.every(Boolean) : results.some(Boolean);
}

/**
 * Full segment membership for a business -- fetches the same bounded
 * customer snapshot `lib/customers.ts`'s Customers page uses, then
 * filters it in application code against the segment's rule. See
 * `listCustomersForBusiness`'s own doc comment for this approach's known
 * performance ceiling.
 */
export async function listCustomersInSegment(businessId: string, segment: Pick<Segment, "match_type" | "conditions">): Promise<CustomerSummary[]> {
  const customers = await listCustomersForBusiness(businessId);
  const rule = { matchType: segment.match_type, conditions: segment.conditions };
  const nowMs = Date.now();
  return customers.filter((customer) => customerMatchesSegment(rule, customer, nowMs));
}
