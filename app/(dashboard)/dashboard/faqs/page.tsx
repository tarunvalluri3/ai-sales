import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listFaqsForBusiness, listPendingReviewFaqs } from "@/lib/faqs";
import { getKnowledgeDocumentTitles } from "@/lib/knowledge";
import { ReviewActions } from "../_components/review-actions";
import { FaqForm } from "./faq-form";
import { FaqsList } from "./faqs-list";
import { createFaqAction, deleteFaqAction, approveFaqAction, rejectFaqAction } from "./actions";
import { EmptyState, PermissionNotice } from "../_components/state-views";

export default async function FaqsPage() {
  const { businessId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:member");
  const [faqs, pendingFaqs] = await Promise.all([
    listFaqsForBusiness(businessId),
    listPendingReviewFaqs(businessId),
  ]);
  const sourceDocumentIds = pendingFaqs
    .map((faq) => faq.extracted_from_document_id)
    .filter((id): id is string => id !== null);
  const documentTitleById = await getKnowledgeDocumentTitles(businessId, sourceDocumentIds);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">FAQs</h1>
        <p className="text-sm text-ds-text-secondary">
          Questions your AI sales employee has an approved answer for.
        </p>
      </div>

      {pendingFaqs.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-ds-text-primary">Pending review</h2>
          <ul className="flex flex-col gap-3">
            {pendingFaqs.map((faq) => (
              <li
                key={faq.id}
                className="flex items-center justify-between gap-4 rounded-ds-lg border border-ds-warning/40 bg-ds-warning-bg px-4 py-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="truncate font-medium text-ds-text-primary">{faq.question}</p>
                  <p className="line-clamp-2 text-sm text-ds-text-secondary">{faq.answer}</p>
                  <p className="text-xs text-ds-text-muted">
                    Extracted from: {faq.extracted_from_document_id
                      ? (documentTitleById.get(faq.extracted_from_document_id) ?? "a deleted document")
                      : "unknown source"}
                  </p>
                </div>
                <ReviewActions
                  approveAction={approveFaqAction}
                  rejectAction={rejectFaqAction}
                  id={faq.id}
                  canEdit={canEdit}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {faqs.length === 0 ? (
        <EmptyState
          title="No FAQs yet"
          description="Add your first FAQ below so your AI sales employee can answer it directly."
        />
      ) : (
        <FaqsList faqs={faqs} canEdit={canEdit} deleteFaqAction={deleteFaqAction} />
      )}

      <section className="flex w-full max-w-sm flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <h2 className="text-sm font-medium text-ds-text-primary">Add an FAQ</h2>
        {canEdit ? (
          <FaqForm action={createFaqAction} submitLabel="Add FAQ" pendingLabel="Adding…" />
        ) : (
          <PermissionNotice />
        )}
      </section>
    </div>
  );
}
