"use client";

import { useState } from "react";
import { ChevronDown, ClipboardList } from "lucide-react";
import {
  BUSINESS_MANAGER_URL,
  DEVELOPER_APPS_URL,
  SYSTEM_USERS_URL,
  WHATSAPP_MANAGER_URL,
} from "./connect-whatsapp-form";

const linkClasses = "font-medium text-ds-primary underline underline-offset-4";

function StepDone() {
  return <span className="dx-pill bg-ds-success-bg px-2.5 py-0.5 text-xs font-medium text-ds-success">Done</span>;
}

export function WhatsappSetupGuide({ hasConnection }: { hasConnection: boolean }) {
  // Open by default while there's no connection yet (the guide's entire job);
  // once connected, this business has already followed it, so it recedes
  // behind "Show" instead of reopening the same wall of steps on every visit.
  const [open, setOpen] = useState(!hasConnection);

  return (
    <section className="dx-card flex flex-col px-5 py-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
        aria-expanded={open}
      >
        <ClipboardList className="size-5 shrink-0 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" />
        <h2 className="dx-title text-lg">Set up WhatsApp with Meta</h2>
        <span className="text-sm text-ds-text-secondary">~10 min · Business account, app and number setup</span>
        <ChevronDown strokeWidth={1.75} className={`ml-auto size-5 shrink-0 text-ds-text-primary transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      <div className={open ? "mt-4 flex flex-col gap-5 border-t border-ds-border pt-4" : "hidden"}>
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-ds-text-primary">Have a Meta Business account?</h3>
          <p className="text-sm text-ds-text-secondary">
            If you don&rsquo;t already manage your business&rsquo;s Facebook Page or ads through Meta
            Business Manager,{" "}
            <a href={BUSINESS_MANAGER_URL} target="_blank" rel="noreferrer" className={linkClasses}>
              create a Meta Business account
            </a>{" "}
            first — it&rsquo;s free and only takes a minute. Already have one? Skip to Step 1.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-ds-text-primary">Step 1 — Create a Meta app and add WhatsApp</h3>
          <p className="text-sm text-ds-text-secondary">
            In{" "}
            <a href={DEVELOPER_APPS_URL} target="_blank" rel="noreferrer" className={linkClasses}>
              Meta for Developers
            </a>
            , click &ldquo;Create App,&rdquo; choose the &ldquo;Business&rdquo; type, and add the
            &ldquo;WhatsApp&rdquo; product when prompted. Meta connects it to your Business account
            automatically.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-ds-text-primary">
            Step 2 — Find your phone number ID and account ID
          </h3>
          <p className="text-sm text-ds-text-secondary">
            Open{" "}
            <a href={WHATSAPP_MANAGER_URL} target="_blank" rel="noreferrer" className={linkClasses}>
              WhatsApp Manager
            </a>{" "}
            and click your number. You&rsquo;ll see the phone number ID and WhatsApp Business Account
            (WABA) ID listed right there, along with the phone number itself — copy all three.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-ds-text-primary">Step 3 — Generate a permanent access token</h3>
          <p className="text-sm text-ds-text-secondary">
            Meta&rsquo;s API Setup page shows a token that expires in 24 hours — don&rsquo;t use that
            one. Instead, go to{" "}
            <a href={SYSTEM_USERS_URL} target="_blank" rel="noreferrer" className={linkClasses}>
              System Users
            </a>
            , create (or reuse) a system user with WhatsApp messaging access, and generate a token for
            it. That token stays valid until you revoke it.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2 text-sm font-medium text-ds-text-primary">
            Step 4 — Paste everything into the form below
            {hasConnection ? <StepDone /> : null}
          </h3>
          <p className="text-sm text-ds-text-secondary">
            Enter all four values below and click &ldquo;Connect.&rdquo; We verify them directly with
            Meta before saving, so you&rsquo;ll know right away if anything needs fixing.
          </p>
        </div>
      </div>
    </section>
  );
}
