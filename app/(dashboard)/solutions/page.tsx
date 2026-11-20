import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, Target } from "lucide-react";
import { PageHero } from "@/components/site/feature-block";
import { CtaBand } from "@/components/site/cta-band";
import { Btn, Reveal, Section, SectionHeading } from "@/components/site/primitives";
import { DEMO_HREF } from "@/components/site/links";
import { IndustryCloud } from "@/components/site/hero-asides";
import { INDUSTRY_PAGES } from "@/components/site/industries";
import { INDUSTRIES } from "@/components/site/nav-data";
import { JsonLd, breadcrumbLd, pageMetadata } from "@/components/site/seo";

export const metadata = pageMetadata({
  title: "AI Sales Agent Solutions by Industry | Waves AI Pilot",
  description:
    "How businesses use Waves AI Pilot, the AI chatbot and sales agent for website, WhatsApp and Instagram: real estate, clinics, coaching institutes, salons, D2C brands, agencies and travel. Lead generation, appointment setting and after-hours coverage.",
  path: "/solutions",
  keywords: ["AI chatbot by industry", "AI lead generation", "appointment setting chatbot", "after-hours customer enquiries", "WhatsApp chatbot for business"],
});

const GOALS = [
  {
    id: "lead-generation",
    icon: Target,
    title: "Lead generation",
    body: "Turn anonymous website visitors and DMs into named, scored leads with contact details, a summary and a next step.",
    points: ["Captures name, email and phone in conversation", "Hot / warm / cold with a 0–11 score", "Instant alerts for hot leads"],
  },
  {
    id: "appointment-setting",
    icon: CalendarDays,
    title: "Appointment setting",
    body: "Offer real open slots in the chat and receive appointment requests ready to confirm, without the back-and-forth.",
    points: ["Slots from your business hours", "No double-booking across channels", "Prospect notified on confirmation"],
  },
  {
    id: "after-hours",
    icon: Clock3,
    title: "After-hours coverage",
    body: "Answer the 11 PM enquiry like it's 11 AM. Your team picks up qualified leads the next morning.",
    points: ["Accurate answers around the clock", "Hands off to people during business hours", "Copilot lists who to call first"],
  },
];

export default function SolutionsPage() {
  return (
    <main className="flex flex-1 flex-col">
      <JsonLd data={breadcrumbLd([{ name: "Solutions", path: "/solutions" }])} />
      <PageHero
        eyebrow="Solutions"
        title="An AI sales agent for every business that sells through conversations."
        lead="If your customers ask questions before they buy, Waves AI Pilot answers them, qualifies them and books them, on your website, WhatsApp and Instagram, whatever your industry."
        aside={<IndustryCloud />}
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Btn href="/sign-up">Start your free trial</Btn>
          <Btn href={DEMO_HREF} variant="secondary">
            Book a demo
          </Btn>
        </div>
      </PageHero>

      <Section id="industries" labelledBy="ind-heading">
        <SectionHeading
          align="split"
          eyebrow="By industry"
          id="ind-heading"
          title="Solutions built around how your industry sells."
          lead="Each industry page shows the conversations Waves AI Pilot handles, the questions it answers and the features that matter most."
        />
        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {INDUSTRY_PAGES.map((ind, i) => {
            const Icon = INDUSTRIES.find((n) => n.href === `/solutions/${ind.slug}`)?.icon;
            return (
              <Reveal as="li" key={ind.slug} delay={(i % 3) * 0.06}>
                <Link
                  href={`/solutions/${ind.slug}`}
                  className="group flex h-full flex-col rounded-[26px] border border-ds-border bg-ds-surface p-7 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-ds-border-strong hover:shadow-[0_20px_40px_-28px_rgba(21,23,19,0.4)]"
                >
                  {Icon ? (
                    <span className="flex size-11 items-center justify-center rounded-xl bg-ds-lime-soft text-ds-accent">
                      <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                  ) : null}
                  <h3 className="site-h3 mt-6">{ind.name}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-ds-text-secondary">{ind.lead}</p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-[14px] font-medium text-ds-accent">
                    AI sales agent for {ind.name.toLowerCase()}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </ul>
      </Section>

      <Section className="bg-ds-surface" labelledBy="goals-heading">
        <SectionHeading align="center" eyebrow="By goal" id="goals-heading" title="Three jobs it does for every business." />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {GOALS.map((g, i) => (
            <Reveal key={g.id} delay={i * 0.06}>
              <article id={g.id} className="h-full scroll-mt-28 rounded-[26px] border border-ds-border bg-ds-bg p-7">
                <span className="site-ink flex size-11 items-center justify-center rounded-xl !text-[#b2ff38]">
                  <g.icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <h3 className="site-h3 mt-6">{g.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ds-text-secondary">{g.body}</p>
                <ul className="mt-5 flex flex-col gap-2 border-t border-ds-border pt-5">
                  {g.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5 text-[14px] text-ds-text-secondary">
                      <span className="size-1.5 rounded-full bg-[#7fbf1f]" aria-hidden="true" />
                      {p}
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <div className="pt-20 lg:pt-28">
        <CtaBand title="Your industry, your knowledge, your AI sales agent." />
      </div>
    </main>
  );
}
