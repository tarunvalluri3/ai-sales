import type { TagColor } from "@/lib/supabase/types";

/**
 * Matches the `lead_tags` migration's check constraint. Not server-only
 * (unlike `lib/lead-tags.ts`) -- both a Server Action's Zod validation
 * and a client-rendered color picker need this same list.
 */
export const TAG_COLORS = ["muted", "accent", "success", "warning", "danger"] as const satisfies readonly TagColor[];

export const TAG_COLOR_LABEL: Record<TagColor, string> = {
  muted: "Gray",
  accent: "Lime",
  success: "Green",
  warning: "Amber",
  danger: "Red",
};
