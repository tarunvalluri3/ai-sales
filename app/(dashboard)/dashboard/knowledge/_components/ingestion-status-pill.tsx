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
 * The pill itself only ever carries the short status word -- the
 * failure reason (when present) is a sibling `IngestionErrorMessage`
 * rendered as normal visible text under the row, not squeezed into this
 * pill or hidden behind a hover-only title attribute (2026-09-08
 * clarify pass: a `title` is invisible on touch and easy to miss on
 * desktop, and the row already has vertical room for a second line).
 */
export function IngestionStatusPill({ status }: { status: IngestionStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-2xs font-medium transition-colors ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Visible failure reason for a dead-lettered ('failed') document.
 * `lastError` is already a safe, vetted message by the time it reaches
 * here (lib/ingestion-queue.ts's `safeIngestionErrorMessage` -- never
 * the raw internal exception detail), so it's fine to render as-is.
 */
export function IngestionErrorMessage({ lastError }: { lastError: string | null }) {
  if (!lastError) {
    return null;
  }

  return (
    <p role="alert" className="text-xs text-ds-danger">
      Couldn&rsquo;t process this document: {lastError}
    </p>
  );
}
