import type { ReactNode } from "react";

export type ChipTone = "default" | "accent" | "success" | "warning" | "danger";

const CHIP_TONE: Record<ChipTone, string> = {
  default: "border-ds-border text-ds-text-muted",
  accent: "border-ds-accent-muted text-ds-accent-muted",
  success: "border-ds-success/40 text-ds-success",
  warning: "border-ds-warning/40 text-ds-warning",
  danger: "border-ds-danger/40 text-ds-danger",
};

/** Monospace micro-label chip -- `SOURCE · Pricing FAQ`, `LEAD · WARM`. */
export function MicroChip({
  tone = "default",
  className = "",
  children,
}: {
  tone?: ChipTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-ds-sm border ${CHIP_TONE[tone]} px-1.5 py-0.5 font-mono text-[0.625rem] tracking-wide-ds uppercase ${className}`}
    >
      {children}
    </span>
  );
}

const STATUS_ROW_TONE: Record<"accent" | "success" | "warning", string> = {
  accent: "border-ds-accent-muted bg-ds-accent-soft-bg",
  success: "border-ds-success/30 bg-ds-success-bg",
  warning: "border-ds-warning/30 bg-ds-warning-bg",
};

/** A labeled accent row -- lead-captured / handoff event rows share this shape. */
export function StatusRow({
  label,
  detail,
  tone = "accent",
}: {
  label: string;
  detail: string;
  tone?: "accent" | "success" | "warning";
}) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-ds-sm border px-3 py-2 ${STATUS_ROW_TONE[tone]}`}>
      <span className="font-mono text-[0.625rem] tracking-wide-ds text-ds-text-primary uppercase">{label}</span>
      <span className="text-2xs text-ds-text-secondary">{detail}</span>
    </div>
  );
}

/** Thin outer card every fragment shares -- a hairline border + surface fill. */
export function FragmentCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-ds-lg border border-ds-border bg-ds-surface transition-colors duration-300 hover:border-ds-border-strong ${className}`}
    >
      {children}
    </div>
  );
}
