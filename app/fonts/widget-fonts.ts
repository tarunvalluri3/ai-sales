import localFont from "next/font/local";

// Fonts for the widget root layout (app/(widget)/layout.tsx): the same Hanken files as the dashboard, and the 500-only Space Grotesk cut the widget always used.
// Self-hosted: nothing is fetched from Google at build or run time. These are
// the exact subset files and unicode ranges next/font/google used to download
// (SIL OFL 1.1, see OFL.txt in each font folder). Each subset is its own call
// so it keeps its own unicode-range under ONE shared family name, and the
// browser fetches a subset only when the page uses one of its characters. Only
// latin is preloaded and carries the metric-adjusted Arial fallback, as before.
// next/font needs literal option values, so the ranges are written out.

const hankenLatin = localFont({
  src: "./hanken-grotesk/latin.woff2",
  weight: "300 500",
  variable: "--widget-font-sans",
  declarations: [
    { prop: "font-family", value: "Hanken Grotesk" },
    { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  ],
});

const hankenLatinExt = localFont({
  src: "./hanken-grotesk/latin-ext.woff2",
  weight: "300 500",
  variable: "--widget-font-sans-latin-ext",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Hanken Grotesk" },
    { prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" },
  ],
});

const hankenVietnamese = localFont({
  src: "./hanken-grotesk/vietnamese.woff2",
  weight: "300 500",
  variable: "--widget-font-sans-vietnamese",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Hanken Grotesk" },
    { prop: "unicode-range", value: "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB" },
  ],
});

const hankenCyrillicExt = localFont({
  src: "./hanken-grotesk/cyrillic-ext.woff2",
  weight: "300 500",
  variable: "--widget-font-sans-cyrillic-ext",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Hanken Grotesk" },
    { prop: "unicode-range", value: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F" },
  ],
});

const spaceLatin = localFont({
  src: "./space-grotesk/latin-500.woff2",
  weight: "500",
  variable: "--widget-font-label",
  declarations: [
    { prop: "font-family", value: "Space Grotesk" },
    { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  ],
});

const spaceLatinExt = localFont({
  src: "./space-grotesk/latin-ext-500.woff2",
  weight: "500",
  variable: "--widget-font-label-latin-ext",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Space Grotesk" },
    { prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" },
  ],
});

const spaceVietnamese = localFont({
  src: "./space-grotesk/vietnamese-500.woff2",
  weight: "500",
  variable: "--widget-font-label-vietnamese",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Space Grotesk" },
    { prop: "unicode-range", value: "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB" },
  ],
});

/** Class names for <html>: defines --widget-font-sans and --widget-font-label, and pulls in every subset's @font-face. */
export const widgetFontVariables = [
  hankenLatin,
  hankenLatinExt,
  hankenVietnamese,
  hankenCyrillicExt,
  spaceLatin,
  spaceLatinExt,
  spaceVietnamese,
]
  .map((font) => font.variable)
  .join(" ");
