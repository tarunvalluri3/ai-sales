"use server";

import { z } from "zod";
import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { askSalesEmployee } from "@/lib/rag";
import type { ConversationMessage } from "@/lib/rag";
import { captureLeadFromConversation } from "@/lib/lead-capture";
import type { LeadCaptureResult } from "@/lib/lead-capture";
import { logAndGetUserMessage } from "@/lib/errors";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000),
});
const historySchema = z.array(messageSchema).max(50);
const questionSchema = z.string().trim().min(1).max(2000);
const sourceSchema = z.string().trim().max(200).nullable();

export type AskTurnResult = { ok: true; answer: string } | { ok: false; error: string };

/**
 * Called directly from the leads-test client component (not via
 * useActionState/form action) since the caller manages its own growing
 * transcript in client state. `history`/`question` are still untrusted
 * input reaching a Server Action and are Zod-validated here, same as any
 * other external boundary (docs/security.md §7).
 */
export async function askTurnAction(
  history: ConversationMessage[],
  question: string,
): Promise<AskTurnResult> {
  const { businessId, businessName } = await requireBusinessContext();

  const parsedHistory = historySchema.safeParse(history);
  const parsedQuestion = questionSchema.safeParse(question);
  if (!parsedHistory.success || !parsedQuestion.success) {
    return { ok: false, error: "Invalid conversation input." };
  }

  try {
    const result = await askSalesEmployee(
      createServerSupabaseClient(),
      businessId,
      businessName,
      parsedQuestion.data,
      parsedHistory.data,
    );
    return { ok: true, answer: result.answer };
  } catch (error) {
    return { ok: false, error: logAndGetUserMessage(error) };
  }
}

export type ExtractLeadActionResult = { ok: true; result: LeadCaptureResult } | { ok: false; error: string };

export async function extractLeadAction(
  history: ConversationMessage[],
  source: string | null,
): Promise<ExtractLeadActionResult> {
  const { businessId, businessName } = await requireBusinessContext();

  const parsedHistory = historySchema.safeParse(history);
  const parsedSource = sourceSchema.safeParse(source);
  if (!parsedHistory.success || !parsedSource.success) {
    return { ok: false, error: "Invalid conversation input." };
  }

  try {
    const result = await captureLeadFromConversation(
      businessId,
      businessName,
      parsedSource.data,
      parsedHistory.data,
    );
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: logAndGetUserMessage(error) };
  }
}
