import { z } from "zod";

/**
 * The true validation boundary for a lead payload (docs/security.md §7 --
 * AI structured outputs need the same validation discipline as any other
 * external input). Distinct from lib/lead-extraction.ts's loose
 * LeadExtractionSchema, which only shapes what the model returns --
 * contact fields there are unvalidated strings, normalized against this
 * schema's stricter rules before anything is persisted.
 */

const emailSchema = z.string().trim().email();
const phoneSchema = z.string().trim().regex(/^[+()\-.\s\d]{7,20}$/);

/** Returns a validated email, or null if the input isn't a well-formed email (never throws). */
export function normalizeEmail(value: string | null): string | null {
  if (value === null) return null;
  const parsed = emailSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Returns a validated phone number, or null if the input doesn't look like one (never throws). */
export function normalizePhone(value: string | null): string | null {
  if (value === null) return null;
  const parsed = phoneSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const leadInterestTypeSchema = z.enum(["product", "service", "general"]).nullable();
export const leadQualificationSchema = z.enum(["hot", "warm", "cold"]);

export const leadPersistSchema = z
  .object({
    contactName: z.string().trim().min(1).max(200).nullable(),
    contactEmail: emailSchema.nullable(),
    contactPhone: phoneSchema.nullable(),
    interestType: leadInterestTypeSchema,
    interestId: z.string().uuid().nullable(),
    notes: z.string().trim().max(2000).nullable(),
    qualification: leadQualificationSchema,
    qualificationReason: z.string().trim().min(1).max(500),
    source: z.string().trim().max(200).nullable(),
  })
  .refine((data) => data.contactEmail !== null || data.contactPhone !== null, {
    message: "A lead requires at least a contact email or phone number.",
  });

export type LeadPersistInput = z.infer<typeof leadPersistSchema>;
