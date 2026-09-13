"use server";

import { z } from "zod";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { generateSalesBrief } from "@/lib/copilot";
import { logAndGetUserMessage } from "@/lib/errors";

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
