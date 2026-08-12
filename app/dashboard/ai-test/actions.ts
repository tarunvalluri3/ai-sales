"use server";

import { z } from "zod";
import { requireBusinessContext } from "@/lib/business-context";
import { askSalesEmployee } from "@/lib/rag";
import { logAndGetUserMessage } from "@/lib/errors";

const questionSchema = z.string().trim().min(1).max(2000);

export type AskFormState = {
  error?: string;
  question?: string;
  answer?: string;
  grounded?: boolean;
  usedContext?: boolean;
  sourceChunkIds?: string[];
  escalate?: boolean;
  escalationReason?: string | null;
};

export async function askKnowledgeAction(
  _prevState: AskFormState,
  formData: FormData,
): Promise<AskFormState> {
  const { businessId, businessName } = await requireBusinessContext();

  const parsed = questionSchema.safeParse(formData.get("question"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a question." };
  }

  try {
    const result = await askSalesEmployee(businessId, businessName, parsed.data);
    return {
      question: parsed.data,
      answer: result.answer,
      grounded: result.grounded,
      usedContext: result.usedContext,
      sourceChunkIds: result.sourceChunkIds,
      escalate: result.escalate,
      escalationReason: result.escalationReason,
    };
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
}
