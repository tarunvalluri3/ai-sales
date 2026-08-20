import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | AI Sales",
};

/**
 * Placeholder fields ([Legal entity name] etc.) are intentional — the
 * user chose to fill in real legal identity/contact/jurisdiction details
 * later rather than have them fabricated here (Phase 22, STATE.md).
 * Everything else describes actual data flows in this codebase only.
 */
export default function PrivacyPolicyPage() {
  return (
    <div className="flex flex-1 flex-col bg-ds-bg px-6 py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-ds-text-primary">Privacy Policy</h1>
          <p className="text-sm text-ds-text-muted">Last updated: 2026-08-20</p>
        </div>

        <Section title="Who this policy covers">
          <p>
            This policy is published by <strong>[Legal entity name]</strong> (&quot;AI Sales,&quot;
            &quot;we,&quot; &quot;us&quot;). It applies to (1) businesses that create an AI Sales account
            (&quot;customers&quot;) and their team members, and (2) prospects who chat with a customer&apos;s
            AI sales widget on the customer&apos;s own website (&quot;visitors&quot;). Contact
            <strong> [support email]</strong> with any privacy question or request.
          </p>
        </Section>

        <Section title="What we collect">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Account data:</strong> name, email, and organization membership, managed by our
              authentication provider, Clerk.
            </li>
            <li>
              <strong>Business content you provide:</strong> your business profile, products, services,
              FAQs, and any knowledge documents you upload for your AI employee to use.
            </li>
            <li>
              <strong>Conversation data:</strong> messages exchanged between a visitor and your AI
              employee (or your staff), plus any contact details (name, email, phone) a visitor gives
              during a conversation.
            </li>
            <li>
              <strong>Operational data:</strong> AI response timing and token counts (to monitor cost
              and performance), and error/diagnostic data captured by our error-tracking provider,
              Sentry, with authentication cookies and similar sensitive headers stripped before
              sending.
            </li>
          </ul>
        </Section>

        <Section title="How we use it">
          <p>
            Business content and knowledge documents are used only to ground that business&apos;s own AI
            employee&apos;s answers — never shared with, or used to answer, another business&apos;s
            prospects. Conversation data is used to operate the chat, qualify leads for the customer,
            and let the customer&apos;s staff take over a conversation when needed. Operational data is
            used to monitor reliability, cost, and abuse (e.g. rate limiting).
          </p>
        </Section>

        <Section title="Who processes it on our behalf">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Clerk</strong> — authentication and organization membership.
            </li>
            <li>
              <strong>Supabase</strong> — database storage for all application and conversation data,
              isolated per business.
            </li>
            <li>
              <strong>Google (Gemini)</strong> — generates AI responses and embeddings from the
              conversation and the business&apos;s approved knowledge; message content is sent to Gemini
              to produce a response.
            </li>
            <li>
              <strong>Sentry</strong> — error tracking, with sensitive headers stripped before events
              are sent.
            </li>
            <li>
              <strong>Vercel</strong> — application hosting.
            </li>
          </ul>
        </Section>

        <Section title="Retention and deletion">
          <p>
            We retain business and conversation data for as long as the customer&apos;s account is
            active, plus a reasonable period after account closure to allow recovery from accidental
            deletion, unless a shorter period is required by law or a longer period is requested in
            writing. A customer or visitor may request access to, export of, or deletion of their data
            at any time — see &quot;Your rights&quot; below.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Depending on where you are located, you may have rights to access, correct, export, or
            delete your personal data, and to object to or restrict certain processing (for example,
            under the EU/UK GDPR or India&apos;s DPDP Act). To exercise any of these rights, contact
            <strong> [support email]</strong>. We will verify the request and respond within the
            timeframe required by applicable law. Requests are currently handled manually by our team;
            we will confirm what data was found, exported, or deleted.
          </p>
        </Section>

        <Section title="Governing law">
          <p>This policy is governed by the laws of <strong>[governing jurisdiction]</strong>.</p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We will update the &quot;Last updated&quot; date above when this policy changes and, for
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
