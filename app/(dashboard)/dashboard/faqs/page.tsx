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
    <div className="flex flex-1 flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold text-zinc-900">FAQs</h1>

      <ul className="flex flex-col gap-3">
        {faqs.length === 0 ? (
          <li className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-6 text-center text-sm text-zinc-600">
            No FAQs yet.
          </li>
        ) : null}
        {faqs.map((faq) => (
          <li
            key={faq.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-dashboard-primary"
          >
            <div>
              <p className="font-medium text-zinc-900">{faq.question}</p>
              <p className="text-sm text-zinc-600">{faq.answer}</p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href={`/dashboard/faqs/${faq.id}/edit`}
                className="text-sm font-medium text-dashboard-primary hover:text-dashboard-primary-hover"
              >
                Edit
              </Link>
              <DeleteButton action={deleteFaqAction} id={faq.id} />
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Add an FAQ</h2>
        <FaqForm action={createFaqAction} submitLabel="Add FAQ" pendingLabel="Adding…" />
      </div>
    </div>
  );
}
