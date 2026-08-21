import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { listLeadsForBusiness } from "@/lib/leads";
import { StatusSelect } from "./status-select";
import type { LeadQualification } from "@/lib/supabase/types";
import { EmptyState } from "../_components/state-views";

const QUALIFICATION_STYLE: Record<LeadQualification, string> = {
  hot: "bg-ds-accent-soft-bg text-ds-accent-muted",
  warm: "bg-ds-success-bg text-ds-success",
  cold: "bg-ds-surface-soft text-ds-text-muted",
};

export default async function LeadsPage() {
  const { businessId } = await requireBusinessContext();
  const leads = await listLeadsForBusiness(businessId);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Leads</h1>
        <p className="text-sm text-ds-text-secondary">
          {leads.length} lead{leads.length === 1 ? "" : "s"} total · qualification is an AI-generated
          signal, not verified truth -- always confirm from the conversation itself
        </p>
      </div>

      {leads.length === 0 ? (
        <EmptyState
          title="No leads yet"
          description="When a prospect shares contact details, the AI captures them here for follow-up."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {leads.map((lead) => (
            <li
              key={lead.id}
              className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-4 transition-colors hover:border-ds-border-strong"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-ds-text-primary">
                    {lead.contact_name ?? "Unnamed prospect"}
                  </p>
                  <span
                    title="AI-assessed signal -- not verified"
                    className={`rounded-ds-sm px-2 py-0.5 text-2xs font-semibold tracking-wide-ds uppercase ${QUALIFICATION_STYLE[lead.qualification]}`}
                  >
                    {lead.qualification}
                  </span>
                </div>
                <StatusSelect id={lead.id} status={lead.status} />
              </div>
              <p className="text-sm text-ds-text-secondary">
                {lead.contact_email ?? "—"} · {lead.contact_phone ?? "—"}
              </p>
              <p className="text-sm text-ds-text-secondary">
                Interest: {lead.interest_type ?? "—"}
                {lead.interest_id ? ` (matched: ${lead.interest_id})` : ""}
              </p>
              <p className="text-sm text-ds-text-muted">{lead.qualification_reason}</p>
              {lead.notes ? <p className="text-sm text-ds-text-secondary">Notes: {lead.notes}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ds-border pt-3">
                <p className="text-xs text-ds-text-muted">Source: {lead.source ?? "—"}</p>
                <Link
                  href={`/dashboard/conversations/${lead.conversation_id}`}
                  className="text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                >
                  View conversation
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
