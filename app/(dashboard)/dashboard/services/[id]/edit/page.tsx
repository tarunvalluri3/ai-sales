import { notFound } from "next/navigation";
import { requireBusinessContext } from "@/lib/business-context";
import { getService } from "@/lib/services";
import { ServiceForm } from "../../service-form";
import { updateServiceAction } from "../../actions";

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { businessId } = await requireBusinessContext();
  const service = await getService(businessId, id);

  if (!service) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <h1 className="text-2xl font-semibold text-ds-text-primary">Edit service</h1>
      <section className="flex w-full max-w-sm flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
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
      </section>
    </div>
  );
}
