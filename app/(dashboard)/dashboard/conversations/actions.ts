"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { setConversationControl } from "@/lib/conversations";
import { logAndGetUserMessage } from "@/lib/errors";

const setControlSchema = z.object({
  id: z.string().uuid(),
  control: z.enum(["ai", "human"]),
});

export type SetControlState = {
  error?: string;
  success?: boolean;
};

/**
 * Takes over or hands back a conversation. Any authenticated business
 * member may call this -- PRODUCT.md §3 explicitly scopes "take over
 * conversations" to business members, not just org:admin (same
 * authorization tier as D7's products/services/FAQs/lead-status
 * precedent).
 */
export async function setConversationControlAction(
  _prevState: SetControlState,
  formData: FormData,
): Promise<SetControlState> {
  const { businessId } = await requireBusinessContext();

  const parsed = setControlSchema.safeParse({
    id: formData.get("id"),
    control: formData.get("control"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const supabase = createServerSupabaseClient();

  let updated: boolean;
  try {
    updated = await setConversationControl(supabase, businessId, parsed.data.id, parsed.data.control);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!updated) {
    return { error: "This conversation no longer exists." };
  }

  revalidatePath(`/dashboard/conversations/${parsed.data.id}`);
  return { success: true };
}
