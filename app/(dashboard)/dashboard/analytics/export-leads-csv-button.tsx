"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { exportLeadsCsvAction } from "./actions";

function downloadCsv(csv: string, businessName: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `${businessName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-leads-${dateStamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ExportLeadsCsvButton({ businessName }: { businessName: string }) {
  const [isExporting, startExport] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    setError(null);
    startExport(async () => {
      const result = await exportLeadsCsvAction();
      if (result.error || !result.csv) {
        setError(result.error ?? "Something went wrong preparing your export.");
        return;
      }
      downloadCsv(result.csv, businessName);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleExport}
        disabled={isExporting}
        className="ds-btn-label inline-flex h-9 items-center gap-2 rounded-xl border border-ds-border-strong bg-ds-surface px-4 text-sm text-ds-text-primary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        <Download className="size-5" strokeWidth={1.75} aria-hidden="true" />
        {isExporting ? "Preparing…" : "Export leads (CSV)"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
