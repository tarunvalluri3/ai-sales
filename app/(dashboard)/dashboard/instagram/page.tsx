import { Suspense } from "react";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getInstagramConnectionForBusiness, getInstagramPendingSelection } from "@/lib/instagram";
import { channelAllowed, channelNotEntitledMessage, getEntitlementForBusiness } from "@/lib/subscription";
import { ConnectInstagramButton } from "./connect-instagram-button";
import { InstagramConnectionStatus } from "./instagram-connection-status";
import { InstagramSetupGuide } from "./instagram-setup-guide";
import { InstagramOAuthResult } from "./instagram-oauth-result";
import { ChooseInstagramAccount } from "./choose-instagram-account";
import { PermissionNotice } from "../_components/state-views";
import { ChannelUpgradeNotice } from "../_components/channel-upgrade-notice";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Camera, Inbox, MessageCircle, UserRound } from "lucide-react";
import { Card, PageHeader, btnPrimary } from "../_components/ui";

const DM_POINTS = [
  { icon: MessageCircle, title: "Answers DMs automatically", body: "Responds using your approved business information." },
  { icon: BookOpen, title: "One shared brain", body: "Products, services and FAQs stay consistent across channels." },
  { icon: UserRound, title: "You stay in control", body: "Take over any conversation when a prospect needs your team." },
];

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
  const entitled = channelAllowed(entitlement, "instagram");

  const isConnected = connection?.status === "connected";

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader icon={Camera} title="Instagram" description="Turn Instagram DMs into useful sales conversations." />

      <Suspense fallback={null}>
        <InstagramOAuthResult username={connection?.ig_username ?? null} />
      </Suspense>

      {selectionId && canEdit && !choices ? (
        <p role="alert" className="rounded-2xl bg-ds-danger-bg px-4 py-3 text-sm text-ds-danger">
          That account choice expired. Please click &ldquo;Connect Instagram&rdquo; again.
        </p>
      ) : null}

      {choices && selectionId && entitled ? (
        <ChooseInstagramAccount selectionId={selectionId} accounts={choices} />
      ) : null}

      {/* An existing connection stays visible, but without access (a plan
          with Instagram, or the per-business override) no message is
          received or sent -- the webhook and send queue refuse. */}
      {connection && !entitled ? (
        <ChannelUpgradeNotice
          message={`${channelNotEntitledMessage("instagram", entitlement)} This account is still connected, but its messages are not being received or answered.`}
        />
      ) : null}

      {choices ? null : (
        <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            {connection ? (
              <InstagramConnectionStatus connection={connection} canEdit={canEdit} />
            ) : !entitled ? (
              <ChannelUpgradeNotice message={channelNotEntitledMessage("instagram", entitlement)} />
            ) : canEdit ? (
              <ConnectInstagramButton />
            ) : (
              <PermissionNotice />
            )}
          </div>
          {canEdit && entitled ? <InstagramSetupGuide hasConnection={isConnected} /> : null}
        </div>
      )}

      <Card className="flex flex-col gap-4">
        <h2 className="dx-title">Your AI sales employee, now in DMs</h2>
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-3 md:divide-x md:divide-ds-border">
          {DM_POINTS.map((point, index) => (
            <li key={point.title} className={`flex items-start gap-4 ${index > 0 ? "md:pl-5" : ""}`}>
              <point.icon className="size-11 shrink-0 text-ds-text-primary" strokeWidth={1.5} aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <h3 className="text-base leading-tight font-medium text-ds-text-primary">{point.title}</h3>
                <p className="text-sm text-ds-text-secondary">{point.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-3xl bg-ds-surface-soft px-5 py-4">
        <Inbox className="size-11 shrink-0 text-ds-text-primary" strokeWidth={1.5} aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-lg leading-tight font-medium text-ds-text-primary">Keep every conversation in one place.</p>
          <p className="text-sm text-ds-text-secondary">Read Instagram DMs alongside website and WhatsApp chats.</p>
        </div>
        <Link href="/dashboard/conversations" className={btnPrimary}>
          Open conversations
          <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
