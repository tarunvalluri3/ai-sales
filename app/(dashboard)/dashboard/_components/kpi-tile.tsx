import Link from "next/link";

/**
 * `href` is optional (Phase 21) -- a tile with no natural destination
 * page (e.g. an aggregate metric with no detail view of its own) renders
 * as a plain, non-interactive card instead of a link, rather than being
 * forced to point somewhere unrelated.
 */
export function KpiTile({
  label,
  value,
  suffix,
  hint,
  href,
}: {
  label: string;
  value: number;
  suffix?: string;
  hint?: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">
        {label}
      </span>
      <span className="text-3xl font-semibold text-ds-text-primary">
        {value}
        {suffix}
      </span>
      {hint ? <span className="text-xs text-ds-text-secondary">{hint}</span> : null}
    </>
  );

  if (!href) {
    return (
      <div className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-5 transition-colors hover:border-ds-border-strong hover:bg-ds-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
    >
      {content}
    </Link>
  );
}
