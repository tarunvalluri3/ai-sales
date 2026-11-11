"use client";

import { useState } from "react";
import { MESSAGE_ACCESS_HINT } from "./message-access-hint";

function StepDone() {
  return <span className="text-xs font-medium text-ds-success">✓ Done</span>;
}

const STEPS = [
  {
    title: "Step 1 — Use a Business or Creator account",
    body: "Your Instagram account must be a professional account, not a personal one. In the Instagram app: Settings → Account type and tools → Switch to professional account.",
  },
  {
    title: "Step 2 — Link it to a Facebook Page",
    body: "On Facebook, open your Page → Settings → Linked accounts → Instagram → Connect, and log in to Instagram. No Page yet? Create one first — it only takes a minute.",
  },
  {
    title: "Step 3 — Allow message access",
    body: MESSAGE_ACCESS_HINT,
  },
  {
    title: "Step 4 — Connect",
    body: "Click “Connect Instagram”, log in with Facebook, choose the Page and its Instagram account, and approve. Your password is entered only on Facebook’s site.",
  },
];

export function InstagramSetupGuide({ hasConnection }: { hasConnection: boolean }) {
  // Open while there's no connection yet; once connected it recedes behind
  // "Show", same pattern as WhatsappSetupGuide.
  const [open, setOpen] = useState(!hasConnection);

  return (
    <section
      id="before-you-connect"
      className="flex scroll-mt-6 flex-col gap-4 border border-ds-border bg-ds-surface p-5"
    >
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex items-center justify-between gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary"
          aria-expanded={open}
        >
          <h2 className="text-lg font-medium text-ds-text-primary">Before you connect</h2>
          <span className="shrink-0 text-sm text-ds-text-muted">{open ? "Hide" : "Show"}</span>
        </button>
        <p className="text-sm text-ds-text-secondary">Four quick checks and you&rsquo;re ready.</p>
      </div>

      <ol className={open ? "flex flex-col gap-6" : "hidden"}>
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-1">
            <h3 className="flex items-center gap-2 text-sm font-medium text-ds-text-primary">
              {step.title}
              {hasConnection && index === STEPS.length - 1 ? <StepDone /> : null}
            </h3>
            <p className="text-sm text-ds-text-secondary">{step.body}</p>
          </li>
        ))}
        <li className="text-sm text-ds-text-secondary">
          Prospects can then DM your Instagram account and your AI sales employee replies within Instagram&rsquo;s
          24-hour reply window, using the same knowledge and rules as your website.
        </li>
      </ol>
    </section>
  );
}
