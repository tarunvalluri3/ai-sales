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
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Edit service</h1>
      <ServiceForm
        action={updateServiceAction}
        id={service.id}
        initialName={service.name}
        initialDescription={service.description ?? ""}
        initialPrice={service.price ?? ""}
        submitLabel="Save changes"
        pendingLabel="Saving…"
      />
    </div>
  );
}
