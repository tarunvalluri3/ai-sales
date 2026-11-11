/**
 * Shared Web Studio button class strings (no component, so call sites keep
 * their own props). Primary = paper fill / ink text in dark, inverted in
 * light; secondary = hairline outline whose border turns red on hover;
 * tertiary = underlined text link; destructive = secondary in red.
 */
const BASE = "ds-btn-label inline-flex items-center justify-center gap-2 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary";

export const buttonPrimary = `${BASE} h-12 bg-ds-primary px-8 text-ds-primary-on`;
export const buttonPrimaryCompact = `${BASE} h-10 bg-ds-primary px-6 text-xs text-ds-primary-on`;
export const buttonSecondary = `${BASE} h-12 border border-ds-text-primary px-8 text-ds-text-primary hover:border-ds-accent`;
export const buttonSecondaryCompact = `${BASE} h-10 border border-ds-text-primary px-6 text-xs text-ds-text-primary hover:border-ds-accent`;
export const buttonDestructive = `${BASE} h-12 border border-ds-danger px-8 text-ds-danger`;
export const buttonTertiary =
  "ds-label inline-flex items-center gap-2 border-b border-ds-text-primary py-3 text-xs tracking-[0.16em] text-ds-text-primary transition-colors duration-200 hover:border-ds-accent hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary";
