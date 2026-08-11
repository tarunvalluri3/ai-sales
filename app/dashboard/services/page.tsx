import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { listServicesForBusiness } from "@/lib/services";
import { DeleteButton } from "../_components/delete-button";
import { ServiceForm } from "./service-form";
import { createServiceAction, deleteServiceAction } from "./actions";

export default async function ServicesPage() {
  const { businessId } = await requireBusinessContext();
  const services = await listServicesForBusiness(businessId);

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Services</h1>

      <ul className="flex flex-col gap-3">
        {services.length === 0 ? (
          <li className="text-sm text-zinc-600">No services yet.</li>
        ) : null}
        {services.map((service) => (
          <li
            key={service.id}
            className="flex items-center justify-between gap-4 rounded-md border border-zinc-200 px-4 py-3"
          >
            <div>
              <p className="font-medium text-zinc-900">{service.name}</p>
              {service.description ? (
                <p className="text-sm text-zinc-600">{service.description}</p>
              ) : null}
              {service.price ? (
                <p className="text-sm text-zinc-600">${service.price}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-4">
              <Link
                href={`/dashboard/services/${service.id}/edit`}
                className="text-sm font-medium text-zinc-900 underline"
              >
                Edit
              </Link>
              <DeleteButton action={deleteServiceAction} id={service.id} />
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Add a service</h2>
        <ServiceForm
          action={createServiceAction}
          submitLabel="Add service"
          pendingLabel="Adding…"
        />
      </div>
    </div>
  );
}
