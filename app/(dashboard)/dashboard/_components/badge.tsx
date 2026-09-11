import type { ReactNode } from "react";

export type BadgeTone = "warning" | "success" | "danger" | "muted" | "accent";

const TONE_STYLE: Record<BadgeTone, string> = {
  warning: "bg-ds-warning-bg text-ds-warning",
  success: "bg-ds-success-bg text-ds-success",
  danger: "bg-ds-danger-bg text-ds-danger",
  muted: "bg-ds-surface-soft text-ds-text-secondary",
  accent: "bg-ds-accent-soft-bg text-ds-accent-muted",
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
      className={`rounded-ds-sm ${sizeClass} text-2xs font-semibold tracking-wide-ds uppercase ${TONE_STYLE[tone]}`}
    >
      {children}
    </span>
  );
}
