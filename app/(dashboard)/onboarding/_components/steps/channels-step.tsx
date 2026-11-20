"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import type { WidgetKey, WhatsappConnection, InstagramConnection } from "@/lib/supabase/types";
import { WidgetInstallGuide } from "../../../dashboard/widget-settings/widget-install-guide";
import { EmbeddedSignupButton } from "../../../dashboard/whatsapp/embedded-signup-button";
import type { EmbeddedSignupClientConfig } from "@/lib/whatsapp-embedded-signup";
import { InstagramOAuthResult } from "../../../dashboard/instagram/instagram-oauth-result";
import { ChooseInstagramAccount } from "../../../dashboard/instagram/choose-instagram-account";
import { ConnectWhatsappForm } from "../../../dashboard/whatsapp/connect-whatsapp-form";
import { WhatsappConnectionStatus } from "../../../dashboard/whatsapp/whatsapp-connection-status";
import { ConnectInstagramButton } from "../../../dashboard/instagram/connect-instagram-button";
import { InstagramConnectionStatus } from "../../../dashboard/instagram/instagram-connection-status";
import { ChannelUpgradeNotice } from "../../../dashboard/_components/channel-upgrade-notice";
import { advanceOnboarding, saveOnboardingWebsiteAction } from "../../actions";

export function ChannelsStep({
  widgetKeys,
  appOrigin,
  website,
  embeddedSignup,
  instagramSelection,
  isPublished,
  whatsapp,
  instagram,
  whatsappEntitled,
  instagramEntitled,
  whatsappUpgradeMessage,
  instagramUpgradeMessage,
}: {
  widgetKeys: WidgetKey[];
  appOrigin: string;
  website: string;
  embeddedSignup: EmbeddedSignupClientConfig | null;
  instagramSelection?: {
    selectionId: string;
    accounts: { id: string; username: string | null; pageName?: string | null }[] | null;
  };
  isPublished: boolean;
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
  const valid = hasActiveKey;
  const [websiteState, websiteAction, websitePending] = useActionState(saveOnboardingWebsiteAction, {});
  const [address, setAddress] = useState(website);
  const primaryKey = widgetKeys.find((key) => key.status === "active" && key.allowed_origins.includes(address))
    ?? widgetKeys.find((key) => key.status === "active");

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
      <section className="flex flex-col gap-4 border border-ds-border bg-ds-surface p-5">
        <h2 className="text-sm font-medium text-ds-text-primary">Website widget</h2>
        <form action={websiteAction} noValidate className="flex flex-col gap-2">
          <label htmlFor="onboarding-website" className="text-sm font-medium text-ds-text-primary">Your website address</label>
          <input id="onboarding-website" name="website" type="url" value={address}
            onChange={(event) => setAddress(event.target.value)} placeholder="https://example.com"
            aria-invalid={Boolean(websiteState.error)} aria-describedby={websiteState.error ? "onboarding-website-error" : undefined}
            className="border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary" />
          {websiteState.error ? <p id="onboarding-website-error" role="alert" className="text-xs text-ds-danger">{websiteState.error}</p> : null}
          {websiteState.saved ? <p role="status" className="text-xs text-ds-success">Website widget saved.</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" name="websiteIntent" value="save" disabled={websitePending}
              className="bg-ds-primary px-4 py-2 text-sm text-ds-primary-on disabled:opacity-60">
              {websitePending ? "Saving…" : "Save website address"}
            </button>
            {!hasActiveKey ? <button type="submit" name="websiteIntent" value="skip" disabled={websitePending}
              className="text-sm text-ds-text-secondary underline">I&rsquo;ll add my website later</button> : null}
          </div>
        </form>
        {primaryKey ? <WidgetInstallGuide widgetKeys={[primaryKey]} appOrigin={appOrigin} isPublished={isPublished} onboarding /> : null}
      </section>

      <section className="flex flex-col gap-4 border border-ds-border bg-ds-surface p-5">
        <h2 className="text-sm font-medium text-ds-text-primary">WhatsApp Business</h2>
        {whatsapp ? (
          <WhatsappConnectionStatus connection={whatsapp} canEdit />
        ) : !whatsappEntitled ? (
          <ChannelUpgradeNotice message={whatsappUpgradeMessage} />
        ) : (
          <>
            {embeddedSignup ? <EmbeddedSignupButton {...embeddedSignup} /> : null}
            <details className="border border-ds-border p-3">
              <summary className="cursor-pointer text-sm font-medium text-ds-text-primary">Advanced: connect manually</summary>
              <div className="pt-3"><ConnectWhatsappForm /></div>
            </details>
          </>
        )}
      </section>

      <section className="flex flex-col gap-4 border border-ds-border bg-ds-surface p-5">
        <h2 className="text-sm font-medium text-ds-text-primary">Instagram</h2>
        <InstagramOAuthResult username={instagram?.ig_username ?? null} onboarding />
        {instagramSelection && instagramEntitled ? (
          instagramSelection.accounts ? <ChooseInstagramAccount selectionId={instagramSelection.selectionId} accounts={instagramSelection.accounts} onboarding />
            : <p role="alert" className="text-sm text-ds-danger">That account choice expired. Connect Instagram again.</p>
        ) : null}
        {instagram ? (
          <InstagramConnectionStatus connection={instagram} canEdit />
        ) : !instagramEntitled ? (
          <ChannelUpgradeNotice message={instagramUpgradeMessage}  />
        ) : instagramSelection?.accounts ? null : (
          <ConnectInstagramButton onboarding />
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
          {!valid ? <span className="text-xs text-ds-text-muted">Set up your website widget to continue</span> : null}
          <button
            type="button"
            onClick={handleContinue}
            disabled={isPending || !valid}
            className="ds-btn-label bg-ds-primary px-5 py-2.5 text-sm font-medium text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary"
          >
            {isPending ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
