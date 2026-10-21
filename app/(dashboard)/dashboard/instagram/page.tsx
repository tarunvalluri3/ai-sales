import { Suspense } from "react";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getInstagramConnectionForBusiness } from "@/lib/instagram";
import { channelNotEntitledMessage, getEntitlementForBusiness } from "@/lib/subscription";
import { ConnectInstagramButton } from "./connect-instagram-button";
import { InstagramConnectionStatus } from "./instagram-connection-status";
import { InstagramSetupGuide } from "./instagram-setup-guide";
import { InstagramOAuthResult } from "./instagram-oauth-result";
import { PermissionNotice } from "../_components/state-views";
import { ChannelUpgradeNotice } from "../_components/channel-upgrade-notice";

export default async function InstagramPage() {
  const { businessId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:admin");

  // Phase 17a: Instagram is entitled on no plan today -- not because the
  // feature is missing (Phase 26 built it and it works) but because Meta
  // App Review and Business Verification gate serving an account this app
  // does not itself manage. The gate is the `channels` map in
  // lib/plans.ts, so the day that approval lands, shipping Instagram on
  // Growth and Scale is a one-line config edit -- no migration, and
  // nothing to change here.
  const [connection, entitlement] = await Promise.all([
    getInstagramConnectionForBusiness(businessId),
    getEntitlementForBusiness(businessId),
  ]);
  const entitled = entitlement.channels.instagram;

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <Suspense fallback={null}>
        <InstagramOAuthResult />
      </Suspense>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Instagram</h1>
        <p className="max-w-2xl text-sm text-ds-text-secondary">
          Let prospects message your AI sales employee on Instagram, the same way they can on your website
          and WhatsApp.
        </p>
      </div>

      {canEdit && entitled ? <InstagramSetupGuide hasConnection={connection != null} /> : null}

      {/* An existing connection keeps working and stays visible: the
          developer's own Tester account is connected this way during Phase
          26's testing, and silently hiding it would look like data loss.
          No plans link -- Instagram is on no plan, so /pricing would be a
          dead end rather than an upgrade path. */}
      {connection && !entitled ? (
        <ChannelUpgradeNotice
          message={`${channelNotEntitledMessage("instagram", entitlement)} This account is still connected and still receiving messages.`}
          showPlansLink={false}
        />
      ) : null}

      {connection ? (
        <InstagramConnectionStatus connection={connection} canEdit={canEdit} />
      ) : !entitled ? (
        <ChannelUpgradeNotice
          message={channelNotEntitledMessage("instagram", entitlement)}
          showPlansLink={false}
        />
      ) : canEdit ? (
        <ConnectInstagramButton />
      ) : (
        <PermissionNotice />
      )}
    </div>
  );
}
