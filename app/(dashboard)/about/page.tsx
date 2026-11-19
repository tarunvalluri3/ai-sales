import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Eye, HandHeart, Lock, MessageSquareQuote, Target } from "lucide-react";
import { PageHero } from "@/components/site/feature-block";
import { CtaBand } from "@/components/site/cta-band";
import { Eyebrow, Reveal, Section, SectionHeading } from "@/components/site/primitives";
import { LitStatement } from "@/components/site/statement";
import { GENERAL_EMAIL, PHONE_PRIMARY, PHONE_WHATSAPP, SUPPORT_EMAIL } from "@/lib/site-contact";
import { STUDIO_HREF } from "@/components/site/links";

export const metadata: Metadata = {
  title: "About Us | Waves AI Pilot",
  description:
    "Waves AI Pilot is built by Waves Web Studio, a bootstrapped AI and software company in Hyderabad, India, founded in 2026. Our mission, our story, our founder and our company details.",
  alternates: { canonical: "/about" },
};

/**
 * Required by Razorpay's merchant-activation website check ("About us"),
 * and read by startup-programme and government reviewers. Every claim here
 * is one the business can stand behind: no invented team size, customer
 * count or funding. The founder writes in the first person -- Waves is a
 * one-person company and the copy must never imply a team.
 */

const PRINCIPLES = [
  {
    icon: Target,
    t: "Accuracy over everything",
    d: "A confident wrong answer costs a sale and your credibility. The AI answers only from what you approve, and says so when it doesn't know.",
  },
  {
    icon: Lock,
    t: "Your data is yours",
    d: "We never use your content or your customers' conversations to train AI models. Export or delete everything from your own dashboard.",
  },
  {
    icon: HandHeart,
    t: "People stay in charge",
    d: "The AI drafts, recommends and flags. A person on your team confirms the booking, sends the message and makes the call.",
  },
  {
    icon: Eye,
    t: "Honest about limits",
    d: "If a feature isn't ready, or depends on an approval we don't control, we say so before you pay, not after.",
  },
];

const TIMELINE = [
  { when: "June 2026", t: "Waves Web Studio founded", d: "Started in Hyderabad to build AI and web software for businesses, and products of our own." },
  { when: "2026", t: "Waves AI Pilot built", d: "Grounded retrieval, lead qualification, appointment booking, human handoff, workflows, copilot and analytics." },
  { when: "October 2026", t: "Registered as a business", d: "MSME (Udyam) registration and GST registration; subscription billing with GST invoices." },
  { when: "November 2026", t: "WhatsApp & Instagram", d: "Registered as a Meta Tech Provider to bring the AI employee to WhatsApp Business and Instagram." },
  { when: "Now", t: "Early access", d: "Onboarding our first businesses and improving the product with every conversation." },
];

export default function AboutPage() {
  return (
    <main className="flex flex-1 flex-col">
      <PageHero
        eyebrow="About us"
        title="We're building the AI sales employee every business deserves."
        lead="Waves AI Pilot is made by Waves Web Studio, an independent, bootstrapped AI and software company in Hyderabad, India. We fund our own products with client work, not outside investment, and answer only to the businesses that use them."
      />

      {/* Mission */}
      <Section dark labelledBy="mission-heading" className="overflow-hidden">
        <div aria-hidden="true" className="site-grid-bg absolute inset-0 -mx-12 opacity-70" />
        <div className="relative max-w-[1000px]">
          <Eyebrow>Our mission</Eyebrow>
          <h2 id="mission-heading" className="sr-only">
            Our mission
          </h2>
          <div className="mt-8">
            <LitStatement
              text="No business should lose a customer because nobody answered. We give every business, of any size, a salesperson that knows it inside out, answers in seconds and never makes things up."
              accent={["answered.", "answered"]}
            />
          </div>
        </div>
      </Section>

      {/* Story */}
      <Section labelledBy="story-heading">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <Eyebrow>Why we built it</Eyebrow>
            <h2 id="story-heading" className="site-h2 mt-5">
              The sale is lost in the gap between interest and a reply.
            </h2>
          </Reveal>
          <Reveal delay={0.08} className="flex flex-col gap-5 text-[16px] leading-[1.75] text-ds-text-secondary lg:col-span-7">
            <p>
              Someone lands on your website at 11 PM, or sends a DM on a Sunday, with one specific question. Nobody
              replies, so they go somewhere else. Most businesses can&apos;t staff every channel around the clock, and the
              enquiries that slip through are often the ones most ready to buy.
            </p>
            <p>
              Generic chatbots didn&apos;t fix this. A bot that can&apos;t answer accurately about <em>your</em> products is
              worse than no bot at all: it guesses, and a confident wrong answer costs the sale.
            </p>
            <p>
              So we built Waves AI Pilot differently. You give it your real products, services, FAQs and documents. It
              answers only from that approved material, qualifies the prospect over the conversation, captures their
              details, requests appointments for your confirmation, and hands over to your team the moment a human is
              genuinely needed, on your website, WhatsApp and Instagram.
            </p>
          </Reveal>
        </div>
      </Section>

      {/* Founder */}
      <Section className="bg-ds-surface" labelledBy="founder-heading">
        <div className="grid items-center gap-12 md:grid-cols-[320px_1fr] lg:grid-cols-[400px_1fr] lg:gap-20">
          <Reveal>
            <figure className="relative mx-auto w-full max-w-[360px] md:max-w-none">
              <div className="relative aspect-[3/4] overflow-hidden rounded-[28px] border border-ds-border">
                <Image
                  src="/marketing/founder-tarun-valluri.webp"
                  alt="Tarun Valluri, Founder of Waves Web Studio and Waves AI Pilot"
                  fill
                  sizes="(min-width: 1024px) 400px, (min-width: 768px) 320px, 360px"
                  className="object-cover"
                />
              </div>
              <span aria-hidden="true" className="absolute -right-2 -top-2 size-4 rounded-full bg-[#b2ff38] ring-4 ring-ds-surface" />
            </figure>
          </Reveal>
          <Reveal delay={0.08}>
            <Eyebrow>Meet the founder</Eyebrow>
            <h2 id="founder-heading" className="site-h2 mt-5">
              Tarun Valluri
            </h2>
            <p className="mt-2 font-label text-[12px] font-medium uppercase tracking-[0.18em] text-ds-accent">Founder &amp; Developer</p>
            <div className="mt-7 flex max-w-[640px] flex-col gap-5 text-[16px] leading-[1.75] text-ds-text-secondary">
              <p>
                I&apos;m Tarun, the founder and developer behind Waves Web Studio and Waves AI Pilot. I design and build
                the product end to end: the AI agent, the retrieval system, the dashboard, the integrations and the
                infrastructure it runs on.
              </p>
              <p>
                I started Waves to do two things at once: build the software and AI that businesses need, and build SaaS
                products of my own. Waves AI Pilot is the first. When you use it, you have a direct line to the person who
                wrote it: no account managers, no handoffs.
              </p>
            </div>
            <figure className="mt-8 max-w-[640px] rounded-[22px] border border-ds-border bg-ds-bg p-6">
              <MessageSquareQuote className="size-5 text-ds-accent" aria-hidden="true" />
              <blockquote className="mt-3 text-[17px] leading-relaxed text-ds-text-primary">
                &ldquo;An AI that speaks for your business should know it as well as your best salesperson, and be just as
                honest when it doesn&apos;t know something.&rdquo;
              </blockquote>
            </figure>
          </Reveal>
        </div>
      </Section>

      {/* Principles */}
      <Section labelledBy="principles-heading">
        <SectionHeading align="center" eyebrow="What we stand for" id="principles-heading" title="Principles built into the product." />
        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((p, i) => (
            <Reveal as="li" key={p.t} delay={i * 0.05} className="rounded-[24px] border border-ds-border bg-ds-surface p-7">
              <span className="flex size-10 items-center justify-center rounded-xl bg-ds-lime-soft text-ds-accent">
                <p.icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-[17px] font-medium">{p.t}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ds-text-secondary">{p.d}</p>
            </Reveal>
          ))}
        </ul>
      </Section>

      {/* Journey */}
      <Section className="bg-ds-surface" labelledBy="journey-heading">
        <SectionHeading align="split" eyebrow="Our journey" id="journey-heading" title="Early, focused and moving fast." lead="Where we are, stated plainly." />
        <ol className="mt-14 grid gap-px overflow-hidden rounded-[26px] border border-ds-border bg-ds-border md:grid-cols-5">
          {TIMELINE.map((m, i) => (
            <Reveal as="li" key={m.t} delay={i * 0.05} className="relative bg-ds-bg p-6">
              <span className={`flex size-3 rounded-full ${i === TIMELINE.length - 1 ? "site-pulse bg-[#7fbf1f] text-[#7fbf1f]" : "bg-ds-border-strong"}`} />
              <p className="mt-5 font-label text-[12px] font-medium uppercase tracking-[0.14em] text-ds-text-muted">{m.when}</p>
              <h3 className="mt-2 text-[16px] font-medium">{m.t}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ds-text-secondary">{m.d}</p>
            </Reveal>
          ))}
        </ol>
      </Section>

      {/* Company details */}
      <Section labelledBy="company-heading">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-4">
            <Eyebrow>Company details</Eyebrow>
            <h2 id="company-heading" className="site-h2 mt-5">
              Registered in India, built for businesses everywhere.
            </h2>
            <Link href="/contact" className="mt-6 inline-flex items-center gap-2 text-[15px] font-medium text-ds-accent">
              Contact &amp; grievance officer <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Reveal>
          <Reveal delay={0.08} className="lg:col-span-8">
            <dl className="divide-y divide-ds-border border-y border-ds-border">
              {[
                ["Company", <a key="c" href={STUDIO_HREF} className="site-link">Waves Web Studio</a>],
                ["Product", "Waves AI Pilot"],
                ["Founder", "Tarun Valluri, Founder & Proprietor"],
                ["Registration", "MSME (Udyam) · UDYAM-TS-20-0221187"],
                ["GSTIN", "36BYQPT2686E1ZR"],
                ["Founded", "June 2026"],
                ["Address", "Plot No. 19, Venkatramana Colony, Phase-1, Street-2, Dammaiguda, Hyderabad, Telangana 500083, India"],
                ["Email", <span key="e"><a href={`mailto:${SUPPORT_EMAIL}`} className="site-link">{SUPPORT_EMAIL}</a> · <a href={`mailto:${GENERAL_EMAIL}`} className="site-link">{GENERAL_EMAIL}</a></span>],
                ["Phone", <span key="p"><a href={PHONE_PRIMARY.tel} className="site-link">{PHONE_PRIMARY.display}</a> · <a href={PHONE_WHATSAPP.whatsapp} className="site-link">{PHONE_WHATSAPP.display}</a> (WhatsApp)</span>],
              ].map(([k, v]) => (
                <div key={k as string} className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
                  <dt className="font-label text-[11px] font-medium uppercase tracking-[0.18em] text-ds-text-muted">{k}</dt>
                  <dd className="text-[15px] text-ds-text-primary">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </Section>

      <CtaBand title="Meet your new AI sales employee." />
    </main>
  );
}
