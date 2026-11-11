"use client";

import { useEffect, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { RecommendedDetails } from "./recommended-details";
import Link from "next/link";
import { ReadinessChecklist } from "../../../dashboard/widget-settings/readiness-checklist";
import { LIVE_CONFIRMATION_MS, PublishButton } from "../../../dashboard/widget-settings/publish-button";
import { SandboxChatPanel } from "../../../dashboard/_components/sandbox-chat/sandbox-chat-panel";
import { CopyKeyButton } from "../../../dashboard/widget-settings/copy-key-button";
import { buildWidgetSnippet } from "../../../dashboard/widget-settings/build-widget-snippet";
import type { ReadinessReport } from "@/lib/onboarding-readiness";

type Channel = { label: string; href: string; done: boolean; summary: string };

/**
 * Stage 6: "Test & go live". Reuses the real `ReadinessChecklist` and
 * `PublishButton` (the same two components /dashboard/widget-settings
 * already used for this) -- publishing is still exactly
 * `publishBusinessForOrg`, just invoked from here now instead of there.
 */
export function ReviewStep({
  report,
  isPublished,
  hasActiveKey,
  hasPrivacyPolicyUrl,
  businessName,
  channelSummary,
  checklistRows,
  activeWidgetKey,
  appOrigin,
  recommendedDetails,
}: {
  report: ReadinessReport;
  isPublished: boolean;
  hasActiveKey: boolean;
  hasPrivacyPolicyUrl: boolean;
  businessName: string;
  channelSummary: string;
  checklistRows: Channel[];
  activeWidgetKey: string | null;
  appOrigin: string;
  recommendedDetails: ComponentProps<typeof RecommendedDetails>;
}) {
  const router = useRouter();
  // `isPublished` comes straight from the server-fetched business row
  // (lib/agent-published.ts), not local state: publishing is a Server Action
  // whose revalidatePath("/onboarding") re-renders this page, so this flips
  // to the "Your agent is live" confirmation the moment `publishBusinessForOrg`
  // commits, then continues to the dashboard welcome on its own.
  const published = isPublished;
  const snippet = activeWidgetKey ? buildWidgetSnippet(activeWidgetKey, appOrigin) : null;

  useEffect(() => {
    if (!published) return;
    const timeoutId = setTimeout(() => router.replace("/dashboard?welcome=1"), LIVE_CONFIRMATION_MS);
    return () => clearTimeout(timeoutId);
  }, [published, router]);

  if (published) {
    return (
      <div className="flex flex-col gap-6">
        <div
          role="status"
          className="flex flex-col gap-2 border border-ds-success/40 bg-ds-success-bg px-5 py-6 text-center"
        >
          <p className="text-lg font-semibold text-ds-text-primary">Your agent is live</p>
          <p className="text-sm text-ds-text-secondary">
            {businessName} is answering prospects on {channelSummary}. Taking you to your dashboard…
          </p>
        </div>

        {snippet ? (
          <section className="flex flex-col gap-2 border border-ds-border bg-ds-surface p-5">
            <h2 className="text-sm font-semibold text-ds-text-primary">Your widget embed code</h2>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto bg-ds-surface-elevated px-3 py-2 text-xs text-ds-text-secondary">
                {snippet}
              </code>
              <CopyKeyButton value={snippet} />
            </div>
            <p className="text-xs text-ds-text-muted">Paste this before your site&rsquo;s closing &lt;/body&gt; tag.</p>
          </section>
        ) : null}

        <ul className="flex flex-col gap-2 text-sm text-ds-text-secondary">
          <li>Share your widget snippet with whoever manages your website.</li>
          <li>Add more products, FAQs or knowledge any time from the dashboard.</li>
          <li>Watch your first conversations and leads come in.</li>
        </ul>

        <Link
          href="/dashboard?welcome=1"
          replace
          className="ds-btn-label self-start bg-ds-primary px-5 py-2.5 text-sm font-semibold text-ds-primary-on transition-colors hover:bg-ds-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary"
        >
          Open dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 border border-ds-border bg-ds-surface p-5">
        <h2 className="text-sm font-semibold text-ds-text-primary">Setup summary</h2>
        <ul className="flex flex-col divide-y divide-ds-border">
          {checklistRows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="flex flex-col">
                <span className={row.done ? "text-ds-text-primary" : "font-medium text-ds-warning"}>{row.label}</span>
                <span className="text-xs text-ds-text-muted">{row.summary}</span>
              </div>
              <Link href={row.href} className="text-xs font-medium text-ds-text-primary hover:text-ds-accent">
                Edit
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <ReadinessChecklist report={report} hideActionHints />

      <RecommendedDetails {...recommendedDetails} />

      <section className="flex flex-col gap-3 border border-ds-border bg-ds-surface p-5">
        <h2 className="text-sm font-semibold text-ds-text-primary">Test your agent</h2>
        <p className="text-xs text-ds-text-secondary">
          Ask it something a real prospect might ask, based on your own products and FAQs.
        </p>
        <SandboxChatPanel />
      </section>

      <PublishButton
        isPublished={published}
        hasActiveKey={hasActiveKey}
        hasPrivacyPolicyUrl={hasPrivacyPolicyUrl}
        readinessBlocked={report.gateApplies && !report.canPublish}
        blockingCount={report.blockingItems.length}
        redirectOnSuccess="/dashboard?welcome=1"
      />

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/onboarding?step=plan")}
          className="text-sm font-medium text-ds-text-secondary transition-colors hover:text-ds-text-primary"
        >
          Back
        </button>
      </div>
    </div>
  );
}
