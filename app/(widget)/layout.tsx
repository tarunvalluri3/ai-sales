import { Inter } from "next/font/google";
import "./widget.css";

const inter = Inter({
  variable: "--widget-font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

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
