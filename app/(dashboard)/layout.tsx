import type { Metadata } from "next";
import { Hanken_Grotesk, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { SiteHeader } from "./_components/site-header";
import { SiteFooter } from "@/components/site/site-footer";
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://aipilot.waveswebstudio.in"),
  // Plain default (no title template): every page already sets its full
  // "<Page> | Waves AI Pilot" title, including the legal pages.
  title: "Waves AI Pilot — AI sales agent for website, WhatsApp & Instagram",
  description:
    "Waves AI Pilot is an AI sales employee for businesses: it answers prospects from your own approved knowledge, qualifies leads, books appointments and hands off to your team on your website, WhatsApp and Instagram.",
  applicationName: "Waves AI Pilot",
  openGraph: {
    type: "website",
    siteName: "Waves AI Pilot",
    images: [{ url: "/marketing/og-overview.jpg", width: 1200, height: 630 }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider
      localization={{
        taskChooseOrganization: {
          title: "What's your business called?",
          createOrganization: { title: "What's your business called?" },
        },
      }}
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
          <SiteFooter />
        </body>
      </html>
    </ClerkProvider>
  );
}
