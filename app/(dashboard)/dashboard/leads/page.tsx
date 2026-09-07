import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listLeadsForBusiness } from "@/lib/leads";
import { listProductsByIds } from "@/lib/products";
import { listServicesByIds } from "@/lib/services";
import { StatusSelect } from "./status-select";
import type { LeadQualification } from "@/lib/supabase/types";
import { EmptyState } from "../_components/state-views";

const QUALIFICATION_STYLE: Record<LeadQualification, string> = {
  hot: "bg-ds-accent-soft-bg text-ds-accent-muted",
  warm: "bg-ds-success-bg text-ds-success",
  cold: "bg-ds-surface-soft text-ds-text-muted",
};

export default async function LeadsPage() {
  const { businessId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:sales_agent");
  const leads = await listLeadsForBusiness(businessId);

  // Resolved to real names rather than shown as raw ids -- a lead's
  // matched product/service can be edited or deleted after the lead was
  // created, so an id that no longer resolves honestly says "no longer
  // available" instead of guessing (/impeccable clarify, following the
  // same fix already made on the conversation detail page's lead card).
  const productIds: string[] = [];
  const serviceIds: string[] = [];
  for (const lead of leads) {
    if (!lead.interest_id) continue;
    if (lead.interest_type === "product") productIds.push(lead.interest_id);
    else if (lead.interest_type === "service") serviceIds.push(lead.interest_id);
  }
  const [interestProducts, interestServices] = await Promise.all([
    listProductsByIds(businessId, productIds),
    listServicesByIds(businessId, serviceIds),
  ]);
  const interestNameById = new Map<string, string>([
    ...interestProducts.map((product): [string, string] => [product.id, product.name]),
    ...interestServices.map((service): [string, string] => [service.id, service.name]),
  ]);

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
                <StatusSelect id={lead.id} status={lead.status} canEdit={canEdit} />
              </div>
              <p className="text-sm text-ds-text-secondary">
                {lead.contact_email ?? "—"} · {lead.contact_phone ?? "—"}
              </p>
              <p className="text-sm text-ds-text-secondary">
                Interest: {lead.interest_type ?? "—"}
                {lead.interest_id ? ` — ${interestNameById.get(lead.interest_id) ?? "no longer available"}` : ""}
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
