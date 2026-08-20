import type { IngestionStatus } from "@/lib/supabase/types";

const STATUS_LABEL: Record<IngestionStatus, string> = {
  pending: "Processing queued",
  processing: "Processing",
  complete: "Ready",
  failed: "Failed",
};

const STATUS_STYLE: Record<IngestionStatus, string> = {
  pending: "bg-ds-warning-bg text-ds-warning",
  processing: "bg-ds-warning-bg text-ds-warning",
  complete: "bg-ds-success-bg text-ds-success",
  failed: "bg-ds-danger-bg text-ds-danger",
};

/**
 * Per-document ingestion status (Phase 23 exit criterion: a forced
 * embedding failure must be visible here, not just in server logs).
 * `lastError` is only ever shown for 'failed' -- a title attribute,
 * since it's an internal error message, not something to feature
 * prominently in the list row.
 */
export function IngestionStatusPill({
  status,
  lastError,
}: {
  status: IngestionStatus;
  lastError: string | null;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-2xs font-medium ${STATUS_STYLE[status]}`}
      title={status === "failed" && lastError ? lastError : undefined}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
