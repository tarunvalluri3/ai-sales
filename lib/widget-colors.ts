/**
 * Widget reliability item 4 (STATE.md 2026-11-20): the widget's colours.
 *
 * The platform default primary is a neutral zinc (was "Signal Red"); a business
 * colour (businesses.widget_accent_color, a DB-checked 6-digit hex, published
 * in the agent snapshot) replaces it. Because the launcher and send button are
 * now FILLED with the primary, the icon colour on top of it is chosen for
 * contrast: dark ink on a light brand colour, white otherwise.
 * Pure, no I/O; shared by the widget and its tests.
 */

export const DEFAULT_WIDGET_PRIMARY = "#3f3f46";
const INK = "#111110";
const WHITE = "#ffffff";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** A safe CSS colour or null -- only ever a 6-digit hex reaches a CSS variable. */
export function sanitizeAccentColor(value: string | null | undefined): string | null {
  return typeof value === "string" && HEX.test(value) ? value.toLowerCase() : null;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a 6-digit hex. */
export function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio between two 6-digit hex colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The icon/text colour to put ON a primary-filled surface. */
export function readableOnColor(background: string): string {
  return contrastRatio(background, WHITE) >= contrastRatio(background, INK) ? WHITE : INK;
}

/** Composites an rgba() colour over an opaque background (for checking a translucent ring). */
export function compositeOver(rgb: [number, number, number], alpha: number, backgroundHex: string): string {
  const n = Number.parseInt(backgroundHex.slice(1), 16);
  const bg = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const mixed = rgb.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
