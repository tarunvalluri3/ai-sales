import Link from "next/link";

export const metadata = {
  title: "Terms of Service | AI Sales",
};

/**
 * Placeholder fields ([Legal entity name] etc.) are intentional — see the
 * matching note in app/(dashboard)/privacy/page.tsx.
 */
export default function TermsOfServicePage() {
  return (
    <div className="flex flex-1 flex-col bg-ds-bg px-6 py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-ds-text-primary">Terms of Service</h1>
          <p className="text-sm text-ds-text-muted">Last updated: 2026-08-20</p>
        </div>

        <Section title="Agreement">
          <p>
            These terms are between <strong>[Legal entity name]</strong> (&quot;AI Sales,&quot;
            &quot;we&quot;) and the business or person creating an AI Sales account
            (&quot;customer,&quot; &quot;you&quot;). By creating an account or using AI Sales, you agree
            to these terms.
          </p>
        </Section>

        <Section title="What AI Sales does">
          <p>
            AI Sales lets a business configure an AI sales employee grounded in that business&apos;s own
            products, services, FAQs, and approved knowledge, to talk with prospects through a chat
            widget the business embeds on its own site, qualify leads, and hand off to a human when
            needed.
          </p>
        </Section>

        <Section title="Your responsibilities">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              You are responsible for the accuracy of the business content and knowledge you provide —
              the AI answers only from what you approve.
            </li>
            <li>
              You must have the right to use any content you upload, and must not upload unlawful
              content or another party&apos;s confidential information without authorization.
            </li>
            <li>
              You are responsible for obtaining any consent required by applicable law before your
              widget collects a visitor&apos;s personal contact details, and for how your team uses lead
              data AI Sales surfaces to you.
            </li>
            <li>You must not attempt to access another customer&apos;s data, account, or conversations.</li>
          </ul>
        </Section>

        <Section title="AI output">
          <p>
            AI-generated answers, lead qualification labels, and summaries are automated signals, not
            verified facts or professional advice. AI Sales is designed to answer only from your
            approved content and to decline when it doesn&apos;t know something, but it may still be
            wrong. You are responsible for reviewing AI output before relying on it for decisions that
            matter.
          </p>
        </Section>

        <Section title="Availability and usage limits">
          <p>
            We aim for the service to be reliably available but do not guarantee uninterrupted uptime.
            To keep the service fair and sustainable, each customer&apos;s AI usage is subject to rate
            limits and a usage quota; if a quota is reached, the AI widget degrades gracefully (a
            visitor is told a person will follow up, and the conversation is flagged for your team)
            rather than failing silently or fabricating an answer.
          </p>
        </Section>

        <Section title="Data and deletion">
          <p>
            Our handling of your data is described in the <Link href="/privacy" className="font-medium text-ds-accent hover:text-ds-accent-strong">Privacy Policy</Link>. You may
            request export or deletion of your account&apos;s data at any time by contacting
            <strong> [support email]</strong>.
          </p>
        </Section>

        <Section title="Termination">
          <p>
            You may stop using AI Sales at any time. We may suspend or terminate an account for
            material breach of these terms, including unlawful use or attempts to access another
            customer&apos;s data.
          </p>
        </Section>

        <Section title="Disclaimer and liability">
          <p>
            AI Sales is provided &quot;as is,&quot; without warranties of any kind. To the maximum extent
            permitted by law, [Legal entity name] is not liable for indirect, incidental, or
            consequential damages arising from your use of the service.
          </p>
        </Section>

        <Section title="Governing law">
          <p>These terms are governed by the laws of <strong>[governing jurisdiction]</strong>.</p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            We will update the &quot;Last updated&quot; date above when these terms change and, for
            material changes, take reasonable steps to notify customers.
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
