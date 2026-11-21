import { z } from "zod";

const itemBase = { id: z.uuid(), lockedAt: z.number().optional() };
export const websiteSuggestionSchema = z.discriminatedUnion("kind", [
  z.object({ ...itemBase, kind: z.literal("faq"), question: z.string().min(1).max(300), answer: z.string().min(1).max(2000) }),
  z.object({ ...itemBase, kind: z.enum(["product", "service"]), name: z.string().min(1).max(120),
    description: z.string().max(2000), price: z.string().max(60) }),
]);
export type WebsiteSuggestion = z.infer<typeof websiteSuggestionSchema>;

export const websiteSuggestionStateSchema = z.object({
  business_id: z.uuid(),
  document_id: z.uuid(),
  generation_status: z.enum(["idle", "running", "failed", "ready"]),
  attempts: z.number().int().min(0).max(2),
  revision: z.number().int().min(0),
  updated_at: z.iso.datetime({ offset: true }),
  suggestions: z.array(websiteSuggestionSchema).max(12),
});

export type WebsiteSuggestionState = z.infer<typeof websiteSuggestionStateSchema>;
