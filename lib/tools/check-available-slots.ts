import "server-only";
import { z } from "zod";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateAvailableSlots, DEFAULT_DAYS_AHEAD } from "@/lib/appointments";
import { logEvent } from "@/lib/logger";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export const CheckAvailableSlotsInputSchema = z.object({
  // .min(1) not .positive() -- .positive() emits an "exclusiveMinimum"
  // JSON Schema keyword Gemini's function-declaration parser rejects
  // outright (confirmed live during Phase B1/B2, see lib/tools/recommend-products.ts).
  daysAhead: z
    .number()
    .min(1)
    .max(14)
    .nullable()
    .describe("How many days ahead to look for openings. Null defaults to 7 days."),
});

export const checkAvailableSlotsTool = {
  name: "check_available_slots",
  description:
    "Returns this business's next open appointment slots (already excluding anything booked), each with a human-readable time in the business's own timezone. Only bound when the business has appointment booking enabled. Call this before offering the prospect a specific time.",
  schema: CheckAvailableSlotsInputSchema,
};

export type CheckAvailableSlotsResult =
  | { found: true; timezone: string; slots: { startsAt: string; label: string }[] }
  | { found: false; reason: "no_availability" | "invalid_input" };

/**
 * Authorized executor for the `check_available_slots` tool. `businessId`
 * comes from `askSalesEmployee`'s own trusted parameter, never model
 * input -- same tenant boundary as every other tool in this directory
 * (docs/security.md §1, §8, §9). Read-only.
 */
export async function executeCheckAvailableSlots(
  supabase: SupabaseClient,
  businessId: string,
  rawArgs: unknown,
): Promise<CheckAvailableSlotsResult> {
  const parsed = CheckAvailableSlotsInputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    logEvent("tool_invoked", businessId, { tool: "check_available_slots", result: "invalid_input" }, "error");
    return { found: false, reason: "invalid_input" };
  }

  const { data: business } = await supabase.from("businesses").select("timezone").eq("id", businessId).maybeSingle();
  const timezone = business?.timezone ?? "UTC";

  const slots = await generateAvailableSlots(supabase, businessId, parsed.data.daysAhead ?? DEFAULT_DAYS_AHEAD);

  if (slots.length === 0) {
    logEvent("tool_invoked", businessId, { tool: "check_available_slots", result: "no_availability" });
    return { found: false, reason: "no_availability" };
  }

  logEvent("tool_invoked", businessId, { tool: "check_available_slots", result: "found" });
  return {
    found: true,
    timezone,
    slots: slots.map((slot) => ({ startsAt: slot.startsAt, label: slot.label })),
  };
}
