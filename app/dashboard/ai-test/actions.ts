"use server";

import { z } from "zod";
import { requireBusinessContext } from "@/lib/business-context";
import { answerFromKnowledge } from "@/lib/rag";
import { logAndGetUserMessage } from "@/lib/errors";

const questionSchema = z.string().trim().min(1).max(2000);

export type AskFormState = {
  error?: string;
  question?: string;
  answer?: string;
  grounded?: boolean;
  sourceChunkIds?: string[];
};

export async function askKnowledgeAction(
  _prevState: AskFormState,
  formData: FormData,
): Promise<AskFormState> {
  const { businessId } = await requireBusinessContext();

  const parsed = questionSchema.safeParse(formData.get("question"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a question." };
  }

  try {
    const result = await answerFromKnowledge(businessId, parsed.data);
    return {
      question: parsed.data,
      answer: result.answer,
      grounded: result.grounded,
      sourceChunkIds: result.sourceChunkIds,
    };
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
}
