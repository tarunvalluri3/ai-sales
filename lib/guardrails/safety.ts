import { HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import type { ChatGoogleGenerativeAI } from "@langchain/google-genai";

/**
 * Gemini safety settings, defined once for every chat-model call in the app
 * (lib/rag.ts getChatModel() is the only consumer). Guardrails Phase 2.
 *
 * Why explicit rather than the API default: the default threshold differs by
 * model generation and can change under us; this is a public, unauthenticated
 * chat surface, so the floor should be stated in code and reviewable.
 *
 * Why BLOCK_ONLY_HIGH and not MEDIUM: a prospect who swears at the bot (see
 * the abuse cases in the Phase 0 red-team) must still get the normal polite
 * de-escalation reply and a handover, not a provider-side refusal that
 * surfaces as an error. ONLY_HIGH still blocks the clearly harmful end of
 * every category. Civic integrity is left at the provider default: it is not
 * relevant to a sales conversation and is not a category every model accepts.
 */
export const GEMINI_SAFETY_SETTINGS: NonNullable<ConstructorParameters<typeof ChatGoogleGenerativeAI>[0]>["safetySettings"] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];
