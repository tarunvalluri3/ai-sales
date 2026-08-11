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
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Edit FAQ</h1>
      <FaqForm
        action={updateFaqAction}
        id={faq.id}
        initialQuestion={faq.question}
        initialAnswer={faq.answer}
        submitLabel="Save changes"
        pendingLabel="Saving…"
      />
    </div>
  );
}
