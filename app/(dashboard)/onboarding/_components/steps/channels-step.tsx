"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { WidgetKey, WhatsappConnection, InstagramConnection } from "@/lib/supabase/types";
import { WidgetInstallGuide } from "../../../dashboard/widget-settings/widget-install-guide";
import { CreateWidgetKeyForm } from "../../../dashboard/widget-settings/create-widget-key-form";
import { WidgetKeyList } from "../../../dashboard/widget-settings/widget-key-list";
import { ConnectWhatsappForm } from "../../../dashboard/whatsapp/connect-whatsapp-form";
import { WhatsappConnectionStatus } from "../../../dashboard/whatsapp/whatsapp-connection-status";
import { ConnectInstagramButton } from "../../../dashboard/instagram/connect-instagram-button";
import { InstagramConnectionStatus } from "../../../dashboard/instagram/instagram-connection-status";
import { ChannelUpgradeNotice } from "../../../dashboard/_components/channel-upgrade-notice";
import { advanceOnboarding } from "../../actions";

export function ChannelsStep({
  widgetKeys,
  appOrigin,
  widgetLanguage,
  publishedAt,
  whatsapp,
  instagram,
  whatsappEntitled,
  instagramEntitled,
  whatsappUpgradeMessage,
  instagramUpgradeMessage,
}: {
  widgetKeys: WidgetKey[];
  appOrigin: string;
  widgetLanguage: string;
  publishedAt: string | null;
  whatsapp: WhatsappConnection | null;
  instagram: InstagramConnection | null;
  whatsappEntitled: boolean;
  instagramEntitled: boolean;
  whatsappUpgradeMessage: string;
  instagramUpgradeMessage: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const hasActiveKey = widgetKeys.some((key) => key.status !== "revoked");
  const valid = hasActiveKey || whatsapp != null || instagram != null;

  function handleContinue() {
    setError(null);
    startTransition(async () => {
      const result = await advanceOnboarding("plan");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/onboarding?step=plan");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <h2 className="text-sm font-semibold text-ds-text-primary">Website widget</h2>
        <WidgetInstallGuide widgetKeys={widgetKeys} appOrigin={appOrigin} publishedAt={publishedAt} />
        <p className="text-xs text-ds-text-muted">You&rsquo;ll get the widget code after publishing.</p>
        <CreateWidgetKeyForm />
        <WidgetKeyList widgetKeys={widgetKeys} appOrigin={appOrigin} widgetLanguage={widgetLanguage} canEdit />
      </section>

      <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <h2 className="text-sm font-semibold text-ds-text-primary">WhatsApp Business</h2>
        {whatsapp ? (
          <WhatsappConnectionStatus connection={whatsapp} canEdit />
        ) : !whatsappEntitled ? (
          <ChannelUpgradeNotice message={whatsappUpgradeMessage} />
        ) : (
          <ConnectWhatsappForm />
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <h2 className="text-sm font-semibold text-ds-text-primary">Instagram</h2>
        {instagram ? (
          <InstagramConnectionStatus connection={instagram} canEdit />
        ) : !instagramEntitled ? (
          <ChannelUpgradeNotice message={instagramUpgradeMessage} showPlansLink={false} />
        ) : (
          <ConnectInstagramButton />
        )}
      </section>

      {error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/onboarding?step=persona")}
          className="text-sm font-medium text-ds-text-secondary transition-colors hover:text-ds-text-primary"
        >
          Back
        </button>
        <div className="flex items-center gap-3">
          {!valid ? <span className="text-xs text-ds-text-muted">Connect at least one channel to continue</span> : null}
          <button
            type="button"
            onClick={handleContinue}
            disabled={isPending || !valid}
            className="rounded-ds-sm bg-ds-accent px-5 py-2.5 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            {isPending ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
