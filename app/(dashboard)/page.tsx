import Link from "next/link";
import { ConversationMockup } from "./_components/homepage/conversation-mockup";
import { Reveal } from "./_components/homepage/reveal";

const WORKFLOW_STEPS = [
  { label: "Configure your business", detail: "Identity, products, services, and FAQs." },
  { label: "Add approved knowledge", detail: "Chunked, embedded, and scoped to your business only." },
  { label: "AI talks to prospects", detail: "Grounded answers from your own approved information." },
  { label: "AI qualifies leads", detail: "Hot, warm, or cold — a signal for your team, not a verdict." },
  { label: "Human takes over", detail: "On request, on a repeated unknown, or on a complaint." },
];

const CAPABILITIES = [
  {
    title: "Grounded conversations",
    detail:
      "Every answer comes from your business's own products, services, FAQs, and approved knowledge — never invented, never borrowed from another business on the platform.",
  },
  {
    title: "Tenant-scoped knowledge",
    detail:
      "Your knowledge is chunked, embedded, and retrieved against your business only. There is no shared knowledge base between businesses.",
  },
  {
    title: "Lead qualification",
    detail:
      "The AI reads intent across a conversation and assigns hot/warm/cold with a short reason — always visible as an AI signal, never a substitute for your own judgment.",
  },
  {
    title: "Human handoff",
    detail:
      "When a prospect asks for a person, hits a repeated unknown, or raises a complaint, the AI flags it and a team member can take the conversation over live.",
  },
  {
    title: "Conversations, in one place",
    detail:
      "Every conversation your AI employee has — live, searchable, and reviewable — with clear attribution between AI, prospect, and staff replies.",
  },
  {
    title: "Analytics that mean something",
    detail:
      "Conversation volume, conversion rate, and lead breakdowns pulled from what actually happened, not vanity metrics.",
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col bg-ds-bg">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-ds-border px-6 py-20 md:py-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(600px circle at 15% 20%, rgba(215,242,78,0.08), transparent 60%)",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-ds-border-strong px-3 py-1 text-2xs font-medium tracking-wide-ds text-ds-text-secondary uppercase">
              <span className="size-1.5 rounded-full bg-ds-accent" aria-hidden="true" />
              AI sales employee
            </span>
            <h1 className="text-4xl leading-tight font-semibold text-ds-text-primary md:text-5xl">
              Give your business an AI employee that actually knows it.
            </h1>
            <p className="max-w-lg text-base text-ds-text-secondary md:text-lg">
              AI Sales answers prospects using your own products, services, FAQs, and approved
              knowledge — qualifies who&apos;s worth your time, and hands off to a human the moment one
              is genuinely needed.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/sign-up"
                className="rounded-ds-sm bg-ds-accent px-5 py-3 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              >
                Get started
              </Link>
              <Link
                href="/sign-in"
                className="rounded-ds-sm border border-ds-border-strong px-5 py-3 text-sm font-semibold text-ds-text-primary transition-colors hover:border-ds-accent-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              >
                Sign in
              </Link>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <ConversationMockup />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-ds-border px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <h2 className="text-center text-2xl font-semibold text-ds-text-primary md:text-3xl">
              How it works
            </h2>
          </Reveal>
          <div className="mt-12 flex flex-col gap-6">
            {WORKFLOW_STEPS.map((step, index) => (
              <Reveal key={step.label} delay={index * 0.05}>
                <div className="flex items-start gap-5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-ds-accent-muted text-sm font-semibold text-ds-accent">
                    {index + 1}
                  </span>
                  <div className="flex flex-col gap-1 border-b border-ds-border pb-6">
                    <p className="text-sm font-semibold text-ds-text-primary">{step.label}</p>
                    <p className="text-sm text-ds-text-secondary">{step.detail}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="border-b border-ds-border px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="flex flex-col items-center gap-2 text-center">
              <h2 className="text-2xl font-semibold text-ds-text-primary md:text-3xl">
                What your AI employee actually does
              </h2>
              <p className="max-w-xl text-sm text-ds-text-secondary">
                Not a generic chatbot — an employee of your specific business, scoped to what you&apos;ve approved it to know.
              </p>
            </div>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((capability, index) => (
              <Reveal key={capability.title} delay={(index % 3) * 0.05}>
                <div className="flex h-full flex-col gap-2 rounded-ds-lg border border-ds-border bg-ds-surface p-5 transition-colors hover:border-ds-border-strong">
                  <h3 className="text-sm font-semibold text-ds-text-primary">{capability.title}</h3>
                  <p className="text-sm text-ds-text-secondary">{capability.detail}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-20">
        <Reveal>
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 rounded-ds-lg border border-ds-border-strong bg-ds-surface px-8 py-14 text-center">
            <h2 className="text-2xl font-semibold text-ds-text-primary md:text-3xl">
              Your business already has the answers. Give your AI employee access to them.
            </h2>
            <Link
              href="/sign-up"
              className="rounded-ds-sm bg-ds-accent px-6 py-3 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              Get started
            </Link>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-ds-border px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2 text-sm font-semibold text-ds-text-primary">
            <span className="size-2 rounded-full bg-ds-accent" aria-hidden="true" />
            AI Sales
          </div>
          <p className="text-2xs text-ds-text-muted">An AI sales employee, grounded in your own business.</p>
          <div className="flex items-center gap-4 text-2xs text-ds-text-muted">
            <Link href="/privacy" className="transition-colors hover:text-ds-text-primary">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-ds-text-primary">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
