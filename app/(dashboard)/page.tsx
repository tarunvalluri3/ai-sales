import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Ban,
  Building2,
  Database,
  EyeOff,
  KeyRound,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { ORDERED_PLANS, TRIAL_DAYS, formatPaiseAsInr, formatReplyQuota } from "@/lib/plans";
import { HomeHero } from "@/components/site/home-hero";
import { ProductStory } from "@/components/site/product-story";
import { LitStatement } from "@/components/site/statement";
import { FaqList, type Faq } from "@/components/site/faq";
import { CtaBand } from "@/components/site/cta-band";
import { Btn, CheckList, Eyebrow, Reveal, Section, SectionHeading } from "@/components/site/primitives";
import {
  INSTAGRAM_SCRIPT,
  InstagramPhone,
  WEBSITE_SCRIPT,
  WHATSAPP_SCRIPT,
  WebsiteWidget,
  WhatsAppPhone,
} from "@/components/site/chat-illustrations";
import {
  AnalyticsIllustration,
  ConvertIllustration,
  CopilotIllustration,
  GoLiveIllustration,
  HoursVisual,
  InstantAnswersVisual,
  LanguagesVisual,
  LeadScoreIllustration,
  NotifyVisual,
  PersonalizeIllustration,
  TrainIllustration,
  WorkflowIllustration,
} from "@/components/site/illustrations";
import { InstagramIcon, WebsiteIcon, WhatsAppIcon } from "@/components/site/brand-icons";
import { INDUSTRIES } from "@/components/site/nav-data";
import { JsonLd, faqLd, organizationLd, pageMetadata, softwareLd, websiteLd } from "@/components/site/seo";

export const metadata = pageMetadata({
  title: "Waves AI Pilot — AI Sales Agent & Chatbot for WhatsApp, Instagram and Website",
  description:
    "Waves AI Pilot is an AI sales agent for businesses. It answers enquiries from your approved knowledge, qualifies leads, books appointments and hands off to your team on website chat, WhatsApp Business and Instagram DMs.",
  path: "/",
  keywords: ["AI sales agent", "AI chatbot for business", "WhatsApp chatbot", "Instagram DM automation", "AI lead qualification", "appointment booking chatbot", "AI sales assistant India", "website chatbot"],
});

const STEPS: { n: string; title: string; body: string; visual: ReactNode }[] = [
  {
    n: "01",
    title: "Train it on your business",
    body: "Add products, services and FAQs, upload PDFs or import pages from your website. It's read, indexed and kept private to your business.",
    visual: <TrainIllustration />,
  },
  {
    n: "02",
    title: "Give it your voice",
    body: "Pick a tone, a language and your brand colour. Choose what it may do: capture leads, recommend products, book appointments.",
    visual: <PersonalizeIllustration />,
  },
  {
    n: "03",
    title: "Go live on every channel",
    body: "Paste one script tag on your site. Connect your WhatsApp Business number and Instagram account through Meta. Test in the sandbox, then publish.",
    visual: <GoLiveIllustration />,
  },
  {
    n: "04",
    title: "Watch leads arrive",
    body: "Every chat becomes a qualified lead with a score, a summary and a next step, ready for your team in one dashboard.",
    visual: <ConvertIllustration />,
  },
];

const PILLARS = [
  {
    icon: Ban,
    title: "Never invents an answer",
    body: "It replies only from your approved knowledge. When it doesn't know, it says so and asks a question.",
  },
  {
    icon: Database,
    title: "Your data stays yours",
    body: "Each business's knowledge and conversations are isolated at the database level with row-level security.",
  },
  {
    icon: UserCheck,
    title: "People make the calls",
    body: "The AI drafts, recommends and requests. Your team confirms bookings, sends follow-ups and takes over chats.",
  },
  {
    icon: EyeOff,
    title: "Not used to train AI models",
    body: "Your content and your customers' conversations are never used to train general-purpose AI models.",
  },
  {
    icon: ShieldCheck,
    title: "Guardrails built in",
    body: "Abusive or out-of-scope messages are flagged for review. It never discusses competitors or reveals its instructions.",
  },
  {
    icon: KeyRound,
    title: "Export or delete, any time",
    body: "Download your leads as CSV, and delete your business and its data from your own dashboard.",
  },
];

const FAQS: Faq[] = [
  {
    q: "What exactly is Waves AI Pilot?",
    a: "A subscription software (SaaS) that gives your business an AI sales employee. It chats with prospects on your website, WhatsApp and Instagram, answers from information you approve, qualifies them, captures their details, requests appointments and hands over to your team when a human is needed. Everything is managed from one dashboard.",
  },
  {
    q: "How is this different from a regular chatbot?",
    a: "A chatbot answers questions. Waves AI Pilot is built to sell: it asks one focused question when a request is vague, recommends specific products or services that fit, handles price and timing objections using your real information, and ends every reply with a next step. And it is grounded: it never answers a business question it has no source for.",
  },
  {
    q: "How long does setup take?",
    a: "A guided onboarding walks you through your business details, knowledge, products, FAQs, personality and channels, and you test the agent in a sandbox before publishing. The website widget goes live as soon as you paste one script tag. WhatsApp and Instagram need your own Meta business accounts, which the setup guides you through.",
  },
  {
    q: "Which channels and languages are supported?",
    a: "Your website (an embeddable chat widget), WhatsApp through Meta's official WhatsApp Business Platform with your own number, and Instagram direct messages through your professional account. The widget speaks English, Hindi, Spanish, French, German and Portuguese.",
  },
  {
    q: "Can it book appointments on its own?",
    a: "It offers real open slots from the business hours you set, collects the prospect's details and creates the request. Every booking stays pending until someone on your team confirms it, and the prospect is told so. Once confirmed, they're notified by email and, for WhatsApp chats, on WhatsApp.",
  },
  {
    q: "What happens when it can't answer?",
    a: "It says plainly that it doesn't have that information and asks a clarifying question. If the prospect asks for a person, repeats an unknown, or raises a complaint, the conversation is flagged for your team, and you can take it over live from the inbox.",
  },
  {
    q: "What does it cost?",
    a: (
      <>
        Plans start at {formatPaiseAsInr(ORDERED_PLANS[0].monthlyPricePaise)} a month (GST included), based on how many AI
        replies you need. Every business starts with a {TRIAL_DAYS}-day free trial, no card required. See{" "}
        <Link href="/pricing" className="site-link">
          pricing
        </Link>
        .
      </>
    ),
  },
];

/** Plain-text answers for FAQPage structured data (rich results need text). */
const FAQ_TEXT = FAQS.map((f) => ({
  q: f.q,
  a:
    typeof f.a === "string"
      ? f.a
      : `Plans start at ${formatPaiseAsInr(ORDERED_PLANS[0].monthlyPricePaise)} a month including GST, based on how many AI replies you need. Every business starts with a ${TRIAL_DAYS}-day free trial.`,
}));

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <JsonLd data={[organizationLd, websiteLd, softwareLd, faqLd(FAQ_TEXT)]} />
      <HomeHero />

      {/* The gap */}
      <Section dark className="overflow-hidden" labelledBy="gap-heading">
        <div aria-hidden="true" className="site-grid-bg absolute inset-0 -mx-12 opacity-70" />
        <div className="relative max-w-[980px]">
          <Eyebrow>Why it matters</Eyebrow>
          <h2 id="gap-heading" className="sr-only">
            Why it matters
          </h2>
          <div className="mt-8">
            <LitStatement
              text="A prospect messages at 11 PM with one specific question. If nobody answers, they buy from someone who did. Waves AI Pilot answers in seconds, from your own knowledge, on every channel, every hour."
              accent={["Waves", "AI", "Pilot"]}
            />
          </div>
        </div>
      </Section>

      {/* Channels */}
      <Section id="channels" labelledBy="channels-heading">
        <SectionHeading
          align="center"
          eyebrow="Omnichannel"
          id="channels-heading"
          title="One AI employee. Every channel your customers use."
          lead="The same knowledge, the same rules and the same lead capture on your website, WhatsApp and Instagram, with every conversation in one inbox."
        />
        <div className="mt-16 grid items-start gap-10 md:grid-cols-3 md:gap-6 lg:gap-10">
          {[
            {
              icon: <WebsiteIcon className="size-8" />,
              title: "Website",
              body: "A branded chat widget on any site, from one script tag.",
              node: <WebsiteWidget business="Skyline Homes" script={WEBSITE_SCRIPT} compact />,
            },
            {
              icon: <WhatsAppIcon className="size-8" />,
              title: "WhatsApp",
              body: "Replies through your own WhatsApp Business number.",
              node: <WhatsAppPhone business="Smile Dental Care" script={WHATSAPP_SCRIPT} />,
            },
            {
              icon: <InstagramIcon className="size-8" />,
              title: "Instagram",
              body: "Answers DMs on your professional account, with product cards.",
              node: <InstagramPhone handle="threadandloom.in" script={INSTAGRAM_SCRIPT} />,
            },
          ].map((c, i) => (
            <Reveal key={c.title} delay={i * 0.08} className="flex flex-col items-center text-center">
              <div className="flex h-[520px] w-full items-center justify-center">{c.node}</div>
              <div className="mt-8 flex items-center gap-3">
                {c.icon}
                <h3 className="site-h3">{c.title}</h3>
              </div>
              <p className="mt-2 max-w-[280px] text-[15px] text-ds-text-secondary">{c.body}</p>
            </Reveal>
          ))}
        </div>
        <p className="mt-10 text-center text-[12.5px] text-ds-text-muted">Sample conversations with illustrative businesses.</p>
      </Section>

      {/* How it works */}
      <Section className="bg-ds-surface" labelledBy="how-heading">
        <SectionHeading
          align="split"
          eyebrow="How it works"
          id="how-heading"
          title="From sign-up to your first qualified lead."
          lead="A guided setup takes you from your business details to a published agent. No code beyond one script tag, and nothing goes live until you've tested it."
        />
        <ol className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 0.06} className="flex flex-col rounded-[28px] border border-ds-border bg-ds-bg p-5">
              <div className="min-h-[330px]">{s.visual}</div>
              <p className="mt-6 font-label text-[13px] font-medium text-ds-accent">{s.n}</p>
              <h3 className="site-h3 mt-2">{s.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ds-text-secondary">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </Section>

      {/* Product story */}
      <Section id="tour" labelledBy="tour-heading">
        <SectionHeading
          eyebrow="See it work"
          id="tour-heading"
          title="Real screens. Real behaviour. Nothing staged."
          lead="This is the Waves AI Pilot dashboard your team works in every day: grounded answers, qualified leads, bookings, handoff and every channel in one place."
        />
        <ProductStory />
      </Section>

      {/* Bento */}
      <Section className="bg-ds-surface" labelledBy="platform-heading">
        <SectionHeading
          align="center"
          eyebrow="The platform"
          id="platform-heading"
          title="Everything after the first message, handled."
          lead="Qualification, follow-up, automation and reporting are built in, so a lead never goes cold because someone was busy."
        />
        <div className="mt-16 grid gap-5 md:grid-cols-6">
          <BentoCard className="md:col-span-3 lg:col-span-2" title="Lead scoring you can read" body="A 0–9 score from real signals, itemised point by point." href="/product#leads">
            <LeadScoreIllustration />
          </BentoCard>
          <BentoCard className="md:col-span-3 lg:col-span-2" title="Workflows that follow up" body="Trigger, conditions, waits and actions, running reliably in the background." href="/product#workflows">
            <WorkflowIllustration />
          </BentoCard>
          <BentoCard className="md:col-span-6 lg:col-span-2" title="A copilot for your day" body="Who to talk to first, and the one thing to do next." href="/product#copilot">
            <CopilotIllustration />
          </BentoCard>
          <BentoCard className="md:col-span-6 lg:col-span-3" title="Analytics that mean something" body="Conversations to conversions, by channel and by the page a chat started on." href="/product#analytics">
            <AnalyticsIllustration />
          </BentoCard>
          <div className="grid gap-5 md:col-span-6 md:grid-cols-2 lg:col-span-3">
            <BentoCard small title="Instant answers" body="Common questions answered instantly from replies you approve.">
              <InstantAnswersVisual />
            </BentoCard>
            <BentoCard small title="Six languages" body="The widget greets and replies in your customers' language.">
              <LanguagesVisual />
            </BentoCard>
            <BentoCard small title="Business hours & routing" body="After-hours coverage and team assignment with SLA routing.">
              <HoursVisual />
            </BentoCard>
            <BentoCard small title="Never miss a lead" body="Email alerts for hot leads, bookings and handoff requests.">
              <NotifyVisual />
            </BentoCard>
          </div>
        </div>
        <div className="mt-12 flex justify-center">
          <Btn href="/product" variant="secondary">
            Explore every feature <ArrowRight className="size-4" aria-hidden="true" />
          </Btn>
        </div>
      </Section>

      {/* Trust band */}
      <Section dark labelledBy="trust-heading" className="overflow-hidden">
        <div aria-hidden="true" className="site-glow -right-40 top-10 h-[360px] w-[520px] opacity-25" />
        <SectionHeading
          align="split"
          eyebrow="Trust by design"
          id="trust-heading"
          title="Accurate, private and always under your control."
          lead="An AI that speaks for your business has to be one you can trust. These are rules in the product, not promises in a brochure."
        >
          <Link href="/security" className="mt-6 inline-flex items-center gap-2 text-[15px] font-medium text-ds-accent">
            Security &amp; trust <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </SectionHeading>
        <ul className="mt-16 grid gap-px overflow-hidden rounded-[28px] border border-ds-border bg-ds-border sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p, i) => (
            <Reveal as="li" key={p.title} delay={(i % 3) * 0.06} className="bg-ds-bg p-7 lg:p-8">
              <span className="flex size-10 items-center justify-center rounded-xl border border-ds-border bg-ds-surface text-ds-accent">
                <p.icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-[17px] font-medium text-ds-text-primary">{p.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ds-text-secondary">{p.body}</p>
            </Reveal>
          ))}
        </ul>
      </Section>

      {/* Solutions */}
      <Section labelledBy="solutions-heading">
        <SectionHeading
          align="split"
          eyebrow="Solutions"
          id="solutions-heading"
          title="Made for businesses that sell through conversations."
          lead="If your customers ask before they buy, Waves AI Pilot answers them, qualifies them and gets them booked."
        >
          <Link href="/solutions" className="mt-6 inline-flex items-center gap-2 text-[15px] font-medium text-ds-accent">
            All solutions <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </SectionHeading>
        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INDUSTRIES.slice(0, 7).map((ind, i) => (
            <Reveal as="li" key={ind.href} delay={(i % 4) * 0.05}>
              <Link href={ind.href} className="group flex h-full flex-col rounded-[22px] border border-ds-border bg-ds-surface p-6 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-ds-border-strong hover:shadow-[0_20px_40px_-28px_rgba(21,23,19,0.4)]">
                <span className="flex size-10 items-center justify-center rounded-xl bg-ds-lime-soft text-ds-accent">
                  <ind.icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-[16.5px] font-medium text-ds-text-primary">{ind.label}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ds-text-secondary">{ind.description}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-[13.5px] font-medium text-ds-accent">
                  Learn more <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            </Reveal>
          ))}
          <Reveal as="li" delay={0.15}>
            <Link href="/solutions" className="flex h-full flex-col justify-between site-ink rounded-[22px] p-6">
              <Building2 className="size-6 text-[#b2ff38]" aria-hidden="true" />
              <span>
                <span className="block text-[16.5px] font-medium">Your industry not listed?</span>
                <span className="mt-1.5 block text-[14px] text-white/60">If you sell through conversations, it fits.</span>
              </span>
            </Link>
          </Reveal>
        </ul>
      </Section>

      {/* Pricing teaser */}
      <Section className="bg-ds-surface" labelledBy="pricing-heading">
        <SectionHeading
          align="center"
          eyebrow="Pricing"
          id="pricing-heading"
          title="Simple plans. GST included."
          lead={`Pay for the AI replies you need. Start with a ${TRIAL_DAYS}-day free trial on every channel, no card required.`}
        />
        <div className="mx-auto mt-14 grid max-w-[1040px] gap-5 md:grid-cols-3">
          {ORDERED_PLANS.map((plan, i) => (
            <Reveal key={plan.key} delay={i * 0.06}>
              <div
                className={`relative flex h-full flex-col rounded-[26px] border p-7 ${
                  plan.featured ? "site-ink border-transparent" : "border-ds-border bg-ds-bg"
                }`}
              >
                {plan.featured ? (
                  <span className="absolute right-6 top-6 rounded-full bg-[#b2ff38] px-2.5 py-1 text-[11px] font-semibold text-[#11160a]">Most popular</span>
                ) : null}
                <h3 className="text-[18px] font-medium">{plan.name}</h3>
                <p className={`mt-2 text-[14px] leading-relaxed ${plan.featured ? "text-white/65" : "text-ds-text-secondary"}`}>{plan.tagline}</p>
                <p className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-[38px] font-normal tracking-[-0.03em] tabular-nums">{formatPaiseAsInr(plan.monthlyPricePaise)}</span>
                  <span className={`text-[14px] ${plan.featured ? "text-white/60" : "text-ds-text-muted"}`}>/ month</span>
                </p>
                <p className={`mt-1 text-[13px] ${plan.featured ? "text-white/55" : "text-ds-text-muted"}`}>{formatReplyQuota(plan.monthlyReplyQuota)} · {plan.seatsLabel}</p>
                <div className="mt-auto pt-7">
                  <Link
                    href="/sign-up"
                    className={`site-btn w-full ${plan.featured ? "bg-[#b2ff38] text-[#11160a] hover:bg-[#c3ff63]" : "site-btn-secondary"}`}
                  >
                    Start free trial
                  </Link>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-8 text-center text-[14px] text-ds-text-secondary">
          Annual billing gives you two months free.{" "}
          <Link href="/pricing" className="site-link">
            Compare plans in detail
          </Link>
        </p>
      </Section>

      {/* FAQ */}
      <Section labelledBy="faq-heading">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <Reveal>
              <Eyebrow>FAQ</Eyebrow>
              <h2 id="faq-heading" className="site-h2 mt-5">
                Questions, answered.
              </h2>
              <p className="site-lead mt-5">Can&apos;t find what you need? Talk to us directly.</p>
              <div className="mt-6">
                <CheckList items={["support@waveswebstudio.in", "+91 79815 96249"]} />
              </div>
            </Reveal>
          </div>
          <div className="lg:col-span-8">
            <Reveal delay={0.08}>
              <FaqList items={FAQS} />
            </Reveal>
          </div>
        </div>
      </Section>

      <CtaBand />
    </main>
  );
}

function BentoCard({
  title,
  body,
  href,
  className = "",
  small = false,
  children,
}: {
  title: string;
  body: string;
  href?: string;
  className?: string;
  small?: boolean;
  children: ReactNode;
}) {
  return (
    <Reveal className={`flex flex-col overflow-hidden rounded-[28px] border border-ds-border bg-ds-bg ${small ? "p-5" : "p-6"} ${className}`}>
      <div className={small ? "min-h-[96px]" : "min-h-[300px]"}>{children}</div>
      <div className={small ? "mt-5" : "mt-7"}>
        <h3 className={small ? "text-[15.5px] font-medium" : "site-h3"}>{title}</h3>
        <p className={`mt-1.5 leading-relaxed text-ds-text-secondary ${small ? "text-[13.5px]" : "text-[14.5px]"}`}>{body}</p>
        {href ? (
          <Link href={href} className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ds-accent">
            Learn more <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </Reveal>
  );
}
