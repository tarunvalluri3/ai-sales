"use client";

import { useState } from "react";

function StepDone() {
  return <span className="text-xs font-medium text-ds-success">✓ Done</span>;
}

export function InstagramSetupGuide({ hasConnection }: { hasConnection: boolean }) {
  // Open while there's no connection yet; once connected it recedes behind
  // "Show", same pattern as WhatsappSetupGuide.
  const [open, setOpen] = useState(!hasConnection);

  return (
    <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex items-center justify-between gap-3 rounded-ds-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          aria-expanded={open}
        >
          <h2 className="text-lg font-semibold text-ds-text-primary">Before you connect</h2>
          <span className="shrink-0 text-sm text-ds-text-muted">{open ? "Hide" : "Show"}</span>
        </button>
        <p className="text-sm text-ds-text-secondary">
          Connecting uses Meta&rsquo;s business login. You don&rsquo;t need a Facebook Page.
        </p>
      </div>

      <div className={open ? "flex flex-col gap-6" : "hidden"}>
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-ds-text-primary">Step 1 — Use a professional account</h3>
          <p className="text-sm text-ds-text-secondary">
            Your Instagram account must be a Business or Creator account, not a personal one. You can switch in
            the Instagram app under Settings → Account type and tools.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-ds-text-primary">Step 2 — Sign in and choose the account</h3>
          <p className="text-sm text-ds-text-secondary">
            &ldquo;Connect Instagram&rdquo; opens Meta&rsquo;s login. Sign in with Instagram or Facebook, pick your
            business portfolio, tick the Instagram account to share and approve the permissions. Your password
            is entered only on Meta&rsquo;s site.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2 text-sm font-medium text-ds-text-primary">
            That&rsquo;s it
            {hasConnection ? <StepDone /> : null}
          </h3>
          <p className="text-sm text-ds-text-secondary">
            Prospects can then DM your Instagram account and your AI sales employee replies within Instagram&rsquo;s
            24-hour reply window, using the same knowledge and rules as your website.
          </p>
        </div>
      </div>
    </section>
  );
}
