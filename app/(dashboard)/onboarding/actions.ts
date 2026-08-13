"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth";
import {
  createBusinessForOrg,
  BusinessAlreadyExistsError,
} from "@/lib/business";
import { logAndGetUserMessage } from "@/lib/errors";

const createBusinessSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export type CreateBusinessState = {
  error?: string;
};

export async function createBusiness(
  _prevState: CreateBusinessState,
  formData: FormData,
): Promise<CreateBusinessState> {
  const context = await requireAuthContext({ role: "org:admin" });

  if (!context.orgId) {
    return { error: "Select or create an organization first." };
  }

  const parsed = createBusinessSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: "Enter a valid business name (2–120 characters)." };
  }

  let createFailed = false;
  let errorMessage = "";

  try {
    await createBusinessForOrg(context.orgId, parsed.data.name);
  } catch (error) {
    if (!(error instanceof BusinessAlreadyExistsError)) {
      createFailed = true;
      errorMessage = logAndGetUserMessage(error);
    }
  }

  if (createFailed) {
    return { error: errorMessage };
  }

  redirect("/dashboard");
}
