import { Tag } from "lucide-react";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listServicesForBusiness, listPendingReviewServices } from "@/lib/services";
import { getKnowledgeDocumentTitles } from "@/lib/knowledge";
import { ReviewActions } from "../_components/review-actions";
import { ServiceForm } from "./service-form";
import { formatCatalogPrice } from "@/lib/currency";
import { ServicesList } from "./services-list";
import { createServiceAction, deleteServiceAction, approveServiceAction, rejectServiceAction } from "./actions";
import { PermissionNotice } from "../_components/state-views";
import { Card, PageHeader, Pill } from "../_components/ui";

export default async function ServicesPage() {
  const { businessId, orgRole, currency } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:member");
  const [services, pendingServices] = await Promise.all([
    listServicesForBusiness(businessId),
    listPendingReviewServices(businessId),
  ]);
  const sourceDocumentIds = pendingServices
    .map((service) => service.extracted_from_document_id)
    .filter((id): id is string => id !== null);
  const documentTitleById = await getKnowledgeDocumentTitles(businessId, sourceDocumentIds);

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader icon={Tag} title="Services" description="What your AI sales employee can tell prospects you offer." />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {pendingServices.length > 0 ? (
            <Card className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="dx-title">Review extracted services</h2>
                  <Pill tone="amber">{pendingServices.length} pending</Pill>
                </div>
                <p className="dx-subtitle">Found in your uploaded knowledge. Approve the ones your AI may recommend.</p>
              </div>
              <ul className="dx-rows flex flex-col">
                {pendingServices.map((service) => (
                  <li key={service.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 py-3.5">
                    {service.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- catalog photo extracted from an uploaded PDF or hand-entered URL
                      <img src={service.image_url} alt="" className="h-20 w-32 shrink-0 rounded-xl object-cover" />
                    ) : null}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="truncate text-base font-medium text-ds-text-primary">{service.name}</p>
                      {service.description ? (
                        <p className="line-clamp-2 text-sm text-ds-text-secondary">{service.description}</p>
                      ) : null}
                      <p className="text-sm text-ds-text-muted">
                        Extracted from:{" "}
                        {service.extracted_from_document_id
                          ? (documentTitleById.get(service.extracted_from_document_id) ?? "a deleted document")
                          : "unknown source"}
                      </p>
                    </div>
                    {service.price ? (
                      <span className="text-sm font-medium text-ds-text-primary">{formatCatalogPrice(service.price, currency)}</span>
                    ) : null}
                    <ReviewActions
                      approveAction={approveServiceAction}
                      rejectAction={rejectServiceAction}
                      id={service.id}
                      canEdit={canEdit}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="dx-title">Your services</h2>
              <p className="dx-subtitle">
                {services.length} service{services.length === 1 ? "" : "s"}
              </p>
            </div>
            {services.length === 0 ? (
              <p className="rounded-2xl bg-ds-surface-soft px-4 py-10 text-center text-sm text-ds-text-secondary">
                No services yet. Add your first service so your AI sales employee can answer questions about it.
              </p>
            ) : (
              <ServicesList services={services} currency={currency} canEdit={canEdit} deleteServiceAction={deleteServiceAction} />
            )}
            <p className="border-t border-ds-border pt-3 text-sm text-ds-text-secondary">
              Your services help the AI recommend the right solution.
            </p>
          </Card>
        </div>

        <Card className="flex flex-col gap-4 xl:sticky xl:top-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="dx-title">Add a service</h2>
            <p className="dx-subtitle">Describe what you offer and who it helps.</p>
          </div>
          {canEdit ? (
            <ServiceForm action={createServiceAction} currency={currency} submitLabel="Add service" pendingLabel="Adding…" />
          ) : (
            <PermissionNotice />
          )}
        </Card>
      </div>
    </div>
  );
}
