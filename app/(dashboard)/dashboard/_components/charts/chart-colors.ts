/**
 * Chart colours as CSS variable references into the design tokens in
 * `app/(dashboard)/globals.css`, so charts flip with the light/dark theme
 * and nothing is duplicated. Recharts writes these straight into SVG
 * `fill`/`stroke` presentation attributes, which resolve `var()`.
 * Dashboard palette: deep olive, electric lime, mid lime and a neutral grey.
 */
export const chartColors = {
  ink: "var(--ds-text-primary)",
  accent: "var(--ds-accent)",
  lime: "var(--ds-lime)",
  limeMid: "var(--ds-lime-mid)",
  olive: "var(--ds-primary)",
  neutral: "var(--ds-mark-neutral)",
  accentStrong: "var(--ds-accent-strong)",
  accentMuted: "var(--ds-text-faint)",
  success: "var(--ds-success)",
  warning: "var(--ds-warning)",
  danger: "var(--ds-danger)",
  textSecondary: "var(--ds-text-secondary)",
  textMuted: "var(--ds-text-muted)",
  border: "var(--ds-border)",
  surfaceElevated: "var(--ds-surface-raised)",
} as const;
