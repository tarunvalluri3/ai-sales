import { SEGMENT_CONDITION_FIELDS, SEGMENT_CONDITION_OPERATORS } from "@/lib/schemas/segment";
import type { SegmentConditionField, SegmentConditionOperator } from "@/lib/supabase/types";

/** Display labels for the segment-builder UI -- kept separate from lib/schemas/segment.ts so the schema module stays server-agnostic (no UI copy in the validation layer). */
export const FIELD_LABEL: Record<SegmentConditionField, string> = {
  score: "Lead score",
  status: "Lead status",
  qualification: "Qualification",
  channel: "Channel",
  has_email: "Has email",
  has_phone: "Has phone",
  has_conversation: "Has a conversation",
  has_appointment: "Has an appointment",
  appointment_status: "Appointment status",
  needs_attention: "Needs attention",
  human_controlled: "Human-controlled",
  tag: "Has tag",
  no_tag: "Missing tag",
  interest_type: "Interest type",
  last_activity_hours: "Hours since last activity",
  conversation_age_hours: "Hours since first seen",
};

export const OPERATOR_LABEL: Record<SegmentConditionOperator, string> = {
  eq: "is",
  neq: "is not",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  exists: "exists",
  not_exists: "doesn't exist",
};

/** Fields whose only sensible operators are existence checks -- the value input is hidden for these. */
export const EXISTENCE_ONLY_FIELDS = new Set<SegmentConditionField>(["has_email", "has_phone", "has_conversation", "has_appointment"]);

/** Fields whose value is a free string compared by name (tag name, channel, status, ...), not a number. */
export const NUMERIC_FIELDS = new Set<SegmentConditionField>(["score", "last_activity_hours", "conversation_age_hours"]);

export const OPERATORS_FOR_FIELD: Record<SegmentConditionField, SegmentConditionOperator[]> = {
  score: ["eq", "neq", "gt", "gte", "lt", "lte"],
  status: ["eq", "neq"],
  qualification: ["eq", "neq"],
  channel: ["eq", "neq"],
  has_email: ["exists", "not_exists"],
  has_phone: ["exists", "not_exists"],
  has_conversation: ["exists", "not_exists"],
  has_appointment: ["exists", "not_exists"],
  appointment_status: ["eq", "neq"],
  needs_attention: ["eq", "neq"],
  human_controlled: ["eq", "neq"],
  tag: ["eq"],
  no_tag: ["eq"],
  interest_type: ["eq", "neq"],
  last_activity_hours: ["gt", "gte", "lt", "lte"],
  conversation_age_hours: ["gt", "gte", "lt", "lte"],
};

export { SEGMENT_CONDITION_FIELDS, SEGMENT_CONDITION_OPERATORS };
