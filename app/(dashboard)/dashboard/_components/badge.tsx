import type { ReactNode } from "react";

export type BadgeTone = "warning" | "success" | "danger" | "muted" | "accent";

const TONE_STYLE: Record<BadgeTone, string> = {
  warning: "bg-ds-warning-bg text-ds-warning",
  success: "bg-ds-success-bg text-ds-success",
  danger: "bg-ds-danger-bg text-ds-danger",
  muted: "bg-ds-surface-soft text-ds-text-secondary",
  accent: "bg-ds-primary/10 text-ds-primary",
};

/**
 * Small rounded status pill, shared across the dashboard (control state, lead
 * qualification, list-row status, tag chips). Tones keep their semantic names
 * so every existing call site and the stored `lead_tags.color` values still
 * map; the palette is the dashboard one: pale green for "good", amber for
 * "needs a look", pale red for failures, grey for neutral. `ds-label` and
 * `dx-pill` are what let /apache and onboarding, which reuse this, keep
 * the sharp uppercase Web Studio tag while the dashboard gets a pill.
 */
export function Badge({
  tone,
  size = "md",
  title,
  children,
}: {
  tone: BadgeTone;
  size?: "sm" | "md";
  title?: string;
  children: ReactNode;
}) {
  const sizeClass = size === "sm" ? "px-2.5 py-0.5 text-2xs" : "px-3 py-1 text-2xs";
  return (
    <span
      title={title}
      className={`ds-label dx-pill inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap ${sizeClass} ${TONE_STYLE[tone]}`}
    >
      {children}
    </span>
  );
}
