import type { ComponentType, ReactNode } from "react";
import { btnPrimary } from "./ui";

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
    <div className="dx-card flex flex-col items-center gap-3 px-4 py-14 text-center">
      <p className="text-sm font-medium text-ds-text-primary">{title}</p>
      {description ? <p className="max-w-sm text-xs text-ds-text-secondary">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * Lighter empty-state treatment for a spot already living inside its own
 * bordered card/section (a chart, a dashboard-home widget column) --
 * `EmptyState` above owns its own dashed-border card, which would double
 * up visually nested inside another card. No border here, just a muted
 * icon + label, sized to sit naturally in a compact slot.
 */
export function InlineEmptyState({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean; strokeWidth?: number }>;
  label: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
      <Icon className="size-5 text-ds-text-muted" strokeWidth={1.75} aria-hidden={true} />
      <p className="text-sm text-ds-text-muted">{label}</p>
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
      className="flex flex-col items-center gap-3 rounded-3xl border border-ds-danger/30 bg-ds-danger-bg px-4 py-14 text-center"
    >
      <p className="text-sm font-medium text-ds-text-primary">{title}</p>
      <p className="max-w-sm text-xs text-ds-text-secondary">{description}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className={`${btnPrimary} mt-2`}
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
    <p className="rounded-2xl bg-ds-surface-soft px-4 py-3 text-sm leading-relaxed text-ds-text-secondary">
      {message}
    </p>
  );
}

/** A single skeleton block. Widths/heights are passed via className so callers can compose page-shaped skeletons without a prop explosion. */
function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-xl bg-ds-surface-soft ${className}`} />;
}

/**
 * Generic page-loading skeleton (Phase 25c) -- used by
 * app/(dashboard)/dashboard/loading.tsx, which Next.js wraps around every
 * nested dashboard page during navigation. Shaped like the common page:
 * title block, then the "work + aside" split most sections use, so the
 * swap to real content does not jump.
 */
export function DashboardLoadingSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-2 pb-1">
        <SkeletonBlock className="h-7 w-48" />
        <SkeletonBlock className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="dx-card dx-card-pad flex flex-col gap-4">
          <SkeletonBlock className="h-5 w-40" />
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-10 w-full" />
          ))}
        </div>
        <div className="dx-card dx-card-pad hidden flex-col gap-4 xl:flex">
          <SkeletonBlock className="h-5 w-32" />
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
