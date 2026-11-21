import "server-only";
import type { z } from "zod";
import { isAIMessage } from "@langchain/core/messages";
import { dailyReplyCapsFromEnv, incrementDailyCounters } from "@/lib/daily-reply-limit";
import { dailyLimitVerdict } from "@/lib/daily-reply-limit-rules";
import { withGeminiUsageLog } from "@/lib/gemini-usage-log";
import { getChatModel } from "@/lib/rag";

export async function canRunOwnerGeneration(businessId: string) {
  const caps = dailyReplyCapsFromEnv();
  return dailyLimitVerdict(await incrementDailyCounters(businessId, caps), caps).allowed;
}

export async function generateOwnerDraft<T>(
  businessId: string,
  feature: "faq_draft" | "website_suggestions",
  schema: z.ZodType<T>,
  system: string,
  input: unknown,
): Promise<T> {
  const model = getChatModel(0).withStructuredOutput(schema, { name: feature, includeRaw: true });
  const result = await withGeminiUsageLog(
    { feature, trigger: "dashboard", model: process.env.GEMINI_CHAT_MODEL!, businessId },
    async () => {
      try {
        return await model.invoke([["system", system], ["human", JSON.stringify(input)]], { signal: AbortSignal.timeout(20_000) });
      } catch {
        throw new Error("Gemini owner generation failed");
      }
    },
    ({ raw }) => {
      const usage = isAIMessage(raw) ? raw.usage_metadata : undefined;
      return {
        promptTokens: usage?.input_tokens,
        candidatesTokens: usage?.output_tokens,
        thoughtsTokens: usage?.output_token_details?.reasoning,
        cachedContentTokens: usage?.input_token_details?.cache_read,
        totalTokens: usage?.total_tokens,
      };
    },
  );
  return schema.parse(result.parsed);
}
