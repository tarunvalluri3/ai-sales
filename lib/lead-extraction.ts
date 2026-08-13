import "server-only";
import { z } from "zod";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { getChatModel, type ConversationMessage } from "@/lib/rag";
import { AppError } from "@/lib/errors";

/**
 * Loose, AI-facing shape -- contact fields are unvalidated free text here.
 * lib/schemas/lead.ts's leadPersistSchema is the actual validation
 * boundary (docs/security.md §7); a field that fails that stricter check
 * is normalized to null rather than rejecting the whole extraction.
 */
const LeadExtractionSchema = z.object({
  contactName: z.string().nullable().describe("The prospect's name, only if they volunteered it. Never invented."),
  contactEmail: z.string().nullable().describe("The prospect's email, only if they volunteered it. Never invented."),
  contactPhone: z.string().nullable().describe("The prospect's phone number, only if they volunteered it. Never invented."),
  interestType: z
    .enum(["product", "service", "general"])
    .nullable()
    .describe("What kind of thing the prospect was interested in, based on the conversation. Null if unclear."),
  interestName: z
    .string()
    .nullable()
    .describe("The name of the specific product or service the prospect mentioned, in their own words. Null if none was mentioned."),
  notes: z.string().nullable().describe("A short free-text summary of what was discussed."),
  qualification: z
    .enum(["hot", "warm", "cold"])
    .describe("How likely this prospect is to convert, based only on genuine buying-intent signals in the conversation."),
  qualificationReason: z.string().describe("A short, honest reason for the qualification level."),
});

export type LeadExtractionResult = z.infer<typeof LeadExtractionSchema>;

const SYSTEM_TEMPLATE = `You are extracting lead information from a sales conversation transcript for {businessName}, for the business's own internal records.

Extract only what the prospect actually said. Never invent a name, email, phone number, or interest that wasn't mentioned in the transcript -- if the prospect didn't volunteer contact information, leave those fields null.

Always provide a qualification (hot, warm, or cold) and a short, honest reason for it, based only on genuine buying-intent signals actually present in the conversation -- not on politeness or the length of the conversation alone.`;

function buildPrompt(): ChatPromptTemplate {
  return ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_TEMPLATE],
    new MessagesPlaceholder("transcript"),
  ]);
}

function toLangchainTranscript(transcript: ConversationMessage[]): ["human" | "ai", string][] {
  return transcript.map((message) => [message.role === "user" ? "human" : "ai", message.content]);
}

/**
 * Extracts lead information from a conversation transcript via structured
 * output, same pattern as lib/rag.ts's askSalesEmployee(). Returns the
 * model's loose, unvalidated view of the conversation -- the caller
 * (lib/lead-capture.ts) is responsible for normalizing contact fields and
 * resolving interest_id before anything is persisted.
 */
export async function extractLead(
  businessName: string,
  transcript: ConversationMessage[],
): Promise<LeadExtractionResult> {
  try {
    const prompt = await buildPrompt().invoke({
      businessName,
      transcript: toLangchainTranscript(transcript),
    });
    const model = getChatModel().withStructuredOutput(LeadExtractionSchema, {
      name: "LeadExtraction",
    });
    return await model.invoke(prompt);
  } catch (error) {
    throw new AppError(
      "Something went wrong extracting lead information from this conversation. Please try again.",
      "extractLead failed",
      error,
    );
  }
}
