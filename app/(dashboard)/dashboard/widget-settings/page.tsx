import { requireBusinessContext } from "@/lib/business-context";
import { getBusinessForOrg } from "@/lib/business";
import { WidgetOriginForm } from "./widget-origin-form";

export default async function WidgetSettingsPage() {
  const { orgId } = await requireBusinessContext();
  const business = await getBusinessForOrg(orgId);

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Chat widget settings</h1>
        <p className="text-sm text-zinc-600">
          Internal tool for configuring the Phase 11 public chat widget. Not the widget embed
          itself (Phase 12).
        </p>
      </div>

      <div className="flex max-w-sm flex-col gap-2">
        <span className="text-sm font-medium text-zinc-900">Widget key</span>
        <code className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900">
          {business?.widget_key}
        </code>
        <p className="text-xs text-zinc-600">
          This key is safe to embed in a client-side script -- it authorizes nothing on its own.
          The allowed origin below is what prevents it being replayed elsewhere.
        </p>
      </div>

      <WidgetOriginForm currentOrigin={business?.widget_allowed_origin ?? null} />
    </div>
  );
}
