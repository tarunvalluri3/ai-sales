import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getWhatsappConnectionForBusiness, listWhatsappTemplateStatusesForBusiness } from "@/lib/whatsapp";
import { getEmbeddedSignupClientConfig } from "@/lib/whatsapp-embedded-signup";
import { templateLanguage, templateNameFor } from "@/lib/whatsapp-template-sync";
import { WHATSAPP_TEMPLATES, type WhatsappTemplateKind } from "@/lib/whatsapp-templates";
import { EmbeddedSignupButton } from "./embedded-signup-button";
import { WhatsappTemplatesPanel, type TemplatePanelRow } from "./whatsapp-templates-panel";
import { channelAllowed, channelNotEntitledMessage, getEntitlementForBusiness } from "@/lib/subscription";
import { ConnectWhatsappForm, WHATSAPP_MANAGER_URL } from "./connect-whatsapp-form";
import { WhatsappConnectionStatus } from "./whatsapp-connection-status";
import { WhatsappSetupGuide } from "./whatsapp-setup-guide";
import { PermissionNotice } from "../_components/state-views";
import { ChannelUpgradeNotice } from "../_components/channel-upgrade-notice";

const TEMPLATE_PURPOSE: Record<WhatsappTemplateKind, string> = {
  appointment_confirmed: "Appointment confirmed",
  appointment_declined: "Appointment declined",
  appointment_cancelled: "Appointment cancelled",
  appointment_reminder: "Appointment reminder",
  appointment_expired: "Booking request expired",
};

export default async function WhatsappPage() {
  const { businessId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:admin");

  // Phase 17a: WhatsApp is a Growth/Scale entitlement, read from the same
  // registry /pricing renders from. This is the explanation, not the
  // enforcement -- connectWhatsappAction refuses independently, so a
  // direct call to the Server Action is refused whether this page rendered
  // the form or not.
  const [connection, entitlement, templateStatuses] = await Promise.all([
    getWhatsappConnectionForBusiness(businessId),
    getEntitlementForBusiness(businessId),
    listWhatsappTemplateStatusesForBusiness(businessId),
  ]);
  const entitled = channelAllowed(entitlement, "whatsapp");
  // Production readiness item 6: Embedded Signup when it's configured on this
  // deployment; the manual form stays available as a fallback.
  const embeddedSignup = getEmbeddedSignupClientConfig();
  const language = templateLanguage();
  const templateRows: TemplatePanelRow[] = (Object.keys(WHATSAPP_TEMPLATES) as WhatsappTemplateKind[]).map((kind) => {
    const name = templateNameFor(kind);
    const row = templateStatuses.find((status) => status.template_name === name && status.language === language);
    return {
      name,
      purpose: TEMPLATE_PURPOSE[kind],
      status: row?.status ?? null,
      rejectedReason: row?.rejected_reason ?? null,
      lastError: row?.last_error ?? null,
    };
  });

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

      {/* An already-connected number without WhatsApp access (Starter, or a
          lapsed trial/plan) stays visible and can be disconnected, but the
          webhook and the send queue refuse it (owner decision 2026-11-03:
          enforce the advertised plan limits), so the business is told. */}
      {connection && !entitled ? (
        <ChannelUpgradeNotice
          message={`${channelNotEntitledMessage("whatsapp", entitlement)} This number is still connected, but its messages are not being received or answered.`}
        />
      ) : null}

      {connection ? (
        <WhatsappConnectionStatus connection={connection} canEdit={canEdit} />
      ) : !entitled ? (
        <ChannelUpgradeNotice message={channelNotEntitledMessage("whatsapp", entitlement)} />
      ) : canEdit ? (
        embeddedSignup ? (
          <div className="flex flex-col gap-4">
            <EmbeddedSignupButton
              appId={embeddedSignup.appId}
              configId={embeddedSignup.configId}
              graphVersion={embeddedSignup.graphVersion}
            />
            <details className="border border-ds-border bg-ds-surface">
              <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-ds-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary">
                Already have a system-user token? Connect manually instead
              </summary>
              <div className="border-t border-ds-border p-5">
                <ConnectWhatsappForm />
              </div>
            </details>
          </div>
        ) : (
          <ConnectWhatsappForm />
        )
      ) : (
        <PermissionNotice />
      )}

      {connection && entitled ? <WhatsappTemplatesPanel rows={templateRows} canEdit={canEdit} /> : null}
    </div>
  );
}
