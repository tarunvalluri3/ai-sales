"use client";

import { useState, useTransition } from "react";
import { retryWhatsappSetupAction } from "./actions";

/** Re-runs the Embedded Signup steps that failed, with the stored token (production readiness item 6). */
export function FinishSetupButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await retryWhatsappSetupAction();
            if (!outcome.ok) setResult({ tone: "error", text: outcome.error });
            else if (outcome.complete) setResult({ tone: "ok", text: "Setup finished. WhatsApp is connected." });
            else setResult({ tone: "error", text: outcome.message ?? "That step still didn't finish." });
          })
        }
        className="self-start rounded-ds-sm bg-ds-accent px-3 py-1.5 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? "Finishing setup…" : "Finish setup"}
      </button>
      <div aria-live="polite">
        {result ? (
          <p
            role={result.tone === "error" ? "alert" : undefined}
            className={`rounded-ds-sm px-3 py-2 text-xs ${result.tone === "error" ? "bg-ds-danger-bg text-ds-danger" : "bg-ds-success-bg text-ds-success"}`}
          >
            {result.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
