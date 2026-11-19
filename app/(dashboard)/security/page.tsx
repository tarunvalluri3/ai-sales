import Link from "next/link";
import {
  Ban,
  Database,
  EyeOff,
  FileLock2,
  Gauge,
  KeyRound,
  Lock,
  ScrollText,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";
import { PageHero } from "@/components/site/feature-block";
import { CtaBand } from "@/components/site/cta-band";
import { Btn, Reveal, Section, SectionHeading } from "@/components/site/primitives";
import { PilotTile } from "@/components/site/brand-icons";
import { JsonLd, breadcrumbLd, pageMetadata } from "@/components/site/seo";

export const metadata = pageMetadata({
  title: "Security, Privacy & Responsible AI | Waves AI Pilot",
  description:
    "How Waves AI Pilot keeps each business's data isolated with row-level security, keeps AI answers grounded in approved knowledge, keeps people in control, and handles privacy under India's DPDP Act.",
  path: "/security",
  keywords: ["AI chatbot security", "DPDP Act compliance", "data privacy AI", "responsible AI", "tenant isolation"],
});

function IsolationDiagram() {
  const tenants = [
    { name: "Business A", color: "#d6fb93" },
    { name: "Business B", color: "#e3e9ff" },
    { name: "Business C", color: "#ffe4d6" },
  ];
  return (
    <div className="rounded-[28px] border border-ds-border bg-ds-surface p-6 sm:p-8">
      <div className="flex justify-center">
        <span className="flex items-center gap-2 site-ink rounded-full px-3.5 py-2 text-[12.5px]">
          <PilotTile className="size-6 rounded-md" /> Waves AI Pilot
        </span>
      </div>
      <div className="mx-auto mt-4 h-6 w-px bg-ds-border-strong" />
      <div className="grid grid-cols-3 gap-3">
        {tenants.map((t) => (
          <div key={t.name} className="flex flex-col items-center gap-2">
            <div className="w-full rounded-2xl border border-ds-border p-3" style={{ background: t.color }}>
              <p className="text-[12px] font-medium text-[#151713]">{t.name}</p>
              <ul className="mt-2 flex flex-col gap-1 text-[10.5px] text-[#50554c]">
                <li>Knowledge</li>
                <li>Conversations</li>
                <li>Leads</li>
              </ul>
            </div>
            <span className="flex items-center gap-1 text-[10.5px] text-ds-text-muted">
              <Lock className="size-3" aria-hidden="true" /> RLS
            </span>
          </div>
        ))}
      </div>
      <p className="mt-5 text-center text-[12.5px] text-ds-text-secondary">
        Every row carries its business. Database policies refuse anything else.
      </p>
    </div>
  );
}

const SECTIONS = [
  {
    title: "Data isolation",
    items: [
      { icon: Database, t: "Row-level security", d: "Each business's knowledge, conversations, leads and settings are isolated at the database level by row-level security policies." },
      { icon: ShieldCheck, t: "Verified on every change", d: "Tenant isolation is checked by an automated test suite on every change we ship, not assumed." },
      { icon: KeyRound, t: "Trusted identity only", d: "Signed-in users are verified by our authentication provider. The public widget never chooses which business it speaks for; its key is resolved on our server." },
    ],
  },
  {
    title: "Responsible AI",
    items: [
      { icon: Ban, t: "Grounded, or it says so", d: "Business answers come only from retrieved approved knowledge. With no source, the agent says it doesn't know and asks a question." },
      { icon: ShieldAlert, t: "Guardrails", d: "Messages are screened for abuse and out-of-scope requests; replies are checked before they're sent. Flagged messages are recorded for review." },
      { icon: UserCheck, t: "Humans decide", d: "AI scores, summaries and suggested tags are labelled as AI signals. Bookings need your confirmation; follow-ups are drafts until a person acts." },
      { icon: EyeOff, t: "Never used for training", d: "Your business content and your visitors' conversations are never used to train or fine-tune any AI model." },
    ],
  },
  {
    title: "Infrastructure & operations",
    items: [
      { icon: Lock, t: "Encryption", d: "All traffic is encrypted in transit over HTTPS. Data is encrypted at rest by our database provider. Meta access tokens are stored encrypted." },
      { icon: Gauge, t: "Abuse protection", d: "The public chat endpoint is rate limited per key, per address and per conversation, with bot protection on the widget." },
      { icon: ServerCog, t: "Least access", d: "Production access is restricted to the proprietor. Secrets live in environment configuration, never in source control." },
      { icon: ScrollText, t: "Audit trail", d: "Sensitive actions in your workspace are written to an audit log you can review." },
    ],
  },
  {
    title: "Privacy & your rights",
    items: [
      { icon: FileLock2, t: "Built for India's DPDP Act", d: "We act as Data Fiduciary for account data and as processor for your visitors' conversations, with a named Grievance Officer." },
      { icon: Trash2, t: "Retention & deletion", d: "Visitor conversations are deleted automatically after 24 months of inactivity. You can export or permanently delete your account data yourself." },
      { icon: UserCheck, t: "Requests answered fast", d: "Data requests are acknowledged within 48 hours and completed within 30 days." },
    ],
  },
];

const PROCESSORS = [
  { n: "Supabase", d: "Database (PostgreSQL) and vector search" },
  { n: "Google Gemini", d: "AI responses and embeddings" },
  { n: "Google Cloud", d: "Application hosting" },
  { n: "Clerk", d: "Authentication" },
  { n: "Meta", d: "WhatsApp and Instagram messaging" },
  { n: "Razorpay", d: "Payments" },
  { n: "Resend", d: "Email delivery" },
  { n: "Sentry", d: "Error monitoring, scrubbed" },
];

export default function SecurityPage() {
  return (
    <main className="flex flex-1 flex-col">
      <JsonLd data={breadcrumbLd([{ name: "Security", path: "/security" }])} />
      <PageHero
        eyebrow="Security & trust"
        title="Security, privacy and responsible AI, built in."
        lead="Waves AI Pilot is built on four rules: every business's data stays its own, the AI never invents facts, people stay in control, and nothing you share trains anyone's model."
        aside={<IsolationDiagram />}
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Btn href="/privacy" variant="secondary" dot={false}>
            Read the privacy policy
          </Btn>
        </div>
      </PageHero>

      {SECTIONS.map((s, si) => (
        <Section key={s.title} className={si % 2 === 0 ? "bg-ds-surface" : ""} labelledBy={`sec-${si}`}>
          <SectionHeading eyebrow={String(si + 1).padStart(2, "0")} id={`sec-${si}`} title={s.title} />
          <ul className={`mt-12 grid gap-5 sm:grid-cols-2 ${s.items.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
            {s.items.map((it, i) => (
              <Reveal as="li" key={it.t} delay={i * 0.05} className={`rounded-[24px] border border-ds-border p-7 ${si % 2 === 0 ? "bg-ds-bg" : "bg-ds-surface"}`}>
                <it.icon className="size-6 text-ds-accent" strokeWidth={1.75} aria-hidden="true" />
                <h3 className="mt-5 text-[16.5px] font-medium">{it.t}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ds-text-secondary">{it.d}</p>
              </Reveal>
            ))}
          </ul>
        </Section>
      ))}

      <Section dark labelledBy="proc-heading">
        <SectionHeading
          align="split"
          eyebrow="Sub-processors"
          id="proc-heading"
          title="The services we rely on."
          lead="Each processes data only to deliver its function, under its own security commitments. The full list and details are in our privacy policy."
        >
          <Link href="/privacy" className="mt-5 inline-block site-link">
            Privacy policy
          </Link>
        </SectionHeading>
        <ul className="mt-12 grid gap-px overflow-hidden rounded-[24px] border border-ds-border bg-ds-border sm:grid-cols-2 lg:grid-cols-4">
          {PROCESSORS.map((p) => (
            <li key={p.n} className="bg-ds-bg p-6">
              <p className="text-[16px] font-medium">{p.n}</p>
              <p className="mt-1 text-[13.5px] text-ds-text-secondary">{p.d}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 max-w-[760px] text-[13.5px] leading-relaxed text-ds-text-muted">
          No system is perfectly secure, and we don&apos;t claim ours is. To report a security issue, email{" "}
          <a href="mailto:support@waveswebstudio.in" className="text-ds-text-secondary underline underline-offset-4">
            support@waveswebstudio.in
          </a>
          .
        </p>
      </Section>

      <div className="pt-20 lg:pt-28">
        <CtaBand />
      </div>
    </main>
  );
}
