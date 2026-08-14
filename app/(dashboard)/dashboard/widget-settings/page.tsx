import { requireBusinessContext } from "@/lib/business-context";
import { getBusinessForOrg } from "@/lib/business";
import { WidgetOriginForm } from "./widget-origin-form";
import { CopyKeyButton } from "./copy-key-button";

export default async function WidgetSettingsPage() {
  const { orgId } = await requireBusinessContext();
  const business = await getBusinessForOrg(orgId);
  const widgetKey = business?.widget_key ?? "";

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Chat widget</h1>
        <p className="max-w-2xl text-sm text-ds-text-secondary">
          Your AI sales employee talks to prospects through a small chat panel embedded on your
          website. These two settings control who that panel is allowed to talk to: the key
          identifies your business, and the allowed origin is the one website it may be embedded
          on.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium text-ds-text-primary">Widget key</h2>
            <p className="text-xs text-ds-text-secondary">
              Identifies your business to the chat widget script. Safe to paste into client-side
              code — on its own it authorizes nothing. The allowed origin, set alongside it, is
              what actually prevents it being replayed from anywhere else.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-ds-md border border-ds-border bg-ds-surface-elevated px-3 py-2.5 font-mono text-sm text-ds-text-primary">
              {widgetKey || "—"}
            </code>
            <CopyKeyButton value={widgetKey} />
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium text-ds-text-primary">Allowed origin</h2>
            <p className="text-xs text-ds-text-secondary">
              The exact site your widget is embedded on, e.g.{" "}
              <span className="text-ds-text-primary">https://example.com</span>. Until this is
              set, the widget key above rejects every request — nothing can talk to your AI
              sales employee yet.
            </p>
          </div>
          <WidgetOriginForm currentOrigin={business?.widget_allowed_origin ?? null} />
        </section>
      </div>
    </div>
  );
}
