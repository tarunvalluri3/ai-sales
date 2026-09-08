import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getWhatsappConnectionForBusiness } from "@/lib/whatsapp";
import { ConnectWhatsappForm, WHATSAPP_MANAGER_URL } from "./connect-whatsapp-form";
import { WhatsappConnectionStatus } from "./whatsapp-connection-status";
import { WhatsappSetupGuide } from "./whatsapp-setup-guide";
import { PermissionNotice } from "../_components/state-views";

export default async function WhatsappPage() {
  const { businessId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:admin");
  const connection = await getWhatsappConnectionForBusiness(businessId);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">WhatsApp</h1>
        <p className="max-w-2xl text-sm text-ds-text-secondary">
          Let prospects message your AI sales employee on WhatsApp, the same way they can on your
          website. Connect a number from{" "}
          <a
            href={WHATSAPP_MANAGER_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-ds-accent underline underline-offset-2"
          >
            WhatsApp Manager
          </a>{" "}
          below.
        </p>
      </div>

      {canEdit ? <WhatsappSetupGuide hasConnection={connection != null} /> : null}

      {connection ? (
        <WhatsappConnectionStatus connection={connection} canEdit={canEdit} />
      ) : canEdit ? (
        <ConnectWhatsappForm />
      ) : (
        <PermissionNotice />
      )}
    </div>
  );
}
