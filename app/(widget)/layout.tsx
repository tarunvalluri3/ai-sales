import type { Viewport } from "next";
import { Inter } from "next/font/google";
import "./widget.css";

const inter = Inter({
  variable: "--widget-font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
