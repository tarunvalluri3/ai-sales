import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AtSign, Globe, MessageCircle } from "lucide-react";
import { Reveal } from "./_components/homepage/reveal";
import { WavesLogo } from "./_components/waves-logo";
import { HeroConversation } from "@/components/marketing/fragments/hero-conversation";
import { GroundedAnswer } from "@/components/marketing/fragments/grounded-answer";
import { BusinessSetup } from "@/components/marketing/fragments/business-setup";
import { KnowledgeSources } from "@/components/marketing/fragments/knowledge-sources";
import { Qualification } from "@/components/marketing/fragments/qualification";
import { HandoffInbox } from "@/components/marketing/fragments/handoff-inbox";
import { AnalyticsMini } from "@/components/marketing/fragments/analytics-mini";
import { BookingCard } from "@/components/marketing/fragments/booking-card";
import { MicroChip } from "@/components/marketing/fragments/_shared";
import { BrowserFrame } from "@/components/marketing/browser-frame";
import { ScreenshotCallout } from "@/components/marketing/screenshot-callout";
import { TenantIsolationDiagram } from "@/components/marketing/tenant-isolation-diagram";
import { FaqAccordion, type FaqItem } from "@/components/marketing/faq-accordion";
import { DotGridBackground } from "@/components/marketing/dot-grid-background";
import { MagneticLink } from "@/components/marketing/magnetic-link";
import { Parallax } from "@/components/marketing/parallax";

export const metadata: Metadata = {
  title: "Waves AI Pilot — an AI sales employee that knows your business",
  description:
    "Waves AI Pilot answers prospects from your own approved knowledge, qualifies leads as hot, warm, or cold, books appointments, and hands off to a human — on your website, WhatsApp, and Instagram.",
  openGraph: {
    title: "Waves AI Pilot — an AI sales employee that knows your business",
    description:
      "Grounded answers, lead qualification, appointment booking, and human handoff — on website, WhatsApp, and Instagram.",
    images: [{ url: "/marketing/dashboard-conversations.png", width: 1920, height: 920 }],
  },
};

const CHANNELS = [
  {
    icon: Globe,
    label: "Website",
    detail: "A chat panel embedded on your site, answering visitors the moment they ask.",
  },
  {
    icon: MessageCircle,
    label: "WhatsApp",
    detail: "Replies through your own WhatsApp Business number, same knowledge, same rules.",
  },
  {
    icon: AtSign,
    label: "Instagram",
    detail: "Answers direct messages automatically, with the same escalation rules as everywhere else.",
  },
];

const WORKFLOW_STEPS: { label: string; detail: string; fragment: ReactNode }[] = [
  {
    label: "Configure your business",
    detail: "Identity, products, services, and FAQs.",
    fragment: <BusinessSetup />,
  },
  {
    label: "Add approved knowledge",
    detail: "Chunked, embedded, and scoped to your business only.",
    fragment: <KnowledgeSources />,
  },
  {
    label: "AI talks to prospects",
    detail: "Grounded answers from your own approved information.",
    fragment: <GroundedAnswer />,
  },
  {
    label: "AI qualifies leads",
    detail: "Hot, warm, or cold — a signal for your team, not a verdict.",
    fragment: <Qualification />,
  },
  {
    label: "Human takes over",
    detail: "On request, on a repeated unknown, or on a complaint.",
    fragment: <HandoffInbox />,
  },
];

const CAPABILITIES: {
  title: string;
  detail: string;
  span: "wide" | "normal";
  visual: ReactNode;
}[] = [
  {
    title: "Grounded conversations",
    detail:
      "Every answer comes from your business's own products, services, FAQs, and approved knowledge — never invented, never borrowed from another business.",
    span: "wide",
    visual: (
      <div className="flex flex-wrap gap-1.5">
        <MicroChip>SOURCE · Pricing FAQ</MicroChip>
        <MicroChip>SOURCE · Service List</MicroChip>
      </div>
    ),
  },
  {
    title: "Tenant-scoped knowledge",
    detail: "Your knowledge is chunked, embedded, and retrieved against your business only.",
    span: "normal",
    visual: <MicroChip tone="success">Scoped · zero cross-tenant access</MicroChip>,
  },
  {
    title: "Lead qualification",
    detail:
      "The AI reads intent across a conversation and assigns hot/warm/cold with a short reason — always an AI signal, never a substitute for your judgment.",
    span: "wide",
    visual: <Qualification />,
  },
  {
    title: "Human handoff",
    detail: "When a prospect asks for a person, hits a repeated unknown, or raises a complaint, a team member can take over live.",
    span: "wide",
    visual: <HandoffInbox />,
  },
  {
    title: "Conversations, in one place",
    detail: "Every conversation — live, searchable, and reviewable — with clear attribution between AI, prospect, and staff.",
    span: "normal",
    visual: <MicroChip>32 conversations · 3 channels</MicroChip>,
  },
  {
    title: "Appointment booking",
    detail: "Prospects book straight into your availability — you confirm, nothing is assumed.",
    span: "normal",
    visual: <BookingCard />,
  },
  {
    title: "Analytics that mean something",
    detail: "Conversation volume, conversion rate, and lead breakdowns pulled from what actually happened.",
    span: "wide",
    visual: <AnalyticsMini />,
  },
];

const BOUNDARIES = [
  "Invent an answer outside your approved knowledge.",
  "Share one business's knowledge or conversations with another.",
  "Pretend to be a person when a prospect asks for one.",
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "How long does setup take?",
    answer:
      "Most businesses are live the same day: add your business profile, products, services, and FAQs, and the AI starts answering from them immediately. There is no approval wait for the website widget.",
  },
  {
    question: "What knowledge can the AI use?",
    answer:
      "Only what you add and approve — your products, services, FAQs, and any documents you upload. It never pulls from the open internet and never answers from another business's data.",
  },
  {
    question: "How does handoff to a human actually work?",
    answer:
      "When a prospect asks for a person, the AI hits the same unknown twice, or a conversation looks like a complaint, the conversation is flagged and the AI pauses. A team member can take it over from the dashboard and reply directly; handing it back resumes the AI.",
  },
  {
    question: "Which channels are live today?",
    answer:
      "Website, WhatsApp, and Instagram, all live. WhatsApp uses your own WhatsApp Business account; Instagram uses your own professional account through Meta.",
  },
  {
    question: "What happens to our data and our customers' conversations?",
    answer:
      "Your business content and your visitors' conversations are not used to train general-purpose AI models. Every business's knowledge and conversations are isolated at the database level, and you can export or delete everything from your own dashboard.",
  },
  {
    question: "Can the AI book appointments on its own?",
    answer:
      "It offers your real availability and books a requested slot, but it never invents availability — every booking draws from the schedule you've configured.",
  },
  {
    question: "What does it cost?",
    answer: (
      <>
        Plans are based on how many AI replies you use per month, with a 14-day free trial and no card
        required. See the full breakdown on{" "}
        <Link href="/pricing" className="font-medium text-ds-accent hover:text-ds-accent-strong">
          Pricing
        </Link>
        .
      </>
    ),
  },
];

export default function HomePage() {
  return (
    <div className="relative flex flex-1 flex-col bg-ds-bg">
      <DotGridBackground />
      <div className="relative z-10 flex flex-1 flex-col">
      {/* Hero -- headline, subcopy and CTAs render immediately, no animation
          wrapper and no JS dependency, so they never wait on the client. */}
      <section className="border-b border-ds-border px-6 py-20 md:py-28">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-ds-border-strong px-3 py-1 text-2xs font-medium tracking-wide-ds text-ds-text-secondary uppercase">
              <span className="size-1.5 rounded-full bg-ds-accent" aria-hidden="true" />
              AI sales employee
            </span>
            <h1 className="text-4xl leading-tight font-semibold text-ds-text-primary md:text-5xl">
              An AI employee that actually knows your business.
            </h1>
            <p className="max-w-lg text-base text-ds-text-secondary md:text-lg">
              Waves AI Pilot answers prospects using your own products, services, FAQs, and approved
              knowledge — qualifies who&apos;s worth your time, and hands off to a human the moment one
              is genuinely needed.
            </p>
            <p className="font-mono text-2xs tracking-wide-ds text-ds-text-muted uppercase">
              Website · WhatsApp · Instagram · Bookings
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <MagneticLink
                href="/sign-up"
                className="inline-block rounded-ds-sm bg-ds-accent px-5 py-3 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              >
                Get started
              </MagneticLink>
              <Link
                href="/sign-in"
                className="rounded-ds-sm border border-ds-border-strong px-5 py-3 text-sm font-semibold text-ds-text-primary transition-colors hover:border-ds-accent-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              >
                Sign in
              </Link>
            </div>
          </div>
          <Parallax strength={16} className="flex justify-center lg:justify-end">
            <HeroConversation />
          </Parallax>
        </div>
      </section>

      {/* Channels strip */}
      <section className="border-b border-ds-border px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-center text-xl font-semibold text-ds-text-primary md:text-2xl">
              Works where your customers already message you
            </h2>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {CHANNELS.map((channel, index) => (
              <Reveal key={channel.label} delay={index * 0.05}>
                <div className="flex h-full flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-5 transition-all duration-300 hover:-translate-y-1 hover:border-ds-border-strong hover:shadow-[0_16px_40px_-20px_rgba(0,0,0,0.5)]">
                  <channel.icon className="size-5 text-ds-accent-muted" aria-hidden="true" />
                  <span className="text-sm font-semibold text-ds-text-primary">{channel.label}</span>
                  <p className="text-sm text-ds-text-secondary">{channel.detail}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How it works -- each step paired with the fragment that shows it. */}
      <section className="border-b border-ds-border px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-center text-2xl font-semibold text-ds-text-primary md:text-3xl">
              How it works
            </h2>
          </Reveal>
          <div className="mt-14 flex flex-col gap-16">
            {WORKFLOW_STEPS.map((step, index) => (
              <Reveal key={step.label}>
                <div
                  className={`flex flex-col items-center gap-8 md:gap-12 ${
                    index % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row"
                  }`}
                >
                  <div className="flex flex-1 items-start gap-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-ds-accent-muted text-sm font-semibold text-ds-accent">
                      {index + 1}
                    </span>
                    <div className="flex flex-col gap-1">
                      <p className="text-base font-semibold text-ds-text-primary">{step.label}</p>
                      <p className="text-sm text-ds-text-secondary">{step.detail}</p>
                    </div>
                  </div>
                  <div className="w-full max-w-sm flex-1">{step.fragment}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Dashboard shot -- a real screenshot of the inbox, framed. */}
      <section className="border-b border-ds-border px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <div className="flex flex-col items-center gap-2 text-center">
              <h2 className="text-2xl font-semibold text-ds-text-primary md:text-3xl">
                Every conversation, with full context
              </h2>
              <p className="max-w-xl text-sm text-ds-text-secondary">
                The real dashboard: an open thread, its handoff state, and the tags your team added.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <Parallax strength={24} className="relative mt-10">
              <BrowserFrame urlLabel="app.wavesaipilot.in/dashboard/conversations">
                <Image
                  src="/marketing/dashboard-conversations.png"
                  alt="Waves AI Pilot dashboard, open conversation showing a handoff to a staff member and the AI-generated summary and tags"
                  width={1920}
                  height={920}
                  sizes="(min-width: 1024px) 1000px, 100vw"
                  className="h-auto w-full"
                  priority={false}
                />
              </BrowserFrame>
              <div className="pointer-events-none absolute inset-0 hidden sm:block">
                <ScreenshotCallout label="Inbox" left={6} top={46} />
                <ScreenshotCallout label="Handoff state" left={40} top={16} />
                <ScreenshotCallout label="AI summary & tags" left={78} top={30} align="left" />
              </div>
            </Parallax>
          </Reveal>
        </div>
      </section>

      {/* Capabilities bento */}
      <section className="border-b border-ds-border px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="flex flex-col items-center gap-2 text-center">
              <h2 className="text-2xl font-semibold text-ds-text-primary md:text-3xl">
                What your AI employee actually does
              </h2>
              <p className="max-w-xl text-sm text-ds-text-secondary">
                Not a generic chatbot — an employee of your specific business, scoped to what
                you&apos;ve approved it to know.
              </p>
            </div>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((capability, index) => (
              <Reveal key={capability.title} delay={(index % 3) * 0.05}>
                <div
                  className={`flex h-full flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5 transition-all duration-300 hover:-translate-y-1 hover:border-ds-border-strong hover:shadow-[0_16px_40px_-20px_rgba(0,0,0,0.5)] ${
                    capability.span === "wide" ? "lg:col-span-2" : ""
                  }`}
                >
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-ds-text-primary">{capability.title}</h3>
                    <p className="text-sm text-ds-text-secondary">{capability.detail}</p>
                  </div>
                  <div className="mt-auto">{capability.visual}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Trust and boundaries */}
      <section className="border-b border-ds-border px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <div className="flex flex-col items-center gap-2 text-center">
              <h2 className="text-2xl font-semibold text-ds-text-primary md:text-3xl">
                What your AI employee will never do
              </h2>
            </div>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {BOUNDARIES.map((boundary, index) => (
              <Reveal key={boundary} delay={index * 0.05}>
                <div className="flex h-full items-start gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
                  <span aria-hidden="true" className="mt-0.5 text-ds-danger">
                    ✕
                  </span>
                  <p className="text-sm text-ds-text-secondary">{boundary}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.15}>
            <div className="mt-12 rounded-ds-lg border border-ds-border bg-ds-surface p-6">
              <p className="mb-6 text-center text-sm font-medium text-ds-text-primary">
                Tenant isolation, enforced at the database level
              </p>
              <TenantIsolationDiagram />
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-ds-border px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-center text-2xl font-semibold text-ds-text-primary md:text-3xl">
              Frequently asked questions
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mt-10">
              <FaqAccordion items={FAQ_ITEMS} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-20">
        <Reveal>
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 rounded-ds-lg border border-ds-border-strong bg-ds-surface px-8 py-14 text-center">
            <h2 className="text-2xl font-semibold text-ds-text-primary md:text-3xl">
              Your business already has the answers. Give your AI employee access to them.
            </h2>
            <MagneticLink
              href="/sign-up"
              className="inline-block rounded-ds-sm bg-ds-accent px-6 py-3 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              Get started
            </MagneticLink>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-ds-border px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <WavesLogo />
            <p className="text-2xs text-ds-text-muted">An AI sales employee, grounded in your own business.</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-2xs text-ds-text-muted">
            <Link href="/pricing" className="transition-colors hover:text-ds-text-primary">
              Pricing
            </Link>
            <Link href="/about" className="transition-colors hover:text-ds-text-primary">
              About Us
            </Link>
            <Link href="/contact" className="transition-colors hover:text-ds-text-primary">
              Contact Us
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-ds-text-primary">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-ds-text-primary">
              Terms of Service
            </Link>
            <Link href="/refunds" className="transition-colors hover:text-ds-text-primary">
              Cancellation &amp; Refunds
            </Link>
            <Link href="/shipping" className="transition-colors hover:text-ds-text-primary">
              Service Delivery
            </Link>
          </div>
          <p className="text-center text-2xs text-ds-text-muted">
            Waves AI Pilot is a product of Waves Web Studio, Hyderabad, India · GSTIN 36BYQPT2686E1ZR
          </p>
        </div>
      </footer>
      </div>
    </div>
  );
}
