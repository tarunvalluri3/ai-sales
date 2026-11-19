import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site-contact";
import { ORDERED_PLANS } from "@/lib/plans";

/*
 * SEO helpers for the public site: one metadata builder (canonical, Open
 * Graph, Twitter, keywords) and the JSON-LD structured data search engines
 * read (Organization, WebSite, SoftwareApplication with real plan prices,
 * FAQPage, BreadcrumbList). Prices come from lib/plans.ts, never typed here.
 */

const OG_IMAGE = { url: "/marketing/og-overview.jpg", width: 1200, height: 630, alt: "Waves AI Pilot dashboard" };

export function pageMetadata({
  title,
  description,
  path,
  keywords = [],
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
}): Metadata {
  return {
    title,
    description,
    keywords: [...keywords, "Waves AI Pilot", "AI sales agent", "AI chatbot India"],
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: "Waves AI Pilot",
      locale: "en_IN",
      url: path,
      title,
      description,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
    robots: { index: true, follow: true },
  };
}

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output, with "<" escaped so content can never close the tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

const ORG_ID = `${SITE_URL}/#organization`;

export const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ORG_ID,
  name: "Waves Web Studio",
  url: "https://waveswebstudio.in",
  logo: `${SITE_URL}/brand/waves-ai-pilot-app-icon-512.png`,
  email: "support@waveswebstudio.in",
  telephone: "+91-7981596249",
  foundingDate: "2026-06-09",
  founder: { "@type": "Person", name: "Tarun Valluri", jobTitle: "Founder" },
  address: {
    "@type": "PostalAddress",
    streetAddress: "Plot No. 19, Venkatramana Colony, Phase-1, Street-2, Dammaiguda",
    addressLocality: "Hyderabad",
    addressRegion: "Telangana",
    postalCode: "500083",
    addressCountry: "IN",
  },
  taxID: "36BYQPT2686E1ZR",
  contactPoint: [
    { "@type": "ContactPoint", contactType: "customer support", email: "support@waveswebstudio.in", telephone: "+91-7981596249", areaServed: "IN", availableLanguage: ["English", "Hindi"] },
    { "@type": "ContactPoint", contactType: "sales", email: "contact@waveswebstudio.in", telephone: "+91-6303896249" },
  ],
  sameAs: ["https://www.linkedin.com/company/waves-web-studio/", "https://www.instagram.com/waveswebstudio", "https://x.com/waveswebstudio"],
};

export const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: SITE_URL,
  name: "Waves AI Pilot",
  publisher: { "@id": ORG_ID },
  inLanguage: "en-IN",
};

export const softwareLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/#software`,
  name: "Waves AI Pilot",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "AI sales agent and chatbot",
  operatingSystem: "Web",
  url: SITE_URL,
  image: `${SITE_URL}${OG_IMAGE.url}`,
  description:
    "An AI sales agent for businesses that answers prospects from approved business knowledge, qualifies leads, books appointments and hands off to a human on website chat, WhatsApp Business and Instagram.",
  publisher: { "@id": ORG_ID },
  featureList: [
    "AI chatbot for website, WhatsApp and Instagram",
    "Answers grounded in approved business knowledge",
    "Lead capture and AI lead qualification (hot, warm, cold)",
    "Appointment booking from business hours",
    "Human handoff and live takeover",
    "Omnichannel inbox",
    "Customer profiles and segments",
    "Sales automation workflows",
    "AI sales copilot",
    "Funnel and channel analytics",
  ],
  offers: ORDERED_PLANS.map((p) => ({
    "@type": "Offer",
    name: `${p.name} plan`,
    price: (p.monthlyPricePaise / 100).toFixed(2),
    priceCurrency: "INR",
    category: "subscription",
    url: `${SITE_URL}/pricing`,
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: (p.monthlyPricePaise / 100).toFixed(2),
      priceCurrency: "INR",
      billingDuration: "P1M",
      valueAddedTaxIncluded: true,
    },
  })),
};

/** FAQPage from plain-text Q&A (rich-result answers must be text). */
export function faqLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}

export function breadcrumbLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...trail].map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${SITE_URL}${t.path === "/" ? "" : t.path}`,
    })),
  };
}
