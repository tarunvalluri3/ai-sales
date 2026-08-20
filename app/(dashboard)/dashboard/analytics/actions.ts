"use server";

import { requireBusinessContext } from "@/lib/business-context";
import { listLeadsForBusiness } from "@/lib/leads";
import { toCsv } from "@/lib/csv";
import { logAndGetUserMessage } from "@/lib/errors";

export type ExportLeadsCsvState = {
  error?: string;
  csv?: string;
};

/**
 * Returns the business's leads as a CSV string (Phase 25b "funnel
 * analytics ... CSV export"). A Server Action rather than a route
 * handler, same convention and same reasoning as
 * app/(dashboard)/dashboard/profile/actions.ts's exportBusinessDataAction()
 * -- returns the payload to the caller for a client-side Blob download.
 * Every authenticated business member can export (read-only, no
 * org:admin gate, unlike the full JSON data export which is
 * admin-only/destructive-adjacent).
 */
export async function exportLeadsCsvAction(): Promise<ExportLeadsCsvState> {
  const { businessId } = await requireBusinessContext();

  try {
    const leads = await listLeadsForBusiness(businessId);
    const csv = toCsv(
      [
        "Created at",
        "Contact name",
        "Contact email",
        "Contact phone",
        "Qualification",
        "Qualification reason",
        "Status",
        "Interest type",
        "Requested callback",
        "Notes",
      ],
      leads.map((lead) => [
        lead.created_at,
        lead.contact_name,
        lead.contact_email,
        lead.contact_phone,
        lead.qualification,
        lead.qualification_reason,
        lead.status,
        lead.interest_type,
        lead.requested_callback,
        lead.notes,
      ]),
    );
    return { csv };
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
}
