import { z } from "zod";
import { segmentConditionSchema } from "@/lib/schemas/segment";

/** The validation boundary for a workflow definition (Phase 29). `conditions`/`matchType` reuse `segmentConditionSchema` verbatim -- one condition language for both segments and workflows, not two. */

export const WORKFLOW_TRIGGER_TYPES = [
  "lead_created",
  "lead_status_changed",
  "lead_score_threshold",
  "tag_added",
  "tag_removed",
  "appointment_status_changed",
  "conversation_needs_attention",
  "human_takeover",
  "ai_handback",
  "no_activity_hours",
] as const;

export const triggerConfigSchema = z.object({
  status: z.string().trim().max(40).nullable().optional(),
  threshold: z.number().int().min(0).max(9).nullable().optional(),
  tagId: z.string().uuid().nullable().optional(),
  hours: z.number().int().min(1).max(24 * 30).nullable().optional(),
});

const waitStepSchema = z.object({
  type: z.literal("wait"),
  unit: z.enum(["minutes", "hours", "days"]),
  amount: z.number().int().min(1).max(999),
});

const actionStepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add_tag"), tagId: z.string().uuid() }),
  z.object({ type: z.literal("remove_tag"), tagId: z.string().uuid() }),
  z.object({ type: z.literal("update_lead_status"), status: z.enum(["new", "contacted", "converted", "lost"]) }),
  z.object({ type: z.literal("flag_attention") }),
  z.object({ type: z.literal("assign_owner") }),
  z.object({ type: z.literal("create_task"), title: z.string().trim().min(1).max(200), description: z.string().trim().max(1000).nullable() }),
  z.object({ type: z.literal("generate_followup_draft") }),
  z.object({ type: z.literal("internal_notification"), message: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal("email_notification"), subject: z.string().trim().min(1).max(200), message: z.string().trim().min(1).max(2000) }),
]);

export const workflowStepSchema = z.union([waitStepSchema, actionStepSchema]);

export const workflowPersistSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullable(),
  triggerType: z.enum(WORKFLOW_TRIGGER_TYPES),
  triggerConfig: triggerConfigSchema,
  matchType: z.enum(["all", "any"]),
  conditions: z.array(segmentConditionSchema).max(10),
  steps: z.array(workflowStepSchema).min(1).max(20),
  enabled: z.boolean(),
});

export type WorkflowPersistInput = z.infer<typeof workflowPersistSchema>;
