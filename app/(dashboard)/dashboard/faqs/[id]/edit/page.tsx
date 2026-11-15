import { notFound } from "next/navigation";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getFaq } from "@/lib/faqs";
import { FaqForm } from "../../faq-form";
import { updateFaqAction } from "../../actions";
import { PermissionNotice } from "../../../_components/state-views";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "../../../_components/ui";

export default async function EditFaqPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { businessId, orgRole } = await requireBusinessContext();
  const faq = await getFaq(businessId, id);

  if (!faq) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Link
        href="/dashboard/faqs"
        className="inline-flex w-fit items-center gap-2 rounded-md text-base text-ds-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        <ArrowLeft strokeWidth={1.75} className="size-4" aria-hidden="true" />
        FAQs
      </Link>
      <PageHeader title="Edit FAQ" />
      <Card className="flex w-full max-w-xl flex-col gap-4">
        {hasMinRole(orgRole, "org:member") ? (
          <FaqForm
            action={updateFaqAction}
            id={faq.id}
            initialQuestion={faq.question}
            initialAnswer={faq.answer}
            submitLabel="Save changes"
            pendingLabel="Saving…"
          />
        ) : (
          <PermissionNotice />
        )}
      </Card>
    </div>
  );
}
