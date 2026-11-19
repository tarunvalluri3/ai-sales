import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, MessageCircleQuestion } from "lucide-react";
import { PageHero } from "@/components/site/feature-block";
import { CtaBand } from "@/components/site/cta-band";
import { FaqList } from "@/components/site/faq";
import { Btn, CheckList, Eyebrow, Reveal, Section, SectionHeading } from "@/components/site/primitives";
import { INDUSTRY_PAGES, industryBySlug } from "@/components/site/industries";
import { DEMO_HREF } from "@/components/site/links";
import { JsonLd, breadcrumbLd, faqLd, pageMetadata } from "@/components/site/seo";

/*
 * Industry landing page, one per entry in components/site/industries.tsx,
 * statically generated. Each has its own search title, description,
 * keywords, FAQ (as FAQPage structured data) and breadcrumb.
 */

export function generateStaticParams() {
  return INDUSTRY_PAGES.map((i) => ({ slug: i.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const ind = industryBySlug(slug);
  if (!ind) return {};
  return pageMetadata({ title: ind.metaTitle, description: ind.metaDescription, path: `/solutions/${ind.slug}`, keywords: ind.keywords });
}

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ind = industryBySlug(slug);
  if (!ind) notFound();
  const others = INDUSTRY_PAGES.filter((i) => i.slug !== ind.slug).slice(0, 3);

  return (
    <main className="flex flex-1 flex-col">
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Solutions", path: "/solutions" },
            { name: ind.name, path: `/solutions/${ind.slug}` },
          ]),
          faqLd(ind.faq),
        ]}
      />

      <PageHero eyebrow={`Solutions · ${ind.name}`} title={ind.h1} lead={ind.lead} aside={<div className="flex justify-center">{ind.visual}</div>}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Btn href="/sign-up">Start your free trial</Btn>
          <Btn href={DEMO_HREF} variant="secondary">
            Book a demo
          </Btn>
        </div>
        <nav aria-label="Breadcrumb" className="mt-8 text-[13px] text-ds-text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-ds-text-primary">Home</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/solutions" className="hover:text-ds-text-primary">Solutions</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-ds-text-secondary">{ind.name}</li>
          </ol>
        </nav>
      </PageHero>

      <Section labelledBy="ind-why">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <Eyebrow>The challenge</Eyebrow>
            <h2 id="ind-why" className="site-h2 mt-5">
              Every unanswered message is a customer lost.
            </h2>
            <p className="site-lead mt-5">{ind.problem}</p>
          </Reveal>
          <Reveal delay={0.08} className="lg:col-span-7">
            <div className="rounded-[28px] border border-ds-border bg-ds-surface p-7 sm:p-9">
              <h3 className="site-h3">What Waves AI Pilot does for {ind.name.toLowerCase()}</h3>
              <CheckList items={ind.points} className="mt-6" />
            </div>
          </Reveal>
        </div>
      </Section>

      <Section className="bg-ds-surface" labelledBy="ind-q">
        <SectionHeading
          align="center"
          eyebrow="Answered instantly"
          id="ind-q"
          title="The questions your customers ask, answered 24/7."
          lead="From your own approved information, on your website, WhatsApp and Instagram."
        />
        <ul className="mx-auto mt-12 flex max-w-[900px] flex-wrap justify-center gap-3">
          {ind.questions.map((q, i) => (
            <Reveal as="li" key={q} delay={i * 0.04}>
              <span className="inline-flex items-center gap-2 rounded-full border border-ds-border bg-ds-bg px-4 py-2.5 text-[15px] text-ds-text-primary">
                <MessageCircleQuestion className="size-4 text-ds-accent" aria-hidden="true" />
                {q}
              </span>
            </Reveal>
          ))}
        </ul>
      </Section>

      <Section labelledBy="ind-f">
        <SectionHeading align="split" eyebrow="Features" id="ind-f" title={`Built for ${ind.name.toLowerCase()} teams.`}>
          <Link href="/product" className="mt-5 inline-flex items-center gap-2 text-[15px] font-medium text-ds-accent">
            See every feature <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </SectionHeading>
        <ul className="mt-12 grid gap-5 md:grid-cols-3">
          {ind.features.map((f, i) => (
            <Reveal as="li" key={f.title} delay={i * 0.06} className="rounded-[24px] border border-ds-border bg-ds-surface p-7">
              <span className="font-label text-[12px] text-ds-text-muted">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-4 text-[17px] font-medium">{f.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ds-text-secondary">{f.body}</p>
            </Reveal>
          ))}
        </ul>
      </Section>

      <Section className="bg-ds-surface" labelledBy="ind-faq">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-4">
            <Eyebrow>FAQ</Eyebrow>
            <h2 id="ind-faq" className="site-h2 mt-5">
              {ind.name}: common questions
            </h2>
          </Reveal>
          <Reveal delay={0.08} className="lg:col-span-8">
            <FaqList items={ind.faq.map((f) => ({ q: f.q, a: f.a }))} />
          </Reveal>
        </div>
      </Section>

      <Section labelledBy="ind-more">
        <SectionHeading eyebrow="More solutions" id="ind-more" title="Other industries we serve." />
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={`/solutions/${o.slug}`} className="group flex h-full flex-col rounded-[22px] border border-ds-border bg-ds-surface p-6 transition-colors hover:border-ds-border-strong">
                <span className="text-[16.5px] font-medium text-ds-text-primary">{o.name}</span>
                <span className="mt-1.5 text-[14px] leading-relaxed text-ds-text-secondary">{o.h1}</span>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-[13.5px] font-medium text-ds-accent">
                  Explore <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-[12.5px] text-ds-text-muted">The conversation shown on this page is a sample with an illustrative business.</p>
      </Section>

      <CtaBand title={`Put an AI sales agent to work for your ${ind.name.toLowerCase().replace(" & ", " and ")} business.`} />
    </main>
  );
}
