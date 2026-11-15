"use client";

import { useState, useTransition } from "react";
import { describeTemplateStatus, normaliseTemplateStatus } from "@/lib/whatsapp-embedded-signup-rules";
import { CalendarCheck, CalendarClock, CalendarDays, CalendarX, Info, RefreshCw } from "lucide-react";
import { Pill, btnGhost, btnPrimary, type PillTone } from "../_components/ui";
import { refreshWhatsappTemplatesAction, submitWhatsappTemplatesAction } from "./actions";

export type TemplatePanelRow = {
  name: string;
  purpose: string;
  status: string | null;
  rejectedReason: string | null;
  lastError: string | null;
};

const TONE: Record<"ok" | "wait" | "bad" | "none", PillTone> = {
  ok: "lime",
  wait: "amber",
  bad: "red",
  none: "gray",
};

function TemplateIcon({ name }: { name: string }) {
  const className = "size-5 shrink-0 text-ds-text-primary";
  if (name.includes("confirmed")) return <CalendarCheck className={className} strokeWidth={1.75} aria-hidden="true" />;
  if (name.includes("declined") || name.includes("cancelled")) return <CalendarX className={className} strokeWidth={1.75} aria-hidden="true" />;
  if (name.includes("reminder") || name.includes("expired")) return <CalendarClock className={className} strokeWidth={1.75} aria-hidden="true" />;
  return <CalendarDays className={className} strokeWidth={1.75} aria-hidden="true" />;
}

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
    <section aria-labelledby="wa-templates-heading" className="dx-card flex flex-col gap-4 dx-card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="wa-templates-heading" className="dx-title text-base">
            Message templates
          </h2>
          <p className="dx-subtitle text-base">Used for appointment updates outside the 24-hour messaging window.</p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={isPending} onClick={() => run(refreshWhatsappTemplatesAction)} className={btnGhost}>
              <RefreshCw className={`size-5 ${isPending ? "animate-spin" : ""}`} strokeWidth={1.75} aria-hidden="true" />
              Refresh status
            </button>
            {needsSubmit ? (
              <button type="button" disabled={isPending} onClick={() => run(submitWhatsappTemplatesAction)} className={btnPrimary}>
                {isPending ? "Working…" : "Submit for approval"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="flex items-center gap-3 rounded-xl bg-ds-surface-soft px-4 py-2 text-sm text-ds-text-primary">
        <Info className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Outside the 24-hour window, WhatsApp requires a Meta-approved template.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm font-medium text-ds-text-primary">
          {approved} of {rows.length} approved
        </p>
        <div className="flex gap-1" aria-hidden="true">
          {rows.map((row, index) => (
            <span key={row.name} className={`h-2 w-14 rounded-full ${index < approved ? "bg-ds-primary" : "bg-ds-surface-soft"}`} />
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              {["Template", "Template name", "Status", "Details"].map((heading) => (
                <th key={heading} scope="col" className="dx-th px-4 py-2.5">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const status = normaliseTemplateStatus(row.status) ?? "NOT_SUBMITTED";
              const described = describeTemplateStatus(status);
              return (
                <tr key={row.name}>
                  <td className="border-b border-ds-border px-4 py-2.5">
                    <span className="flex items-center gap-3 text-sm font-medium text-ds-text-primary">
                      <TemplateIcon name={row.name} />
                      {row.purpose}
                    </span>
                  </td>
                  <td className="border-b border-ds-border px-4 py-2.5 font-mono text-sm text-ds-text-primary">{row.name}</td>
                  <td className="border-b border-ds-border px-4 py-2.5">
                    <Pill tone={TONE[described.tone]} size="sm" className="font-medium">
                      {described.label}
                    </Pill>
                  </td>
                  <td className="border-b border-ds-border px-4 py-2.5 text-sm text-ds-text-primary">
                    {status === "REJECTED" ? (
                      <>Reason: {row.rejectedReason ?? "not given"}. Contact support so we can adjust the wording.</>
                    ) : status === "SUBMIT_FAILED" && row.lastError ? (
                      <span className="text-ds-danger">{row.lastError}</span>
                    ) : status === "APPROVED" ? (
                      "Ready to use."
                    ) : status === "NOT_SUBMITTED" ? (
                      "Not submitted yet."
                    ) : (
                      "Awaiting Meta review."
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="flex items-center gap-3 text-sm text-ds-text-secondary">
        <Info className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Approval decisions are made by Meta.
      </p>

      <div aria-live="polite">
        {feedback ? (
          <p
            role={feedback.tone === "error" ? "alert" : undefined}
            className={`rounded-xl px-3 py-2 text-sm ${feedback.tone === "error" ? "bg-ds-danger-bg text-ds-danger" : "bg-ds-success-bg text-ds-success"}`}
          >
            {feedback.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}
