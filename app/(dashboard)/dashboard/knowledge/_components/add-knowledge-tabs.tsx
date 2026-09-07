"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

type AddKnowledgeMethod = "manual" | "file" | "url";

const TABS: { id: AddKnowledgeMethod; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "file", label: "File" },
  { id: "url", label: "URL" },
];

/**
 * Single "Add knowledge" entry point replacing the three side-by-side
 * forms that used to render open by default (2026-09-08 layout pass,
 * closing out the same-day critique's last Priority Issue: "forces a
 * three-way decision before the owner has even looked at what they
 * already have"). All three forms stay mounted -- only `hidden` toggles
 * -- so switching tabs to peek at another method never discards a
 * half-typed manual entry or a chosen file. Tab labels reuse the exact
 * "Manual"/"File"/"URL" vocabulary the per-document source badges
 * already use elsewhere on this page (`SOURCE_LABEL` in `page.tsx`),
 * rather than inventing separate wording for the same three concepts.
 *
 * Arrow-key tablist navigation mirrors the same pattern already
 * established by `conversations-list.tsx`'s Needs attention/All tabs --
 * roving `tabIndex` alone only removes the unselected tab from the
 * Tab-key order, so this also needs the `onKeyDown` handler to let a
 * keyboard user actually reach it.
 */
export function AddKnowledgeTabs({
  manualForm,
  fileForm,
  urlForm,
}: {
  manualForm: ReactNode;
  fileForm: ReactNode;
  urlForm: ReactNode;
}) {
  const [method, setMethod] = useState<AddKnowledgeMethod>("manual");

  function handleTabListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const currentIndex = TABS.findIndex((t) => t.id === method);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(currentIndex + delta + TABS.length) % TABS.length];
    setMethod(next.id);
    document.getElementById(`add-knowledge-tab-${next.id}`)?.focus();
  }

  const panels: Record<AddKnowledgeMethod, ReactNode> = { manual: manualForm, file: fileForm, url: urlForm };

  return (
    <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-ds-text-primary">Add knowledge</h2>
        <p className="text-xs text-ds-text-secondary">Choose how you want to add this document.</p>
      </div>

      <div
        role="tablist"
        aria-label="Add knowledge method"
        onKeyDown={handleTabListKeyDown}
        className="inline-flex w-fit items-center gap-1 rounded-ds-lg border border-ds-border bg-ds-surface-elevated p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`add-knowledge-tab-${t.id}`}
            aria-selected={method === t.id}
            aria-controls={`add-knowledge-panel-${t.id}`}
            tabIndex={method === t.id ? 0 : -1}
            onClick={() => setMethod(t.id)}
            className={`rounded-ds-sm px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
              method === t.id
                ? "bg-dashboard-primary text-dashboard-on-primary"
                : "text-ds-text-secondary hover:bg-ds-surface-soft hover:text-ds-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {TABS.map((t) => (
        <div key={t.id} id={`add-knowledge-panel-${t.id}`} role="tabpanel" aria-labelledby={`add-knowledge-tab-${t.id}`} hidden={method !== t.id}>
          {panels[t.id]}
        </div>
      ))}
    </section>
  );
}
