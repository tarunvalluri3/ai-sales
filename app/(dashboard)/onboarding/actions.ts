"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth";
import {
  createBusinessForOrg,
  BusinessAlreadyExistsError,
} from "@/lib/business";
import {
  businessNameSchema,
  businessTypeSchema,
  businessDescriptionSchema,
  businessContactEmailSchema,
  businessContactPhoneSchema,
  businessWebsiteSchema,
} from "@/lib/schemas/business";
import { logAndGetUserMessage } from "@/lib/errors";

const createBusinessSchema = z.object({
  name: businessNameSchema,
  businessType: businessTypeSchema,
  description: businessDescriptionSchema,
  contactEmail: businessContactEmailSchema,
  contactPhone: businessContactPhoneSchema,
  website: businessWebsiteSchema,
  timezone: z.string().trim().min(1),
});

export type CreateBusinessFieldErrors = Partial<
  Record<"name" | "businessType" | "description" | "contactEmail" | "contactPhone" | "website" | "timezone", string>
>;

export type CreateBusinessState = {
  error?: string;
  fieldErrors?: CreateBusinessFieldErrors;
};

export async function createBusiness(
  _prevState: CreateBusinessState,
  formData: FormData,
): Promise<CreateBusinessState> {
  const context = await requireAuthContext({ role: "org:admin" });

  if (!context.orgId) {
    return { error: "Select or create an organization first." };
  }

  const timezoneRaw = formData.get("timezone");
  const timezone = typeof timezoneRaw === "string" && timezoneRaw.trim() !== "" ? timezoneRaw.trim() : "UTC";
  try {
    // Throws for anything that isn't a real IANA timezone name.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return { error: "Please choose a valid timezone." };
  }

  const parsed = createBusinessSchema.safeParse({
    name: formData.get("name"),
    businessType: formData.get("businessType"),
    description: formData.get("description"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
    website: formData.get("website"),
    timezone,
  });
  if (!parsed.success) {
    // Surface every invalid field at once (not just the first) so a
    // multi-step wizard doesn't send the admin back and forth one field
    // at a time -- matches profile/actions.ts's existing pattern.
    const fieldErrors: CreateBusinessFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !(field in fieldErrors)) {
        fieldErrors[field as keyof CreateBusinessFieldErrors] = issue.message;
      }
    }
    return { error: "Fix the highlighted fields below.", fieldErrors };
  }

  let createFailed = false;
  let errorMessage = "";

  try {
    await createBusinessForOrg(context.orgId, parsed.data);
  } catch (error) {
    if (!(error instanceof BusinessAlreadyExistsError)) {
      createFailed = true;
      errorMessage = logAndGetUserMessage(error);
    }
  }

  if (createFailed) {
    return { error: errorMessage };
  }

  redirect("/onboarding/test");
}
