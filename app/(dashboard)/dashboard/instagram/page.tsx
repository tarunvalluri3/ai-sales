import { Suspense } from "react";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getInstagramConnectionForBusiness, getInstagramPendingSelection } from "@/lib/instagram";
import { channelNotEntitledMessage, getEntitlementForBusiness } from "@/lib/subscription";
import { ConnectInstagramButton } from "./connect-instagram-button";
import { InstagramConnectionStatus } from "./instagram-connection-status";
import { InstagramSetupGuide } from "./instagram-setup-guide";
import { InstagramOAuthResult } from "./instagram-oauth-result";
import { ChooseInstagramAccount } from "./choose-instagram-account";
import { PermissionNotice } from "../_components/state-views";
import { ChannelUpgradeNotice } from "../_components/channel-upgrade-notice";

export default async function InstagramPage({
  searchParams,
}: {
  searchParams: Promise<{ select?: string | string[] }>;
}) {
  const { businessId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:admin");
  const { select } = await searchParams;
  const selectionId = typeof select === "string" ? select : null;

  // Phase 17a: the channel gate is the `channels` map in lib/plans.ts.
  const [connection, entitlement, choices] = await Promise.all([
    getInstagramConnectionForBusiness(businessId),
    getEntitlementForBusiness(businessId),
    // Read only under the caller's own business_id.
    canEdit && selectionId ? getInstagramPendingSelection(businessId, selectionId) : Promise.resolve(null),
  ]);
  const entitled = entitlement.channels.instagram;

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Instagram</h1>
        <p className="max-w-2xl text-sm text-ds-text-secondary">
          Let prospects message your AI sales employee on Instagram, the same way they can on your website
          and WhatsApp.
        </p>
      </div>

      <Suspense fallback={null}>
        <InstagramOAuthResult username={connection?.ig_username ?? null} />
      </Suspense>

      {selectionId && canEdit && !choices ? (
        <p role="alert" className="rounded-ds-md bg-ds-danger-bg px-4 py-3 text-sm text-ds-danger">
          That account choice expired. Please click &ldquo;Connect Instagram&rdquo; again.
        </p>
      ) : null}

      {choices && selectionId && entitled ? (
        <ChooseInstagramAccount selectionId={selectionId} accounts={choices} />
      ) : null}

      {canEdit && entitled && !choices ? <InstagramSetupGuide hasConnection={connection?.status === "connected"} /> : null}

      {/* An existing connection stays visible, but without access (a plan
          with Instagram, or the per-business override) no message is
          received or sent -- the webhook and send queue refuse. */}
      {connection && !entitled ? (
        <ChannelUpgradeNotice
          message={`${channelNotEntitledMessage("instagram", entitlement)} This account is still connected, but its messages are not being received or answered.`}
          showPlansLink={false}
        />
      ) : null}

      {choices ? null : connection ? (
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
