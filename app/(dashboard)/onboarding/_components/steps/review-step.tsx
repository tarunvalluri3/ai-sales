"use client";

import { useEffect, type ComponentProps } from "react";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { ReadinessCounts, type ReadinessCountsData } from "../readiness-counts";
import { HoursSummary } from "../hours-summary";
import { RecommendedDetails } from "./recommended-details";
import Link from "next/link";
import { ReadinessChecklist } from "../../../dashboard/widget-settings/readiness-checklist";
import { LIVE_CONFIRMATION_MS, PublishButton } from "../../../dashboard/widget-settings/publish-button";
import { SandboxChatPanel } from "../../../dashboard/_components/sandbox-chat/sandbox-chat-panel";
import { CopyKeyButton } from "../../../dashboard/widget-settings/copy-key-button";
import { buildWidgetSnippet } from "../../../dashboard/widget-settings/build-widget-snippet";
import type { ReadinessReport } from "@/lib/onboarding-readiness";
import { Card, CardHeader, btnGhost, btnPrimary, linkAccent } from "../../../dashboard/_components/ui";

type Channel = { label: string; href: string; done: boolean; summary: string };

/**
 * Stage 6: "Test & go live". Reuses the real `ReadinessChecklist` and
 * `PublishButton` (the same two components /dashboard/widget-settings
 * already used for this) -- publishing is still exactly
 * `publishBusinessForOrg`, just invoked from here now instead of there.
 */
export function ReviewStep({
  report,
  counts,
  isPublished,
  hasActiveKey,
  hasPrivacyPolicyUrl,
  businessName,
  channelSummary,
  checklistRows,
  activeWidgetKey,
  appOrigin,
  recommendedDetails,
  openingHours,
}: {
  report: ReadinessReport;
  counts: ReadinessCountsData;
  isPublished: boolean;
  hasActiveKey: boolean;
  hasPrivacyPolicyUrl: boolean;
  businessName: string;
  channelSummary: string;
  checklistRows: Channel[];
  activeWidgetKey: string | null;
  appOrigin: string;
  recommendedDetails: ComponentProps<typeof RecommendedDetails>;
  openingHours: ComponentProps<typeof HoursSummary>;
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
          className="flex flex-col items-center gap-2 rounded-3xl bg-ds-success-bg px-5 py-8 text-center"
        >
          <CircleCheck className="onboarding-published-mark mb-1 size-8 text-ds-success" aria-hidden />
          <p className="text-lg font-medium text-ds-text-primary">Your agent is live</p>
          <p className="text-sm text-ds-text-secondary">
            {businessName} is answering prospects on {channelSummary}. Taking you to your dashboard…
          </p>
        </div>

        {snippet ? (
          <Card className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-ds-text-primary">Your widget embed code</h2>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 basis-40 rounded-lg bg-ds-surface-soft px-3 py-2 text-xs text-ds-text-secondary">
                {snippet}
              </code>
              <CopyKeyButton value={snippet} />
            </div>
            <p className="text-xs text-ds-text-muted">Paste this before your site&rsquo;s closing &lt;/body&gt; tag.</p>
          </Card>
        ) : null}

        <ul className="flex flex-col gap-2 text-sm text-ds-text-secondary">
          <li>Share your widget snippet with whoever manages your website.</li>
          <li>Add more products, FAQs or knowledge any time from the dashboard.</li>
          <li>Watch your first conversations and leads come in.</li>
        </ul>

        <Link
          href="/dashboard?welcome=1"
          replace
          className={btnPrimary + " min-h-11 self-start"}
        >
          Open dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-2">
        <CardHeader title="Setup summary" />
        <ul className="flex flex-col divide-y divide-ds-border">
          {checklistRows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="flex flex-col">
                <span className={row.done ? "text-ds-text-primary" : "font-medium text-ds-warning"}>{row.label}</span>
                <span className="text-xs text-ds-text-muted">{row.summary}</span>
              </div>
              <Link href={row.href} aria-label={"Edit " + row.label} className={linkAccent + " min-h-11 shrink-0"}>
                Edit
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <ReadinessCounts counts={counts} />
      <ReadinessChecklist report={report} hideActionHints hoursEditorHref="#opening-hours" />
      <HoursSummary {...openingHours} />

      <RecommendedDetails {...recommendedDetails} />

      <SandboxChatPanel />

      <PublishButton
        isPublished={published}
        hasActiveKey={hasActiveKey}
        hasPrivacyPolicyUrl={hasPrivacyPolicyUrl}
        privacyPolicyFieldHref="#rd-privacy"
        readinessBlocked={report.gateApplies && !report.canPublish}
        blockingCount={report.blockingItems.length}
        redirectOnSuccess="/dashboard?welcome=1"
        footerClassName="onboarding-actions"
        backAction={(
          <button type="button" onClick={() => router.push("/onboarding?step=plan")} className={btnGhost}>
            <ArrowLeft className="size-4" aria-hidden /> Back
          </button>
        )}
      />
    </div>
  );
}
