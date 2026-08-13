"use server";

import { z } from "zod";
import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logAndGetUserMessage, AppError } from "@/lib/errors";

const originSchema = z.string().trim().refine(
  (value) => {
    try {
      return new URL(value).origin === value;
    } catch {
      return false;
    }
  },
  { message: "Enter a canonical origin, e.g. https://example.com (no path, query, or trailing slash)." },
);

export type WidgetOriginState = {
  error?: string;
  success?: boolean;
};

export async function updateWidgetOrigin(
  _prevState: WidgetOriginState,
  formData: FormData,
): Promise<WidgetOriginState> {
  const { businessId } = await requireBusinessContext();

  const parsed = originSchema.safeParse(formData.get("origin"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid origin." };
  }

  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from("businesses")
      .update({ widget_allowed_origin: parsed.data })
      .eq("id", businessId);

    if (error) {
      throw new AppError(
        "Something went wrong saving this setting. Please try again.",
        "updateWidgetOrigin failed",
        error,
      );
    }
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  return { success: true };
}
