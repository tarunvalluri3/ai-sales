import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listFaqsForBusiness, listPendingReviewFaqs } from "@/lib/faqs";
import { getKnowledgeDocumentTitles } from "@/lib/knowledge";
import { ReviewActions } from "../_components/review-actions";
import { FaqForm } from "./faq-form";
import { FaqsList } from "./faqs-list";
import { createFaqAction, deleteFaqAction, approveFaqAction, rejectFaqAction } from "./actions";
import { PermissionNotice } from "../_components/state-views";
import { CircleHelp, Lightbulb } from "lucide-react";
import { Card, PageHeader, Pill } from "../_components/ui";

const ANSWER_TIPS = ["Specific details", "Relevant conditions", "A clear next step"];

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
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader icon={CircleHelp} title="FAQs" description="Questions your AI sales employee has an approved answer for." />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {pendingFaqs.length > 0 ? (
            <Card className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="dx-title">Review extracted FAQs</h2>
                  <Pill tone="amber">{pendingFaqs.length} pending</Pill>
                </div>
                <p className="dx-subtitle">Found in your uploaded knowledge. Approve the answers your AI may give.</p>
              </div>
              <ul className="dx-rows flex flex-col border-t border-ds-border">
                {pendingFaqs.map((faq) => (
                  <li key={faq.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 py-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-base font-medium text-ds-text-primary">{faq.question}</p>
                      <p className="line-clamp-3 text-sm leading-relaxed text-ds-text-primary">{faq.answer}</p>
                      <p className="text-sm text-ds-text-muted">
                        Extracted from:{" "}
                        {faq.extracted_from_document_id
                          ? (documentTitleById.get(faq.extracted_from_document_id) ?? "a deleted document")
                          : "unknown source"}
                      </p>
                    </div>
                    <ReviewActions approveAction={approveFaqAction} rejectAction={rejectFaqAction} id={faq.id} canEdit={canEdit} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="dx-title">Your FAQs</h2>
              <p className="dx-subtitle">
                {faqs.length} question{faqs.length === 1 ? "" : "s"}
              </p>
            </div>
            {faqs.length === 0 ? (
              <p className="rounded-2xl bg-ds-surface-soft px-4 py-10 text-center text-sm text-ds-text-secondary">
                No FAQs yet. Add your first FAQ so your AI sales employee can answer it directly.
              </p>
            ) : (
              <FaqsList faqs={faqs} canEdit={canEdit} deleteFaqAction={deleteFaqAction} />
            )}
            <p className="border-t border-ds-border pt-3 text-sm text-ds-text-secondary">
              Detailed answers help your AI respond with confidence.
            </p>
          </Card>
        </div>

        <Card className="flex flex-col gap-4 xl:sticky xl:top-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="dx-title">Add an FAQ</h2>
            <p className="dx-subtitle">Write an answer your AI can rely on.</p>
          </div>
          {canEdit ? (
            <FaqForm action={createFaqAction} submitLabel="Add FAQ" pendingLabel="Adding…" />
          ) : (
            <PermissionNotice />
          )}
          <div className="flex gap-4 rounded-2xl bg-ds-surface-soft p-4">
            <Lightbulb className="size-5 shrink-0 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" />
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-ds-text-primary">A helpful answer includes</p>
              <ul className="flex flex-col gap-1 text-sm text-ds-text-secondary">
                {ANSWER_TIPS.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
