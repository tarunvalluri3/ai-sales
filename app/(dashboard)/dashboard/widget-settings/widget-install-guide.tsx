"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import type { WidgetKey } from "@/lib/supabase/types";
import { buildWidgetSnippet } from "./build-widget-snippet";
import { CopyKeyButton } from "./copy-key-button";
import { Card, Pill, StepBubble } from "../_components/ui";

type Platform = {
  id: string;
  label: string;
  steps: string[];
};

const PLATFORMS: Platform[] = [
  {
    id: "wordpress",
    label: "WordPress",
    steps: [
      "Install a plugin like \"Insert Headers and Footers\" (Plugins → Add New), or open Appearance → Theme File Editor if you're comfortable editing theme files directly.",
      "Paste the snippet into the \"Footer\" box (plugin) or just before </body> in footer.php (theme editor).",
      "Save. The chat bubble will appear on every page that uses this theme.",
    ],
  },
  {
    id: "shopify",
    label: "Shopify",
    steps: [
      "In your Shopify admin, go to Online Store → Themes.",
      "Click the \"…\" menu on your live theme, then \"Edit code\".",
      "Open theme.liquid and paste the snippet right before the closing </body> tag.",
      "Save.",
    ],
  },
  {
    id: "wix",
    label: "Wix",
    steps: [
      "In your Wix dashboard, go to Settings → Custom Code.",
      "Click \"+ Add Custom Code\" and paste the snippet in.",
      "Set it to load on \"All pages\" and place it in \"Body - end\".",
      "Save and publish your site.",
    ],
  },
  {
    id: "other",
    label: "Other / custom",
    steps: [
      "Most other builders (Squarespace, Webflow, Ghost, Notion, etc.) have a similar \"custom code\" or \"code injection\" area under Settings — paste the snippet there, in the footer/body-end slot.",
      "Building your own HTML? Paste the snippet right before the closing </body> tag, near the bottom of the page.",
      "Save and re-upload or republish the page.",
    ],
  },
];

/** A numbered step; the number becomes a filled check once the app can observe the step is done. */
function Step({
  number,
  title,
  done = false,
  aside,
  children,
}: {
  number: number;
  title: string;
  done?: boolean;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-4">
      {done ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ds-primary text-ds-primary-on">
          <Check className="size-4" strokeWidth={2.5} aria-hidden="true" />
          <span className="sr-only">Step {number}, done</span>
        </span>
      ) : (
        <StepBubble>{number}</StepBubble>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm leading-8 font-medium text-ds-text-primary">{title}</h3>
          {aside}
        </div>
        {children}
      </div>
    </li>
  );
}

export function WidgetInstallGuide({
  widgetKeys,
  appOrigin,
  isPublished,
  activeKeyCount,
  onboarding = false,
}: {
  widgetKeys: WidgetKey[];
  appOrigin: string;
  /** lib/agent-published.ts -- the one live signal. */
  isPublished: boolean;
  /** Defaults to the number of non-revoked keys in `widgetKeys`. */
  activeKeyCount?: number;
  onboarding?: boolean;
}) {
  const [platformId, setPlatformId] = useState(PLATFORMS[0].id);
  const activeKeys = widgetKeys.filter((key) => key.status !== "revoked");
  const [selectedKeyId, setSelectedKeyId] = useState(activeKeys[0]?.id ?? "");
  const activeKey = activeKeys.find((key) => key.id === selectedKeyId) ?? activeKeys[0];
  const snippet = activeKey ? buildWidgetSnippet(activeKey.key, appOrigin) : null;
  const platform = PLATFORMS.find((candidate) => candidate.id === platformId) ?? PLATFORMS[0];
  // Steps 2 (paste into site) and 5 (live test) have no signal this app can
  // observe server-side -- deliberately left without a "done" indicator
  // rather than guessing.
  const step1Done = activeKeys.length > 0;
  const allowedOrigins = activeKey?.allowed_origins ?? [];
  const step3Done = activeKeys.some((key) => key.allowed_origins.length > 0);
  const step4Done = isPublished;

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="dx-title text-lg">Install your chat widget</h2>
        <p className="dx-subtitle text-base">No coding experience needed.</p>
      </div>

      <ol className="flex flex-col gap-5">
        <Step
          number={1}
          title="Copy your snippet"
          done={step1Done}
          aside={
            activeKeys.length > 1 ? (
              <select
                aria-label="Widget key for this snippet"
                value={activeKey?.id ?? ""}
                onChange={(event) => setSelectedKeyId(event.target.value)}
                className="h-9 min-h-0 rounded-xl border border-ds-border-strong bg-ds-surface px-3 text-sm text-ds-text-primary"
              >
                {activeKeys.map((key) => (
                  <option key={key.id} value={key.id}>
                    {key.name || "Unnamed key"}
                  </option>
                ))}
              </select>
            ) : null
          }
        >
          {snippet ? (
            <div className="flex flex-wrap items-start gap-3">
              <code className="max-w-full min-w-0 flex-1 overflow-x-auto rounded-xl bg-ds-surface-soft px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-ds-text-primary">
                {snippet}
              </code>
              <CopyKeyButton value={snippet} label="Copy snippet" />
            </div>
          ) : (
            <p className="text-sm text-ds-text-secondary">
              Create a widget key first (under Widget keys), then come back here to copy its snippet.
            </p>
          )}
        </Step>

        <Step number={2} title="Paste it into your website">
          <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-ds-border-strong sm:grid-cols-4" role="group" aria-label="Website platform">
            {PLATFORMS.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => setPlatformId(candidate.id)}
                aria-pressed={candidate.id === platformId}
                className={`min-h-10 rounded-none px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ds-primary ${
                  candidate.id === platformId ? "bg-ds-lime-soft text-ds-primary" : "bg-ds-surface text-ds-text-primary hover:bg-ds-surface-soft"
                }`}
              >
                {candidate.label}
              </button>
            ))}
          </div>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ds-text-primary">
            {platform.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </Step>

        <Step
          number={3}
          title={onboarding ? "Your website address" : "Allow your site’s address"}
          done={step3Done}
          aside={step3Done ? <Pill tone="lime">Allowed</Pill> : null}
        >
          {allowedOrigins.length > 0 ? (
            <p className="text-sm break-all text-ds-text-secondary">{allowedOrigins.join(", ")}</p>
          ) : (
            <p className="text-sm text-ds-text-secondary">
              {onboarding ? "Add your website address above when you’re ready." : <>Under Widget keys, add your website&rsquo;s address (e.g. https://yourbusiness.com) to &ldquo;Allowed origins&rdquo;.
              This tells us it&rsquo;s really your site asking for chat.</>}
            </p>
          )}
        </Step>

        <Step number={4} title="Publish your agent" done={step4Done}>
          <p className="text-sm text-ds-text-secondary">
            {isPublished ? (
              <>Your agent is live. Later edits go live when you use &ldquo;Publish changes&rdquo; in the top bar.</>
            ) : (
              <>
                Publish your agent from the{" "}
                <Link href="/onboarding?step=review" className="font-medium text-ds-primary underline-offset-4 hover:underline">
                  Test &amp; go live
                </Link>{" "}
                step of the setup wizard. Until you publish, visitors will see the chat bubble but won&rsquo;t get a response.
              </>
            )}
          </p>
        </Step>

        <Step number={5} title="Test it">
          <p className="text-sm text-ds-text-secondary">
            Open your live website in a new tab. You should see a chat bubble in the corner — click it and send a test
            message to make sure it responds.
          </p>
        </Step>
      </ol>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-ds-border px-5 py-4">
        <h3 className="text-sm font-medium text-ds-text-primary">Widget status</h3>
        <Pill tone={isPublished ? "lime" : "gray"} dot>
          {isPublished ? "Live" : "Draft"}
        </Pill>
        <span className="border-l border-ds-border pl-5 text-sm font-medium text-ds-text-primary">
          {activeKeyCount ?? activeKeys.length} active widget {(activeKeyCount ?? activeKeys.length) === 1 ? "key" : "keys"}
        </span>
        <p className="w-full text-sm text-ds-text-secondary">
          Use the dashboard header to publish saved appearance and AI changes.
        </p>
      </div>
    </Card>
  );
}
