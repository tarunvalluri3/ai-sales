import type { ReactNode } from "react";
import { Bell, Code2, CreditCard, FileSpreadsheet, FileText, Globe, Link2, Mail, Webhook } from "lucide-react";
import { PageHero } from "@/components/site/feature-block";
import { CtaBand } from "@/components/site/cta-band";
import { Btn, CheckList, Eyebrow, Reveal, Section, SectionHeading } from "@/components/site/primitives";
import { InstagramIcon, PilotTile, WebsiteIcon, WhatsAppIcon } from "@/components/site/brand-icons";
import { DEMO_HREF } from "@/components/site/links";
import { JsonLd, breadcrumbLd, pageMetadata } from "@/components/site/seo";

export const metadata = pageMetadata({
  title: "Integrations: WhatsApp Business, Instagram, Website Chat & Webhooks | Waves AI Pilot",
  description:
    "Connect Waves AI Pilot to your website (WordPress, Shopify, Wix, Webflow or custom), WhatsApp Business Platform and Instagram, import knowledge from PDFs and web pages, and send qualified leads to your CRM, Zapier or Make with signed webhooks.",
  path: "/integrations",
  keywords: ["WhatsApp Business API chatbot", "Instagram messaging integration", "website chat widget", "chatbot for WordPress", "chatbot for Shopify", "CRM webhook integration", "Zapier lead integration"],
});

function Tile({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="flex flex-col items-center gap-2">
      <span className="flex size-14 items-center justify-center rounded-2xl border border-ds-border bg-ds-surface shadow-[0_12px_30px_-18px_rgba(21,23,19,0.4)]">{children}</span>
      <span className="text-[12px] text-ds-text-secondary">{label}</span>
    </span>
  );
}

function Orbit() {
  const items = [
    { node: <WebsiteIcon className="size-8" />, label: "Website", a: -90 },
    { node: <WhatsAppIcon className="size-8" />, label: "WhatsApp", a: -30 },
    { node: <InstagramIcon className="size-8" />, label: "Instagram", a: 30 },
    { node: <Webhook className="size-6 text-ds-accent" strokeWidth={1.75} />, label: "Webhooks", a: 90 },
    { node: <FileText className="size-6 text-ds-accent" strokeWidth={1.75} />, label: "Files", a: 150 },
    { node: <Globe className="size-6 text-ds-accent" strokeWidth={1.75} />, label: "Web pages", a: 210 },
  ];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[440px]">
      <div aria-hidden="true" className="absolute inset-[14%] rounded-full border border-dashed border-ds-border-strong" />
      <div aria-hidden="true" className="absolute inset-[30%] rounded-full border border-ds-border" />
      <div aria-hidden="true" className="site-glow inset-[30%] opacity-40" />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[22px] bg-ds-surface p-1.5 shadow-[0_20px_50px_-16px_rgba(21,23,19,0.45)]">
        <PilotTile className="size-[72px]" />
      </span>
      {items.map((it, i) => {
        const r = 36;
        const x = 50 + r * Math.cos((it.a * Math.PI) / 180);
        const y = 50 + r * Math.sin((it.a * Math.PI) / 180);
        return (
          <span key={it.label} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
            <span className="site-floaty block" style={{ ["--fd" as string]: `${i * 0.6}s` }}>
              <Tile label={it.label}>{it.node}</Tile>
            </span>
          </span>
        );
      })}
    </div>
  );
}

const GROUPS: { title: string; body: string; items: { icon: ReactNode; name: string; detail: string; tag: string }[] }[] = [
  {
    title: "Channels",
    body: "Where your AI employee talks to prospects.",
    items: [
      { icon: <WebsiteIcon className="size-9" />, name: "Website widget", detail: "A branded chat panel on any website: WordPress, Shopify, Wix, Webflow, Squarespace or custom code. One script tag, your colours, your language, suggested questions and a consent notice.", tag: "All plans" },
      { icon: <WhatsAppIcon className="size-9" />, name: "WhatsApp Business", detail: "Through Meta's official WhatsApp Business Platform with your own number, connected using Meta's Embedded Signup. Message templates sync for follow-ups outside the 24-hour window.", tag: "Growth & Scale" },
      { icon: <InstagramIcon className="size-9" />, name: "Instagram Direct", detail: "Replies to DMs on your Instagram professional account, linked to your Facebook Page, with the same knowledge and escalation rules as every other channel.", tag: "Growth & Scale" },
    ],
  },
  {
    title: "Knowledge sources",
    body: "What your AI employee learns from.",
    items: [
      { icon: <FileText className="size-6 text-ds-accent" strokeWidth={1.75} />, name: "File upload", detail: "Upload PDF, TXT and Markdown files: price lists, brochures, policies. Text is extracted, indexed and kept private to your business.", tag: "Growth & Scale" },
      { icon: <Globe className="size-6 text-ds-accent" strokeWidth={1.75} />, name: "Website import", detail: "Import any public page from your website by URL, and refresh it when the page changes.", tag: "Growth & Scale" },
      { icon: <Code2 className="size-6 text-ds-accent" strokeWidth={1.75} />, name: "Products, services & FAQs", detail: "Structured records with prices, details and photos, entered in the dashboard, plus pasted text documents.", tag: "All plans" },
    ],
  },
  {
    title: "Data out",
    body: "Where your leads go next.",
    items: [
      { icon: <Webhook className="size-6 text-ds-accent" strokeWidth={1.75} />, name: "Outbound webhooks", detail: "A signed lead.qualified event to any URL the moment a lead qualifies. Connect your CRM, Zapier, Make or n8n.", tag: "Scale" },
      { icon: <FileSpreadsheet className="size-6 text-ds-accent" strokeWidth={1.75} />, name: "CSV export", detail: "Export leads from Analytics to open in Excel, Google Sheets or any CRM importer.", tag: "Growth & Scale" },
      { icon: <Mail className="size-6 text-ds-accent" strokeWidth={1.75} />, name: "Email notifications", detail: "Instant emails for new booking requests and hot leads, plus a digest of leads and handoffs.", tag: "All plans" },
    ],
  },
];

export default function IntegrationsPage() {
  return (
    <main className="flex flex-1 flex-col">
      <JsonLd data={breadcrumbLd([{ name: "Integrations", path: "/integrations" }])} />
      <PageHero
        eyebrow="Integrations"
        title="Integrations for WhatsApp Business, Instagram and your website."
        lead="Put your AI employee on your website, WhatsApp and Instagram, teach it from your files and web pages, and send every qualified lead wherever your team works."
        aside={<Orbit />}
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Btn href="/sign-up">Start your free trial</Btn>
          <Btn href={DEMO_HREF} variant="secondary">
            Book a demo
          </Btn>
        </div>
      </PageHero>

      {GROUPS.map((g, gi) => (
        <Section key={g.title} className={gi % 2 === 0 ? "bg-ds-surface" : ""} labelledBy={`int-${gi}`}>
          <SectionHeading align="split" eyebrow={g.title} id={`int-${gi}`} title={g.body} />
          <ul className="mt-12 grid gap-5 md:grid-cols-3">
            {g.items.map((it, i) => (
              <Reveal as="li" key={it.name} delay={i * 0.06} className={`flex flex-col rounded-[24px] border border-ds-border p-7 ${gi % 2 === 0 ? "bg-ds-bg" : "bg-ds-surface"}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-12 items-center justify-center rounded-xl border border-ds-border bg-ds-surface">{it.icon}</span>
                  <span className="rounded-full bg-ds-surface-soft px-2.5 py-1 text-[11.5px] font-medium text-ds-text-secondary">{it.tag}</span>
                </div>
                <h3 className="mt-6 text-[17px] font-medium">{it.name}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ds-text-secondary">{it.detail}</p>
              </Reveal>
            ))}
          </ul>
        </Section>
      ))}

      {/* Developer view */}
      <Section dark labelledBy="dev-heading" className="overflow-hidden">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <Eyebrow>For developers</Eyebrow>
            <h2 id="dev-heading" className="site-h2 mt-5">
              Two lines to install. One signed event to integrate.
            </h2>
            <p className="site-lead mt-5">
              The widget loads in an isolated frame, so it never clashes with your site&apos;s styles or scripts. Widget keys
              can be restricted to your own domains. Webhooks are signed with HMAC-SHA256 and retried with backoff.
            </p>
            <CheckList
              className="mt-7"
              items={[
                "Domain-restricted widget keys you can create and revoke",
                "X-Webhook-Signature header on every delivery",
                "Up to five delivery attempts with exponential backoff",
                "Delivery history for every endpoint in the dashboard",
              ]}
            />
          </Reveal>
          <Reveal delay={0.1} className="flex flex-col gap-4">
            <CodeCard title="index.html" icon={<Code2 className="size-4" />}>
              <span className="text-[#949b8c]">{"<!-- Waves AI Pilot widget -->"}</span>
              {"\n"}
              <span className="text-[#b2ff38]">{"<script"}</span>
              {' src="https://aipilot.waveswebstudio.in/widget-loader.js"\n        data-key="wk_live_••••••••"'}
              <span className="text-[#b2ff38]">{"></script>"}</span>
            </CodeCard>
            <CodeCard title="POST · lead.qualified" icon={<Link2 className="size-4" />}>
              {`{
  "event": "lead.qualified",
  "leadId": "8f3c…",
  "conversationId": "c21a…",
  "qualification": "hot",
  "contactEmail": "ananya@example.com",
  "contactPhone": "+91 98•••••21",
  "createdAt": "2026-11-19T10:42:00Z"
}`}
            </CodeCard>
          </Reveal>
        </div>
      </Section>

      <Section labelledBy="billing-heading">
        <div className="grid gap-5 md:grid-cols-2">
          <Reveal className="rounded-[24px] border border-ds-border bg-ds-surface p-7">
            <CreditCard className="size-6 text-ds-accent" strokeWidth={1.75} aria-hidden="true" />
            <h3 id="billing-heading" className="mt-5 text-[17px] font-medium">Payments by Razorpay</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ds-text-secondary">
              Subscribe with UPI, cards or net banking through Razorpay. Every payment comes with a GST invoice you can download from your dashboard.
            </p>
          </Reveal>
          <Reveal delay={0.06} className="rounded-[24px] border border-ds-border bg-ds-surface p-7">
            <Bell className="size-6 text-ds-accent" strokeWidth={1.75} aria-hidden="true" />
            <h3 className="mt-5 text-[17px] font-medium">Need another integration?</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ds-text-secondary">
              Webhooks cover most CRMs today. If you need a direct connection, tell us at{" "}
              <a href="mailto:support@waveswebstudio.in" className="site-link">
                support@waveswebstudio.in
              </a>
              . We build the integrations our customers ask for.
            </p>
          </Reveal>
        </div>
      </Section>

      <CtaBand />
    </main>
  );
}

function CodeCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-ds-border bg-[#0a0c08]">
      <div className="flex items-center gap-2 border-b border-ds-border px-4 py-3 text-[12.5px] text-ds-text-secondary">
        {icon}
        {title}
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-[#dfe4d8]">{children}</pre>
    </div>
  );
}
