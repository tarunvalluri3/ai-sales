import type { Viewport } from "next";
import { Hanken_Grotesk, Space_Grotesk } from "next/font/google";
import "./widget.css";

const hanken = Hanken_Grotesk({
  variable: "--widget-font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--widget-font-label",
  subsets: ["latin"],
  weight: ["500"],
});

// The widget's own document (loaded via <iframe src="/widget/embed">) had no
// viewport meta of its own, which can leave mobile Safari/Chrome scaling the
// iframe's content incorrectly. Deliberately doesn't set maximumScale/
// userScalable=false -- that would disable pinch-zoom, an accessibility
// regression (WCAG 1.4.4), not a fix.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Independent root layout for the (widget) route group -- no ClerkProvider,
 * no dashboard header, no shared <html>/<body> with app/(dashboard)/layout.tsx.
 * A prospect must never see any dashboard chrome or load Clerk.
 */
export default function WidgetRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${hanken.variable} ${spaceGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
