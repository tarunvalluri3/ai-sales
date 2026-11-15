import type { ComponentType } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true"; strokeWidth?: number }>;

/**
 * Headline metric card. `href` is optional (Phase 21): a tile with no natural
 * destination renders as a plain card instead of a link, rather than being
 * forced to point somewhere unrelated. `highlight` is the one lime-filled
 * tile in a row (the overview's lead metric); `attention` adds the amber dot
 * used for "needs attention" counts.
 */
export function KpiTile({
  label,
  value,
  suffix,
  hint,
  href,
  icon: Icon,
  highlight = false,
  attention = false,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  hint?: string;
  href?: string;
  icon?: IconType;
  highlight?: boolean;
  attention?: boolean;
}) {
  const content = (
    <>
      <span className={`ds-label flex items-center gap-2 ${highlight ? "text-ds-on-bright" : "text-ds-text-secondary"}`}>
        {Icon ? <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" /> : null}
        {label}
        {attention ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-ds-attention" /> : null}
      </span>
      <span className="flex items-end justify-between gap-3">
        <span className="flex flex-col gap-1">
          <span className={`font-label text-3xl leading-none font-normal tabular-nums ${highlight ? "text-ds-on-bright" : "text-ds-text-primary"}`}>
            {value}
            {suffix}
          </span>
          {hint ? (
            <span className={`text-xs ${highlight ? "text-ds-on-bright" : attention ? "text-ds-warning" : "text-ds-text-secondary"}`}>{hint}</span>
          ) : null}
        </span>
        {href ? (
          <span
            aria-hidden="true"
            className={`flex size-8 shrink-0 items-center justify-center rounded-full text-ds-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${
              highlight ? "bg-ds-surface" : attention ? "bg-ds-surface" : "bg-ds-surface-soft"
            }`}
          >
            <ArrowUpRight className="size-4" strokeWidth={1.75} />
          </span>
        ) : null}
      </span>
    </>
  );

  const shell = `group flex flex-col justify-between gap-3 rounded-3xl p-5 ${
    highlight
      ? "bg-ds-lime"
      : attention
        ? "border border-ds-warning/40 bg-ds-warning-bg"
        : "border border-ds-border bg-ds-surface"
  }`;

  if (!href) {
    return <div className={shell}>{content}</div>;
  }

  return (
    <Link
      href={href}
      className={`${shell} transition-shadow hover:shadow-float focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary`}
    >
      {content}
    </Link>
  );
}
