import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { listFaqsForBusiness } from "@/lib/faqs";
import { DeleteButton } from "../_components/delete-button";
import { FaqForm } from "./faq-form";
import { createFaqAction, deleteFaqAction } from "./actions";

export default async function FaqsPage() {
  const { businessId } = await requireBusinessContext();
  const faqs = await listFaqsForBusiness(businessId);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">FAQs</h1>
        <p className="text-sm text-ds-text-secondary">
          Questions your AI sales employee has an approved answer for.
        </p>
      </div>

      {faqs.length === 0 ? (
        <div className="rounded-ds-lg border border-dashed border-ds-border bg-ds-surface px-6 py-10 text-center">
          <p className="text-sm font-medium text-ds-text-primary">No FAQs yet</p>
          <p className="mt-1 text-sm text-ds-text-secondary">
            Add your first FAQ below so your AI sales employee can answer it directly.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {faqs.map((faq) => (
            <li
              key={faq.id}
              className="group flex items-center justify-between gap-4 rounded-ds-lg border border-ds-border bg-ds-surface px-4 py-3 transition-colors hover:border-ds-border-strong hover:bg-ds-surface-elevated focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ds-accent"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="truncate font-medium text-ds-text-primary">{faq.question}</p>
                <p className="line-clamp-2 text-sm text-ds-text-secondary">{faq.answer}</p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <Link
                  href={`/dashboard/faqs/${faq.id}/edit`}
                  className="text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                >
                  Edit
                </Link>
                <DeleteButton action={deleteFaqAction} id={faq.id} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="flex w-full max-w-sm flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <h2 className="text-sm font-medium text-ds-text-primary">Add an FAQ</h2>
        <FaqForm action={createFaqAction} submitLabel="Add FAQ" pendingLabel="Adding…" />
      </section>
    </div>
  );
}
