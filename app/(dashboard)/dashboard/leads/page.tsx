import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { listLeadsForBusiness } from "@/lib/leads";
import { StatusSelect } from "./status-select";

export default async function LeadsPage() {
  const { businessId } = await requireBusinessContext();
  const leads = await listLeadsForBusiness(businessId);

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Leads</h1>

      <ul className="flex flex-col gap-3">
        {leads.length === 0 ? (
          <li className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-6 text-center text-sm text-zinc-600">
            No leads yet.
          </li>
        ) : null}
        {leads.map((lead) => (
          <li
            key={lead.id}
            className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-dashboard-primary"
          >
            <div className="flex items-center justify-between gap-4">
              <p className="font-medium text-zinc-900">{lead.contact_name ?? "Unnamed prospect"}</p>
              <StatusSelect id={lead.id} status={lead.status} />
            </div>
            <p className="text-sm text-zinc-600">
              {lead.contact_email ?? "—"} · {lead.contact_phone ?? "—"}
            </p>
            <p className="text-sm text-zinc-600">
              Interest: {lead.interest_type ?? "—"}
              {lead.interest_id ? ` (matched: ${lead.interest_id})` : ""}
            </p>
            <p className="text-sm text-zinc-600">
              Qualification: {lead.qualification} — {lead.qualification_reason}
            </p>
            {lead.notes ? <p className="text-sm text-zinc-600">Notes: {lead.notes}</p> : null}
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-zinc-500">Source: {lead.source ?? "—"}</p>
              <Link
                href={`/dashboard/conversations/${lead.conversation_id}`}
                className="text-sm font-medium text-dashboard-primary hover:text-dashboard-primary-hover"
              >
                View conversation
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
