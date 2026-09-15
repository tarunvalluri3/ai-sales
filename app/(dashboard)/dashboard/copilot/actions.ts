"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { generateSalesBrief, dismissPriorityItem, undismissPriorityItem, type PriorityReasonKey } from "@/lib/copilot";
import {
  syncCopilotActionOnDismiss,
  reopenCopilotActionOnUndismiss,
  snoozeCopilotAction,
  resolveSnoozeUntil,
  type SnoozeChoice,
} from "@/lib/copilot-actions";
import { COPILOT_ACTION_TYPES, type CopilotActionType } from "@/lib/copilot-lifecycle";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { logAndGetUserMessage } from "@/lib/errors";
import type { DeleteState } from "../_components/delete-button";

export type GenerateBriefState = {
  error?: string;
  header?: string;
  narrative?: string;
  generatedAt?: string;
};

const schema = z.object({ customerId: z.string().uuid() });

/**
 * Generates an on-demand sales brief -- `org:analyst_viewer` minimum,
 * same tier as `generateConversationSummaryAction`: this synthesizes
 * existing data for display, it doesn't mutate a lead/conversation the
 * way accepting a recommendation or sending a message would.
 */
export async function generateSalesBriefAction(_prevState: GenerateBriefState, formData: FormData): Promise<GenerateBriefState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:analyst_viewer");
  if (authError) {
    return { error: authError };
  }

  const parsed = schema.safeParse({ customerId: formData.get("customerId") });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  try {
    const brief = await generateSalesBrief(businessId, parsed.data.customerId);
    return { header: brief.header, narrative: brief.narrative, generatedAt: brief.generatedAt };
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
}

const REASON_KEYS = [
  "needs_attention",
  "appointment_pending",
  "appointment_soon",
  "lead_score",
  "stalled",
  "human_controlled",
] as const;

const dismissSchema = z.object({
  customerId: z.string().uuid(),
  reasonKeys: z.array(z.enum(REASON_KEYS)).min(1),
});

export type DismissState = {
  error?: string;
  success?: boolean;
};

/**
 * Marks a Copilot item as handled -- `org:sales_agent` minimum, same tier
 * as every other real mutation in this app (lead status change, tag
 * assign, conversation takeover). One click, no confirm dialog: fully
 * reversible via the "Recently handled" Undo button.
 */
export async function dismissPriorityItemAction(_prevState: DismissState, formData: FormData): Promise<DismissState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) {
    return { error: authError };
  }

  const parsed = dismissSchema.safeParse({
    customerId: formData.get("customerId"),
    reasonKeys: formData.getAll("reasonKeys"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  try {
    await dismissPriorityItem(businessId, userId, parsed.data.customerId, parsed.data.reasonKeys as PriorityReasonKey[]);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  await recordAuditLogEntry(businessId, userId, "copilot.item_dismissed", "customer", parsed.data.customerId, {
    reasonKeys: parsed.data.reasonKeys.join(","),
  });

  // v2 addition, purely additive: keeps the matching copilot_actions row
  // (if reconciliation has already created one) in sync so it correctly
  // shows under "Completed" and stops appearing on Today. The v1
  // dismissal above has already succeeded regardless of this outcome.
  await syncCopilotActionOnDismiss(businessId, parsed.data.customerId, userId);

  revalidatePath("/dashboard/copilot");
  return { success: true };
}

/**
 * Undoes a dismissal -- same `org:sales_agent` tier. Reads a plain `id`
 * field (not `customerId`) so it plugs directly into the shared
 * `DeleteButton` component with zero changes to it; `id` here holds the
 * customer id, which uniquely identifies the dismissal row.
 */
export async function undismissPriorityItemAction(_prevState: DeleteState, formData: FormData): Promise<DeleteState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) {
    return { error: authError };
  }

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  let removed: boolean;
  try {
    removed = await undismissPriorityItem(businessId, parsed.data.id);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!removed) {
    return { error: "This item is no longer in Recently handled." };
  }

  await recordAuditLogEntry(businessId, userId, "copilot.item_undismissed", "customer", parsed.data.id);

  // v2 addition: reopens the matching copilot_actions row so it doesn't
  // stay permanently suppressed now that its copilot_dismissals row is
  // gone -- see reopenCopilotActionOnUndismiss()'s doc comment.
  await reopenCopilotActionOnUndismiss(businessId, parsed.data.id);

  revalidatePath("/dashboard/copilot");
  return { success: true };
}

const SNOOZE_PRESET_VALUES = ["later_today", "tomorrow", "next_week", "custom"] as const;

const snoozeSchema = z
  .object({
    customerId: z.string().uuid(),
    actionType: z.enum(COPILOT_ACTION_TYPES as [CopilotActionType, ...CopilotActionType[]]),
    preset: z.enum(SNOOZE_PRESET_VALUES),
    until: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((value) => value.preset !== "custom" || Boolean(value.until), {
    message: "Pick a date and time.",
    path: ["until"],
  });

export type SnoozeState = {
  error?: string;
  success?: boolean;
};

/**
 * "Remind me at this time" -- `org:sales_agent` minimum, same tier as
 * every other Copilot mutation. Distinct from "Mark as handled": a
 * snoozed item hides from Today and appears in Upcoming until its wake
 * time, then becomes actionable again on its own -- no AI call, no staff
 * action required to wake it (lib/copilot-lifecycle.ts's `isSnoozeDue`).
 */
export async function snoozePriorityItemAction(_prevState: SnoozeState, formData: FormData): Promise<SnoozeState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) {
    return { error: authError };
  }

  const parsed = snoozeSchema.safeParse({
    customerId: formData.get("customerId"),
    actionType: formData.get("actionType"),
    preset: formData.get("preset"),
    until: formData.get("until") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const choice: SnoozeChoice = parsed.data.preset === "custom" ? { preset: "custom", until: parsed.data.until as string } : { preset: parsed.data.preset };

  let snoozed: boolean;
  try {
    const snoozedUntil = await resolveSnoozeUntil(businessId, choice);
    snoozed = await snoozeCopilotAction(businessId, parsed.data.customerId, parsed.data.actionType, snoozedUntil);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!snoozed) {
    return { error: "This item is no longer open." };
  }

  await recordAuditLogEntry(businessId, userId, "copilot.action_snoozed", "customer", parsed.data.customerId, {
    actionType: parsed.data.actionType,
  });

  revalidatePath("/dashboard/copilot");
  return { success: true };
}
