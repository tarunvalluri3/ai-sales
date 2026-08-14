/**
 * Literal hex values mirroring the CSS custom properties in
 * `app/(dashboard)/globals.css`. Recharts renders to raw SVG and cannot
 * reliably resolve `var(--ds-*)` for fill/stroke props, so this is the one
 * place those values are duplicated — keep it in sync with globals.css.
 */
export const chartColors = {
  accent: "#d7f24e",
  accentStrong: "#e8ff5e",
  accentMuted: "#9aab5c",
  success: "#9ecb4f",
  warning: "#d9a94f",
  danger: "#e0664f",
  textSecondary: "#a8a190",
  textMuted: "#746e5f",
  border: "rgba(242, 237, 225, 0.1)",
  surfaceElevated: "#1e1b13",
} as const;
