import { Suspense } from "react";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getInstagramConnectionForBusiness } from "@/lib/instagram";
import { ConnectInstagramButton } from "./connect-instagram-button";
import { InstagramConnectionStatus } from "./instagram-connection-status";
import { InstagramSetupGuide } from "./instagram-setup-guide";
import { InstagramOAuthResult } from "./instagram-oauth-result";
import { PermissionNotice } from "../_components/state-views";

export default async function InstagramPage() {
  const { businessId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:admin");
  const connection = await getInstagramConnectionForBusiness(businessId);

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

      {canEdit ? <InstagramSetupGuide hasConnection={connection != null} /> : null}

      {connection ? (
        <InstagramConnectionStatus connection={connection} canEdit={canEdit} />
      ) : canEdit ? (
        <ConnectInstagramButton />
      ) : (
        <PermissionNotice />
      )}
    </div>
  );
}
