import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listWebhookEndpointsForBusiness } from "@/lib/webhooks";
import { CreateWebhookForm } from "./create-webhook-form";
import { WebhookEndpointList } from "./webhook-endpoint-list";
import { PermissionNotice } from "../_components/state-views";

export default async function WebhooksPage() {
  const { businessId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:admin");
  const endpoints = await listWebhookEndpointsForBusiness(businessId);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Webhooks</h1>
        <p className="max-w-2xl text-sm text-ds-text-secondary">
          Get notified the moment your AI sales employee qualifies a new lead. Each endpoint
          receives a signed <code className="font-mono text-ds-text-primary">POST</code> request
          with an <code className="font-mono text-ds-text-primary">X-Webhook-Signature</code>{" "}
          header (HMAC-SHA256 of the raw body, using the endpoint&rsquo;s own secret) — verify it
          before trusting the payload.
        </p>
      </div>

      {canEdit ? <CreateWebhookForm /> : <PermissionNotice />}

      <WebhookEndpointList endpoints={endpoints} canEdit={canEdit} />
    </div>
  );
}
