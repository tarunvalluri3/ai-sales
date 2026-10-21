import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getWhatsappConnectionForBusiness } from "@/lib/whatsapp";
import { channelNotEntitledMessage, getEntitlementForBusiness } from "@/lib/subscription";
import { ConnectWhatsappForm, WHATSAPP_MANAGER_URL } from "./connect-whatsapp-form";
import { WhatsappConnectionStatus } from "./whatsapp-connection-status";
import { WhatsappSetupGuide } from "./whatsapp-setup-guide";
import { PermissionNotice } from "../_components/state-views";
import { ChannelUpgradeNotice } from "../_components/channel-upgrade-notice";

export default async function WhatsappPage() {
  const { businessId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:admin");

  // Phase 17a: WhatsApp is a Growth/Scale entitlement, read from the same
  // registry /pricing renders from. This is the explanation, not the
  // enforcement -- connectWhatsappAction refuses independently, so a
  // direct call to the Server Action is refused whether this page rendered
  // the form or not.
  const [connection, entitlement] = await Promise.all([
    getWhatsappConnectionForBusiness(businessId),
    getEntitlementForBusiness(businessId),
  ]);
  const entitled = entitlement.channels.whatsapp;

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

      {canEdit && entitled ? <WhatsappSetupGuide hasConnection={connection != null} /> : null}

      {/* An already-connected number on a plan that no longer includes
          WhatsApp keeps working and stays visible -- revoking a live sales
          channel from under a business without telling it is worse than
          charging it. It is told, and it can disconnect. */}
      {connection && !entitled ? (
        <ChannelUpgradeNotice
          message={`${channelNotEntitledMessage("whatsapp", entitlement)} This number is still connected and still receiving messages.`}
        />
      ) : null}

      {connection ? (
        <WhatsappConnectionStatus connection={connection} canEdit={canEdit} />
      ) : !entitled ? (
        <ChannelUpgradeNotice message={channelNotEntitledMessage("whatsapp", entitlement)} />
      ) : canEdit ? (
        <ConnectWhatsappForm />
      ) : (
        <PermissionNotice />
      )}
    </div>
  );
}
