"use client";

import { useState, useTransition } from "react";
import { describeTemplateStatus, normaliseTemplateStatus } from "@/lib/whatsapp-embedded-signup-rules";
import { Badge, type BadgeTone } from "../_components/badge";
import { refreshWhatsappTemplatesAction, submitWhatsappTemplatesAction } from "./actions";

export type TemplatePanelRow = {
  name: string;
  purpose: string;
  status: string | null;
  rejectedReason: string | null;
  lastError: string | null;
};

const TONE: Record<"ok" | "wait" | "bad" | "none", BadgeTone> = {
  ok: "success",
  wait: "muted",
  bad: "danger",
  none: "muted",
};

/**
 * This business's appointment message templates and Meta's review status for
 * each (production readiness item 6). WhatsApp only allows a template outside
 * the 24-hour reply window, so until a template is approved, that notice is
 * not sent on WhatsApp (and the conversation is flagged instead).
 */
export function WhatsappTemplatesPanel({ rows, canEdit }: { rows: TemplatePanelRow[]; canEdit: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const needsSubmit = rows.some((row) => row.status === null || row.status === "NOT_SUBMITTED" || row.status === "SUBMIT_FAILED");
  const approved = rows.filter((row) => normaliseTemplateStatus(row.status) === "APPROVED").length;

  function run(action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback(result.ok ? { tone: "ok", text: result.message } : { tone: "error", text: result.error });
    });
  }

  return (
    <section aria-labelledby="wa-templates-heading" className="flex flex-col gap-4 border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="wa-templates-heading" className="text-base font-medium text-ds-text-primary">
            Message templates
          </h2>
          <p className="max-w-2xl text-sm text-ds-text-secondary">
            WhatsApp only lets businesses message a customer more than 24 hours after their last message using a
            template Meta has approved. These carry your appointment notices. {approved} of {rows.length} approved.
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {needsSubmit ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(submitWhatsappTemplatesAction)}
                className="ds-btn-label bg-ds-primary px-3 py-1.5 text-sm font-medium text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary"
              >
                {isPending ? "Working…" : "Submit for approval"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(refreshWhatsappTemplatesAction)}
              className="border border-ds-border-strong px-3 py-1.5 text-sm font-medium text-ds-text-primary transition-colors hover:border-ds-accent disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary"
            >
              Refresh status
            </button>
          </div>
        ) : null}
      </div>

      <ul className="flex flex-col divide-y divide-ds-border">
        {rows.map((row) => {
          const status = normaliseTemplateStatus(row.status) ?? "NOT_SUBMITTED";
          const described = describeTemplateStatus(status);
          return (
            <li key={row.name} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-ds-text-primary">{row.purpose}</span>
                <span className="font-mono text-2xs text-ds-text-muted">{row.name}</span>
              </div>
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <Badge tone={TONE[described.tone]} size="sm">
                  {described.label}
                </Badge>
                {status === "REJECTED" ? (
                  <span className="text-2xs text-ds-text-muted">
                    Reason: {row.rejectedReason ?? "not given"}. Contact support so we can adjust the wording.
                  </span>
                ) : null}
                {status === "SUBMIT_FAILED" && row.lastError ? (
                  <span className="max-w-sm text-2xs text-ds-danger">{row.lastError}</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div aria-live="polite">
        {feedback ? (
          <p
            role={feedback.tone === "error" ? "alert" : undefined}
            className={`px-3 py-2 text-sm ${feedback.tone === "error" ? "bg-ds-danger-bg text-ds-danger" : "bg-ds-success-bg text-ds-success"}`}
          >
            {feedback.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}
