import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { listServicesForBusiness, listPendingReviewServices } from "@/lib/services";
import { getKnowledgeDocumentTitles } from "@/lib/knowledge";
import { DeleteButton } from "../_components/delete-button";
import { ReviewActions } from "../_components/review-actions";
import { ServiceForm } from "./service-form";
import { createServiceAction, deleteServiceAction, approveServiceAction, rejectServiceAction } from "./actions";
import { EmptyState } from "../_components/state-views";

export default async function ServicesPage() {
  const { businessId } = await requireBusinessContext();
  const [services, pendingServices] = await Promise.all([
    listServicesForBusiness(businessId),
    listPendingReviewServices(businessId),
  ]);
  const sourceDocumentIds = pendingServices
    .map((service) => service.extracted_from_document_id)
    .filter((id): id is string => id !== null);
  const documentTitleById = await getKnowledgeDocumentTitles(businessId, sourceDocumentIds);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Services</h1>
        <p className="text-sm text-ds-text-secondary">
          What your AI sales employee can tell prospects you offer.
        </p>
      </div>

      {pendingServices.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-ds-text-primary">Pending review</h2>
          <ul className="flex flex-col gap-3">
            {pendingServices.map((service) => (
              <li
                key={service.id}
                className="flex items-center justify-between gap-4 rounded-ds-lg border border-ds-warning/40 bg-ds-warning-bg px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {service.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- catalog photo extracted from an uploaded PDF or hand-entered URL
                    <img
                      src={service.image_url}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-ds-sm object-cover"
                    />
                  ) : null}
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="truncate font-medium text-ds-text-primary">{service.name}</p>
                    {service.description ? (
                      <p className="line-clamp-2 text-sm text-ds-text-secondary">{service.description}</p>
                    ) : null}
                    <p className="text-xs text-ds-text-muted">
                      Extracted from: {service.extracted_from_document_id
                        ? (documentTitleById.get(service.extracted_from_document_id) ?? "a deleted document")
                        : "unknown source"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {service.price ? (
                    <span className="text-sm font-semibold text-ds-accent">${service.price}</span>
                  ) : null}
                  <ReviewActions approveAction={approveServiceAction} rejectAction={rejectServiceAction} id={service.id} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {services.length === 0 ? (
        <EmptyState
          title="No services yet"
          description="Add your first service below so your AI sales employee can answer questions about it."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {services.map((service) => (
            <li
              key={service.id}
              className="group flex items-center justify-between gap-4 rounded-ds-lg border border-ds-border bg-ds-surface px-4 py-3 transition-colors hover:border-ds-border-strong hover:bg-ds-surface-elevated focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ds-accent"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="truncate font-medium text-ds-text-primary">{service.name}</p>
                {service.description ? (
                  <p className="line-clamp-2 text-sm text-ds-text-secondary">
                    {service.description}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-4">
                {service.price ? (
                  <span className="text-sm font-semibold text-ds-accent">${service.price}</span>
                ) : null}
                <Link
                  href={`/dashboard/services/${service.id}/edit`}
                  className="text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                >
                  Edit
                </Link>
                <DeleteButton action={deleteServiceAction} id={service.id} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="flex w-full max-w-sm flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <h2 className="text-sm font-medium text-ds-text-primary">Add a service</h2>
        <ServiceForm action={createServiceAction} submitLabel="Add service" pendingLabel="Adding…" />
      </section>
    </div>
  );
}
