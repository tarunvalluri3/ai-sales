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
import Link from "next/link";
import { ArrowUpRight, Box, Headset, MessageCircleMore, Users } from "lucide-react";
import { PageHeader, btnOutline, linkAccent } from "../_components/ui";

const CHANNEL_POINTS = [
  { icon: Box, label: "Answers product questions" },
  { icon: Users, label: "Captures leads" },
  { icon: Headset, label: "Hands over to your team" },
];

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

  const connectionArea = connection ? (
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
        <details className="dx-card group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-medium text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary [&::-webkit-details-marker]:hidden">
            Advanced: connect manually
            <span aria-hidden="true" className="text-ds-text-secondary transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="flex flex-col gap-5 border-t border-ds-border p-5">
            <p className="text-sm text-ds-text-secondary">
              For developers: connect with a Meta app and a permanent system-user token instead of the Facebook flow.
            </p>
            <WhatsappSetupGuide hasConnection={false} />
            <ConnectWhatsappForm />
          </div>
        </details>
      </div>
    ) : (
      <ConnectWhatsappForm />
    )
  ) : (
    <PermissionNotice />
  );

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        icon={MessageCircleMore}
        title="WhatsApp"
        description="Your AI sales employee, on your business WhatsApp number."
        actions={
          <a href={WHATSAPP_MANAGER_URL} target="_blank" rel="noreferrer" className={btnOutline}>
            WhatsApp Manager
            <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
          </a>
        }
      />

      {/* An already-connected number without WhatsApp access (Starter, or a
          lapsed trial/plan) stays visible and can be disconnected, but the
          webhook and the send queue refuse it (owner decision 2026-11-03:
          enforce the advertised plan limits), so the business is told. */}
      {connection && !entitled ? (
        <ChannelUpgradeNotice
          message={`${channelNotEntitledMessage("whatsapp", entitlement)} This number is still connected, but its messages are not being received or answered.`}
        />
      ) : null}

      {/* Until a number is connected the setup guide leads; afterwards it
          recedes to the bottom of the page. */}
      {!connection && canEdit && entitled && !embeddedSignup ? <WhatsappSetupGuide hasConnection={false} /> : null}

      <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">{connectionArea}</div>

        <aside className="flex flex-col gap-3 rounded-3xl bg-ds-surface-soft dx-card-pad">
          <h2 className="flex items-center gap-3 text-lg leading-tight font-medium text-ds-text-primary">
            <MessageCircleMore className="size-6 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            One AI, across your channels
          </h2>
          <p className="text-sm text-ds-text-secondary">
            Your approved products, services and FAQs power replies here too.
          </p>
          <ul className="flex flex-col gap-2.5 py-1">
            {CHANNEL_POINTS.map((point) => (
              <li key={point.label} className="flex items-center gap-4 text-sm font-medium text-ds-text-primary">
                <point.icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                {point.label}
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-col gap-1.5 border-t border-ds-primary/15 pt-3">
            <p className="text-sm text-ds-text-secondary">Manage conversations from your shared inbox.</p>
            <Link href="/dashboard/conversations" className={`${linkAccent} self-start text-base`}>
              Open conversations
              <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </aside>
      </div>

      {connection && entitled ? <WhatsappTemplatesPanel rows={templateRows} canEdit={canEdit} /> : null}

      {connection && canEdit && entitled ? <WhatsappSetupGuide hasConnection /> : null}
    </div>
  );
}
