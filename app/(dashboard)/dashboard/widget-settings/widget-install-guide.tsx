"use client";

import { useState } from "react";
import type { WidgetKey } from "@/lib/supabase/types";
import { buildWidgetSnippet } from "./build-widget-snippet";
import { CopyKeyButton } from "./copy-key-button";

type Platform = {
  id: string;
  label: string;
  steps: string[];
};

const PLATFORMS: Platform[] = [
  {
    id: "html",
    label: "Plain HTML site",
    steps: [
      "Open the HTML file for your site (or your site builder's \"custom code\" area).",
      "Paste the snippet right before the closing </body> tag, near the bottom of the page.",
      "Save and re-upload or republish the page.",
    ],
  },
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
    id: "squarespace",
    label: "Squarespace",
    steps: [
      "In your Squarespace dashboard, go to Settings → Advanced → Code Injection.",
      "Paste the snippet into the \"Footer\" box.",
      "Save.",
    ],
  },
];

export function WidgetInstallGuide({
  widgetKeys,
  appOrigin,
}: {
  widgetKeys: WidgetKey[];
  appOrigin: string;
}) {
  const [open, setOpen] = useState(true);
  const [platformId, setPlatformId] = useState(PLATFORMS[0].id);
  const activeKey = widgetKeys.find((key) => key.status !== "revoked");
  const snippet = activeKey ? buildWidgetSnippet(activeKey.key, appOrigin) : null;
  const platform = PLATFORMS.find((candidate) => candidate.id === platformId) ?? PLATFORMS[0];

  return (
    <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ds-text-primary">Install your chat widget</h2>
          <p className="text-sm text-ds-text-secondary">
            A step-by-step guide to adding the chat bubble to your website. No coding experience
            needed.
          </p>
        </div>
        <span className="shrink-0 text-sm text-ds-text-muted">{open ? "Hide" : "Show"}</span>
      </button>

      {open ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-ds-text-primary">Step 1 — Copy your snippet</h3>
            {snippet ? (
              <div className="flex flex-wrap items-center gap-2">
                <code className="max-w-full overflow-x-auto rounded-ds-md border border-ds-border bg-ds-surface-elevated px-3 py-2.5 font-mono text-xs text-ds-text-primary">
                  {snippet}
                </code>
                <CopyKeyButton value={snippet} label="Copy snippet" />
              </div>
            ) : (
              <p className="text-sm text-ds-text-secondary">
                Create a widget key below first, then come back here to copy its snippet.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-ds-text-primary">Step 2 — Paste it into your website</h3>
            <p className="text-xs text-ds-text-secondary">Pick the platform your website is built on:</p>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setPlatformId(candidate.id)}
                  aria-pressed={candidate.id === platformId}
                  className={`rounded-ds-sm px-3 py-1.5 text-xs font-medium transition-colors ${
                    candidate.id === platformId
                      ? "bg-ds-accent text-ds-accent-on"
                      : "border border-ds-border text-ds-text-secondary hover:border-ds-border-strong hover:text-ds-text-primary"
                  }`}
                >
                  {candidate.label}
                </button>
              ))}
            </div>
            <ol className="flex flex-col gap-1.5 text-sm text-ds-text-secondary">
              {platform.steps.map((step, index) => (
                <li key={index} className="flex gap-2">
                  <span className="shrink-0 text-ds-text-muted">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium text-ds-text-primary">Step 3 — Allow your site&rsquo;s address</h3>
            <p className="text-sm text-ds-text-secondary">
              Below, find your widget key and add your website&rsquo;s address (e.g. https://yourbusiness.com)
              under &ldquo;Allowed origins&rdquo; — this tells us it&rsquo;s really your site asking for chat.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium text-ds-text-primary">Step 4 — Publish</h3>
            <p className="text-sm text-ds-text-secondary">
              Click the &ldquo;Publish&rdquo; button on this page. Until you publish, visitors will see the
              chat bubble but won&rsquo;t get a response.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium text-ds-text-primary">Step 5 — Test it</h3>
            <p className="text-sm text-ds-text-secondary">
              Open your live website in a new tab. You should see a chat bubble in the corner — click
              it and send a test message to make sure it responds.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
