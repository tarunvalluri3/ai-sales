"use client";

import { TriangleAlert } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { deleteBusinessAction, exportBusinessDataAction } from "./actions";
import type { DeleteBusinessState } from "./actions";

const initialDeleteState: DeleteBusinessState = {};

function downloadJson(json: string, businessName: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateStamp = new Date().toISOString().slice(0, 10);
  // ASCII-only sanitizer: a name in a non-Latin script (CJK, Arabic, etc.)
  // strips to nothing, so fall back to a generic slug rather than shipping
  // a leading-hyphen or blank filename.
  const slug =
    businessName
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "business";
  link.href = url;
  link.download = `${slug}-export-${dateStamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function DangerZone({ businessName }: { businessName: string }) {
  const reduceMotion = useReducedMotion();
  const [isExporting, startExport] = useTransition();
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleteState, deleteAction, isDeletePending] = useActionState(
    deleteBusinessAction,
    initialDeleteState,
  );

  function handleExport() {
    setExportError(null);
    startExport(async () => {
      try {
        const result = await exportBusinessDataAction();
        if (result.error || !result.json) {
          setExportError(result.error ?? "Something went wrong preparing your export.");
          return;
        }
        downloadJson(result.json, businessName);
      } catch {
        // The action itself catches and returns known failures -- this
        // only guards a transport-level failure calling it in the first
        // place (offline, timeout), which surfaces as a thrown rejection
        // rather than a returned `{ error }`.
        setExportError("Something went wrong preparing your export. Check your connection and try again.");
      }
    });
  }

  return (
    <details className="dx-card group w-full overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ds-primary [&::-webkit-details-marker]:hidden">
        <TriangleAlert className="size-6 shrink-0 text-ds-danger" strokeWidth={1.75} aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm leading-tight font-medium text-ds-text-primary">Danger zone</span>
          <span className="text-sm text-ds-text-secondary">Export your data or permanently delete this business.</span>
        </span>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="shrink-0 rotate-90 text-ds-text-primary transition-transform duration-150 group-open:-rotate-90"
        >
          <path
            d="M9 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>

      <div className="grid grid-cols-1 gap-4 border-t border-ds-border dx-card-pad lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-2xl border border-ds-border p-5">
          <div className="flex flex-col gap-1">
            <h2 className="dx-title">Export your data</h2>
            <p className="text-sm text-ds-text-secondary">
              Download everything this business owns — profile, products, services, FAQs, knowledge,
              conversations, messages, leads, and the audit log — as a single JSON file.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="ds-btn-label inline-flex h-9 w-fit items-center rounded-xl border border-ds-border-strong bg-ds-surface px-4 text-sm text-ds-text-primary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
          >
            {isExporting ? "Preparing export…" : "Download my data"}
          </button>
          {exportError ? <p className="text-sm text-ds-danger">{exportError}</p> : null}
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-ds-danger/40 bg-ds-danger-bg/40 p-5">
          <div className="flex flex-col gap-1">
            <h2 className="dx-title text-ds-danger">Delete this business</h2>
            <p className="text-sm text-ds-text-secondary">
              Permanently deletes this business and everything it owns — products, services, FAQs,
              knowledge, conversations, messages, and leads. This cannot be undone. Your team&apos;s
              organization and sign-in access are not affected.
            </p>
          </div>
          <form action={deleteAction} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="confirmName" className="text-sm font-medium text-ds-text-primary">
                Type <span className="font-medium">{businessName}</span> to confirm
              </label>
              <input
                id="confirmName"
                name="confirmName"
                type="text"
                autoComplete="off"
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
                disabled={isDeletePending}
                className="h-10 w-full rounded-xl border border-ds-border-strong bg-ds-surface px-3.5 text-sm text-ds-text-primary transition-colors focus:border-ds-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-danger disabled:opacity-60"
              />
            </div>
            <AnimatePresence mode="wait">
              {deleteState.error ? (
                <motion.p
                  key="delete-error"
                  role="alert"
                  className="text-sm text-ds-danger"
                  initial={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {deleteState.error}
                </motion.p>
              ) : null}
            </AnimatePresence>
            <button
              type="submit"
              disabled={isDeletePending || confirmName !== businessName}
              className="ds-btn-label inline-flex h-9 w-fit items-center rounded-xl bg-ds-danger px-4 text-sm text-ds-danger-on transition-colors hover:bg-ds-danger/90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-danger"
            >
              {isDeletePending ? "Deleting…" : "Permanently delete this business"}
            </button>
          </form>
        </section>
      </div>
    </details>
  );
}
