"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DataTable, TableRow, TableCell } from "@/app/(dashboard)/dashboard/_components/data-table";
import { retryFailedJob } from "@/lib/admin-job-actions";
import type { FailedJobRow } from "@/lib/admin-jobs";

const COLUMNS = [
  { key: "summary", label: "Job", width: "2fr" },
  { key: "businessName", label: "Tenant" },
  { key: "attempts", label: "Attempts" },
  { key: "updatedAt", label: "Last tried" },
  { key: "actions", label: "" },
];

function RetryButton({ queue, id }: { queue: FailedJobRow["queue"]; id: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleRetry() {
    setError(null);
    startTransition(async () => {
      const result = await retryFailedJob(queue, id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleRetry}
        disabled={isPending}
        className="text-xs font-medium text-ds-text-secondary transition-colors hover:text-ds-text-primary disabled:opacity-50"
      >
        {isPending ? "Retrying…" : "Retry"}
      </button>
      {error ? <span className="text-2xs text-ds-danger">{error}</span> : null}
    </div>
  );
}

export function FailedJobsTable({ failures }: { failures: FailedJobRow[] }) {
  return (
    <DataTable
      items={failures}
      columns={COLUMNS}
      getRowId={(f) => `${f.queue}-${f.id}`}
      caption="Recent failures"
      emptyState="No failed jobs right now."
      renderRow={(f) => (
        <TableRow>
          <TableCell direction="col">
            <span className="font-medium text-ds-text-primary">{f.summary}</span>
            {f.lastError ? <span className="truncate text-xs text-ds-danger">{f.lastError}</span> : null}
          </TableCell>
          <TableCell>{f.businessName}</TableCell>
          <TableCell>{f.attempts}</TableCell>
          <TableCell>{f.updatedAt ? new Date(f.updatedAt).toLocaleString() : "—"}</TableCell>
          <TableCell align="right">
            <RetryButton queue={f.queue} id={f.id} />
          </TableCell>
        </TableRow>
      )}
    />
  );
}
