import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getService } from "@/lib/services";
import { ServiceForm } from "../../service-form";
import { updateServiceAction } from "../../actions";
import { PermissionNotice } from "../../../_components/state-views";
import { Card, PageHeader } from "../../../_components/ui";

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { businessId, orgRole } = await requireBusinessContext();
  const service = await getService(businessId, id);

  if (!service) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Link
        href="/dashboard/services"
        className="inline-flex w-fit items-center gap-2 rounded-md text-base text-ds-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        <ArrowLeft strokeWidth={1.75} className="size-4" aria-hidden="true" />
        Services
      </Link>
      <PageHeader title="Edit service" description={service.name} />
      <Card className="flex w-full max-w-xl flex-col gap-4">
        {hasMinRole(orgRole, "org:member") ? (
          <ServiceForm
            action={updateServiceAction}
            id={service.id}
            initialName={service.name}
            initialDescription={service.description ?? ""}
            initialPrice={service.price ?? ""}
            initialImageUrl={service.image_url ?? ""}
            initialCategory={service.category ?? ""}
            initialPriceAmount={service.price_amount != null ? String(service.price_amount) : ""}
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
