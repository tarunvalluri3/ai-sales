import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listWebhookEndpointsForBusiness } from "@/lib/webhooks";
import { CreateWebhookForm } from "./create-webhook-form";
import { WebhookEndpointList } from "./webhook-endpoint-list";
import { PermissionNotice } from "../_components/state-views";
import { Info, ShieldCheck, Trash2, Webhook } from "lucide-react";
import { Card, PageHeader, StepBubble } from "../_components/ui";

export default async function WebhooksPage() {
  const { businessId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:admin");
  const endpoints = await listWebhookEndpointsForBusiness(businessId);

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader icon={Webhook} title="Webhooks" description="Notify your external systems when a new qualified lead arrives." />

      <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {canEdit ? (
          <CreateWebhookForm />
        ) : (
          <Card className="flex flex-col gap-4">
            <h2 className="dx-title">Add an endpoint</h2>
            <PermissionNotice />
          </Card>
        )}

        <Card className="flex flex-col gap-3">
          <div className="flex items-start gap-4">
            <ShieldCheck className="mt-1 size-9 shrink-0 text-ds-text-primary" strokeWidth={1.5} aria-hidden="true" />
            <div className="flex flex-col gap-0.5">
              <h2 className="dx-title">Verify incoming requests</h2>
              <p className="dx-subtitle">Requests are signed with HMAC-SHA256. Verify the signature before trusting the payload.</p>
            </div>
          </div>
          <ol className="dx-rows flex flex-col">
            <li className="flex items-center gap-4 py-2.5 text-sm text-ds-text-primary">
              <StepBubble>1</StepBubble>
              <span>
                Receive the signed <code className="rounded-md bg-ds-surface-soft px-1.5 py-0.5 font-mono text-sm">POST</code> request
              </span>
            </li>
            <li className="flex items-center gap-4 py-2.5 text-sm text-ds-text-primary">
              <StepBubble>2</StepBubble>
              <span>
                Read <code className="rounded-md bg-ds-surface-soft px-1.5 py-0.5 font-mono text-sm">X-Webhook-Signature</code>
              </span>
            </li>
            <li className="flex items-center gap-4 py-2.5 text-sm text-ds-text-primary">
              <StepBubble>3</StepBubble>
              <span>Verify it (HMAC-SHA256 of the raw body) with this endpoint&rsquo;s secret</span>
            </li>
          </ol>
          <div className="flex items-start gap-4 rounded-2xl bg-ds-surface-soft px-4 py-3">
            <Info className="mt-0.5 size-5 shrink-0 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" />
            <div className="flex flex-col">
              <p className="text-sm font-medium text-ds-text-primary">Keep signing secrets private.</p>
              <p className="text-sm text-ds-text-primary">Use them on your server when validating webhook requests.</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="dx-title">Your endpoints</h2>
          <p className="dx-subtitle text-base">
            {endpoints.length} endpoint{endpoints.length === 1 ? "" : "s"}
          </p>
        </div>
        <WebhookEndpointList endpoints={endpoints} canEdit={canEdit} />
        <p className="flex items-center gap-3 text-sm text-ds-text-secondary">
          <Info className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Each endpoint has its own signing secret.
        </p>
      </Card>

      <p className="dx-card flex items-center gap-4 px-5 py-4 text-sm text-ds-text-primary">
        <Trash2 className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Deleting an endpoint removes it from your configured destinations.
      </p>
    </div>
  );
}
