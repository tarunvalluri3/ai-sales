import type { LeadStatus } from "@/lib/supabase/types";

/**
 * Single source of truth for the lead status vocabulary -- previously
 * duplicated as near-identical `STATUSES`/`STATUS_TABS` arrays and two
 * copies of the same `STATUS_LABEL` map across status-select.tsx and
 * leads-list.tsx (/impeccable polish: the two copies had no way to stay
 * in sync if one ever changed).
 */
export const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "converted", "lost"];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  converted: "Converted",
  lost: "Lost",
};
