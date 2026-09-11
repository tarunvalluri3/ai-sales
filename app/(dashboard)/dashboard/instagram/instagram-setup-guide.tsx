"use client";

import { useState } from "react";

const linkClasses = "font-medium text-ds-accent underline underline-offset-2";
const META_ACCOUNTS_CENTER_URL = "https://accountscenter.instagram.com/";

function StepDone() {
  return <span className="text-xs font-medium text-ds-success">✓ Done</span>;
}

export function InstagramSetupGuide({ hasConnection }: { hasConnection: boolean }) {
  // Open by default while there's no connection yet (the guide's entire
  // job); once connected, this business has already done this, so it
  // recedes behind "Show" instead of reopening on every visit, same
  // pattern as WhatsappSetupGuide.
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
          Two quick requirements on Instagram&rsquo;s side — most accounts already meet them.
        </p>
      </div>

      <div className={open ? "flex flex-col gap-6" : "hidden"}>
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-ds-text-primary">Step 1 — Use a professional account</h3>
          <p className="text-sm text-ds-text-secondary">
            Your Instagram account needs to be a Business or Creator account, not a personal one. If it
            isn&rsquo;t yet, Instagram will prompt you to convert it — free, and takes under a minute — the
            first time you click &ldquo;Connect with Instagram&rdquo; below. You can also convert it ahead of
            time in{" "}
            <a href={META_ACCOUNTS_CENTER_URL} target="_blank" rel="noreferrer" className={linkClasses}>
              Instagram&rsquo;s Accounts Center
            </a>
            .
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-ds-text-primary">Step 2 — Approve the connection</h3>
          <p className="text-sm text-ds-text-secondary">
            Clicking &ldquo;Connect with Instagram&rdquo; takes you to Instagram itself to sign in and approve
            access — your password is never entered here or seen by this app.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2 text-sm font-medium text-ds-text-primary">
            That&rsquo;s it
            {hasConnection ? <StepDone /> : null}
          </h3>
          <p className="text-sm text-ds-text-secondary">
            Once approved, prospects can message your Instagram account and your AI sales employee replies
            automatically, using the same knowledge and rules as your website.
          </p>
        </div>
      </div>
    </section>
  );
}
