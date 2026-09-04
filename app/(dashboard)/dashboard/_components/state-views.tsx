import type { ReactNode } from "react";

/**
 * Shared empty-state card (Phase 25c) -- replaces the two near-duplicate
 * hand-rolled empty-state stylings that had drifted across dashboard
 * pages (leads/conversations/audit-log used one padding/border variant,
 * knowledge/faqs/products/services another).
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-ds-lg border border-dashed border-ds-border bg-ds-surface px-4 py-14 text-center">
      <p className="text-sm font-medium text-ds-text-primary">{title}</p>
      {description ? <p className="max-w-sm text-xs text-ds-text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * Shared error-state card for a failed data load -- used both by
 * app/(dashboard)/dashboard/error.tsx (the segment-wide error boundary)
 * and anywhere a page wants to render an inline failure without
 * crashing the whole tree. `onRetry` is optional: error.tsx passes
 * Next's own `retry()`; a manual inline use can omit it.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "Please try again. If this keeps happening, it's on our end, not something you did.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-ds-lg border border-dashed border-ds-danger/40 bg-ds-danger-bg px-4 py-14 text-center"
    >
      <p className="text-sm font-medium text-ds-text-primary">{title}</p>
      <p className="max-w-sm text-xs text-ds-text-muted">{description}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-ds-sm bg-ds-accent px-3 py-1.5 text-xs font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/**
 * Replaces a role-gated form/control a viewer's role can't use (Phase
 * P2#10) -- server-side enforcement (lib/auth.ts's `requireMinRole()`)
 * was already safe before this; this just reflects it visually instead
 * of showing a control that would fail on submit. Message text matches
 * `requireMinRole()`'s own denial string by default so the two stay
 * consistent.
 */
export function PermissionNotice({
  message = "You don't have permission to do this.",
}: {
  message?: string;
}) {
  return (
    <p className="rounded-ds-lg border border-dashed border-ds-border bg-ds-surface px-4 py-3 text-xs text-ds-text-muted">
      {message}
    </p>
  );
}

/** A single skeleton block. Widths/heights are passed via className so callers can compose page-shaped skeletons without a prop explosion. */
function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-ds-sm bg-ds-surface-elevated ${className}`} />;
}

/**
 * Generic page-loading skeleton (Phase 25c) -- used by
 * app/(dashboard)/dashboard/loading.tsx, which Next.js wraps around
 * every nested dashboard page during navigation. Deliberately generic
 * (a heading bar + a few row-shaped blocks) rather than page-specific,
 * since one loading.tsx here covers all of them.
 */
export function DashboardLoadingSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-2">
        <SkeletonBlock className="h-7 w-48" />
        <SkeletonBlock className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
