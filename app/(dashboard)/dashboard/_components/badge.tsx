import type { ReactNode } from "react";

export type BadgeTone = "warning" | "success" | "danger" | "muted" | "accent";

const TONE_STYLE: Record<BadgeTone, string> = {
  warning: "border-ds-warning/40 bg-ds-warning-bg text-ds-warning",
  success: "border-ds-success/40 bg-ds-success-bg text-ds-success",
  danger: "border-ds-danger/40 bg-ds-danger-bg text-ds-danger",
  muted: "border-ds-border text-ds-text-secondary",
  accent: "border-ds-accent/40 bg-ds-accent-soft-bg text-ds-accent",
};

/**
 * Small uppercase status pill -- consolidates what used to be three
 * separate ad-hoc `<span>` implementations across the conversations
 * feature (control state, lead qualification, list-row status). Not
 * wired into other pages' existing badges (leads-list.tsx,
 * appointments-table.tsx, etc.) in this pass -- a legitimate follow-up,
 * not part of this redesign's scope.
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
  const sizeClass = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";
  return (
    <span
      title={title}
      className={`ds-label inline-flex items-center gap-1.5 border ${sizeClass} text-2xs ${TONE_STYLE[tone]}`}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  );
}
