import type { Metadata } from "next";
import { Hanken_Grotesk, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { SiteHeader } from "./_components/site-header";
import { THEME_INIT_SCRIPT } from "./_components/theme-init-script";
import "./globals.css";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://ai-sales-ashy-eight.vercel.app"),
  title: "Waves AI Pilot",
  description: "An AI sales employee grounded in your business's own knowledge.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider
      taskUrls={{ "choose-organization": "/session-tasks/choose-organization" }}
    >
      <html
        lang="en"
        suppressHydrationWarning
        className={`${hanken.variable} ${spaceGrotesk.variable} h-full antialiased`}
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        </head>
        <body className="flex min-h-full flex-col bg-ds-bg">
          <SiteHeader />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
