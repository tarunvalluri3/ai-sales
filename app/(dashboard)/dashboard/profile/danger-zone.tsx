"use client";

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
  link.href = url;
  link.download = `${businessName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-export-${dateStamp}.json`;
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
      const result = await exportBusinessDataAction();
      if (result.error || !result.json) {
        setExportError(result.error ?? "Something went wrong preparing your export.");
        return;
      }
      downloadJson(result.json, businessName);
    });
  }

  return (
    <div className="flex w-full max-w-lg flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-ds-text-primary">Export your data</h2>
          <p className="text-sm text-ds-text-secondary">
            Download everything this business owns — profile, products, services, FAQs, knowledge,
            conversations, messages, leads, and the audit log — as a single JSON file.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          className="w-fit rounded-ds-sm border border-ds-border-strong px-4 py-2 text-sm font-medium text-ds-text-primary transition-colors hover:border-ds-accent-muted disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          {isExporting ? "Preparing export…" : "Download my data"}
        </button>
        {exportError ? <p className="text-sm text-ds-danger">{exportError}</p> : null}
      </section>

      <section className="flex flex-col gap-3 rounded-ds-lg border border-ds-danger/40 bg-ds-surface p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-ds-danger">Delete this business</h2>
          <p className="text-sm text-ds-text-secondary">
            Permanently deletes this business and everything it owns — products, services, FAQs,
            knowledge, conversations, messages, and leads. This cannot be undone. Your team&apos;s
            organization and sign-in access are not affected.
          </p>
        </div>
        <form action={deleteAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="confirmName" className="text-sm font-medium text-ds-text-secondary">
              Type <span className="font-semibold text-ds-text-primary">{businessName}</span> to confirm
            </label>
            <input
              id="confirmName"
              name="confirmName"
              type="text"
              autoComplete="off"
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              disabled={isDeletePending}
              className="rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary transition-colors focus:border-ds-danger focus:outline-none disabled:opacity-60"
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
            className="w-fit rounded-ds-sm bg-ds-danger px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ds-danger/90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-danger"
          >
            {isDeletePending ? "Deleting…" : "Permanently delete this business"}
          </button>
        </form>
      </section>
    </div>
  );
}
