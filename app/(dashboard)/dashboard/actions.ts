"use server";

import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { countConversationsNeedingAttention } from "@/lib/conversations";

/**
 * Polled directly from AttentionProvider (a plain async function call
 * from a client component, same pattern as pollConversationAction). No
 * Zod input to validate -- no arguments. Real failures propagate as a
 * rejected promise; the caller's poll loop treats a failure as "try
 * again next tick," not a value to guess (Phase 15c).
 */
export async function pollAttentionCountAction(): Promise<number> {
  const { businessId } = await requireBusinessContext();
  const supabase = createServerSupabaseClient();
  return countConversationsNeedingAttention(supabase, businessId);
}
