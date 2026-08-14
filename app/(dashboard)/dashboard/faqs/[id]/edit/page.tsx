import { notFound } from "next/navigation";
import { requireBusinessContext } from "@/lib/business-context";
import { getFaq } from "@/lib/faqs";
import { FaqForm } from "../../faq-form";
import { updateFaqAction } from "../../actions";

export default async function EditFaqPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { businessId } = await requireBusinessContext();
  const faq = await getFaq(businessId, id);

  if (!faq) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <h1 className="text-2xl font-semibold text-ds-text-primary">Edit FAQ</h1>
      <section className="flex w-full max-w-sm flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <FaqForm
          action={updateFaqAction}
          id={faq.id}
          initialQuestion={faq.question}
          initialAnswer={faq.answer}
          submitLabel="Save changes"
          pendingLabel="Saving…"
        />
      </section>
    </div>
  );
}
