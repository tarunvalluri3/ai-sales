import { z } from "zod";

/**
 * The validation boundary for a segment's rule (Phase 28). Deliberately
 * small and flat -- one top-level AND/OR over a list of conditions, each
 * drawn from a fixed allow-listed field/operator set -- per the task's
 * explicit "keep v1 condition types intentionally small, do not build a
 * visual logic programming language" instruction. `value` is left loose
 * (string | number | boolean | null) at the schema layer; lib/segments.ts's
 * evaluator is what actually interprets it per-field and fails closed
 * (treats an unevaluable condition as not-matched) rather than throwing
 * on a mismatched type.
 */

export const SEGMENT_CONDITION_FIELDS = [
  "score",
  "status",
  "qualification",
  "channel",
  "has_email",
  "has_phone",
  "has_conversation",
  "has_appointment",
  "appointment_status",
  "needs_attention",
  "human_controlled",
  "tag",
  "no_tag",
  "interest_type",
  "last_activity_hours",
  "conversation_age_hours",
] as const;

export const SEGMENT_CONDITION_OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "exists", "not_exists"] as const;

export const segmentConditionSchema = z.object({
  field: z.enum(SEGMENT_CONDITION_FIELDS),
  operator: z.enum(SEGMENT_CONDITION_OPERATORS),
  value: z.union([z.string().trim().max(100), z.number(), z.boolean()]).nullable(),
});

export const segmentRuleSchema = z.object({
  matchType: z.enum(["all", "any"]),
  conditions: z.array(segmentConditionSchema).min(1).max(10),
});

export const segmentPersistSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).nullable(),
  rule: segmentRuleSchema,
});

export type SegmentPersistInput = z.infer<typeof segmentPersistSchema>;
