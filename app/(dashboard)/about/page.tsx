import Link from "next/link";

export const metadata = {
  title: "About Us | Waves AI Pilot",
};

/**
 * Required by Razorpay's merchant-activation website check ("About us").
 * Every claim here is one the business can actually stand behind -- no
 * invented team size, no invented customer count, no invented funding.
 */
export default function AboutPage() {
  return (
    <div className="flex flex-1 flex-col bg-ds-bg px-6 py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-3">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-ds-border-strong px-3 py-1 text-2xs font-medium tracking-wide-ds text-ds-text-secondary uppercase">
            <span className="size-1.5 rounded-full bg-ds-accent" aria-hidden="true" />
            About
          </span>
          <h1 className="text-3xl font-semibold text-ds-text-primary">About Us</h1>
          <p className="text-sm text-ds-text-muted">
            Waves AI Pilot is built and operated by Waves Web Studio.
          </p>
        </div>

        <Section title="Who we are">
          <p>
            <strong>Waves Web Studio</strong> is an independent, bootstrapped web and AI development
            studio based in Hyderabad, India, founded in June 2026 and registered as an MSME under
            Udyam. We build web and AI software for businesses, and we fund our own products with that
            client work rather than with outside investment.
          </p>
          <p>
            <strong>Waves AI Pilot</strong> is our own product. It is operated directly by Waves Web
            Studio — there is no reseller, no intermediary, and no third party between you and the
            people who wrote the software.
          </p>
        </Section>

        <Section title="What we built, and why">
          <p>
            Most businesses lose prospects in the gap between interest and a reply. Someone lands on
            your website at 11pm, has one specific question, does not get an answer, and goes
            somewhere else. Generic chatbots did not fix this, because a bot that cannot answer
            accurately about <em>your</em> products is worse than no bot at all — it guesses, and a
            confident wrong answer costs you the sale and your credibility.
          </p>
          <p>
            Waves AI Pilot takes a different approach. You give it your real products, services, FAQs,
            and whatever documents you already have. It answers only from that approved material, and
            when it does not know something it says so and asks a question instead of inventing an
            answer. It qualifies the prospect over the conversation, captures their details, books
            appointment requests for your confirmation, and hands over to your team the moment a human
            is genuinely needed.
          </p>
        </Section>

        <Section title="How we work">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Your data is yours.</strong> We do not use your business content or your
              visitors&apos; conversations to train general-purpose AI models. You can export
              everything, and delete everything, from your own dashboard.
            </li>
            <li>
              <strong>One business never sees another&apos;s data.</strong> Every business&apos;s
              knowledge and conversations are isolated at the database level, and we verify that
              isolation with an automated test suite on every change we ship.
            </li>
            <li>
              <strong>The AI does not act on its own.</strong> It drafts, recommends, and flags. A
              person on your team sends the message, confirms the appointment, and makes the call.
            </li>
            <li>
              <strong>We say what the product cannot do.</strong> If a feature is not ready, or
              depends on an approval from a third party we do not control, we tell you before you pay
              rather than after.
            </li>
          </ul>
        </Section>

        <Section title="Talk to us">
          <p>
            We are small, which means you get a direct line to the person who builds the product. Our
            full business and contact details — including our registered address and Grievance Officer
            — are on the{" "}
            <Link href="/contact" className="font-medium text-ds-accent hover:text-ds-accent-strong">
              Contact
            </Link>{" "}
            page, and our plans are on the{" "}
            <Link href="/pricing" className="font-medium text-ds-accent hover:text-ds-accent-strong">
              Pricing
            </Link>{" "}
            page.
          </p>
          <p>
            Email{" "}
            <a
              href="mailto:support@waveswebstudio.in"
              className="font-medium text-ds-accent hover:text-ds-accent-strong"
            >
              support@waveswebstudio.in
            </a>{" "}
            or call{" "}
            <a href="tel:+917981596249" className="font-medium text-ds-accent hover:text-ds-accent-strong">
              +91 79815 96249
            </a>
            .
          </p>
        </Section>

        <Link href="/" className="text-sm font-medium text-ds-accent hover:text-ds-accent-strong">
          ← Back home
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-ds-border pt-6">
      <h2 className="text-lg font-semibold text-ds-text-primary">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-ds-text-secondary">
        {children}
      </div>
    </section>
  );
}
