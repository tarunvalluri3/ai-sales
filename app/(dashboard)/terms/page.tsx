import Link from "next/link";

export const metadata = {
  title: "Terms of Service | Waves AI Pilot",
};

/**
 * Real legal identity, contact, and jurisdiction filled in 2026-10-19,
 * replacing Phase 22a's deliberate placeholders. Governed by Indian law
 * with exclusive jurisdiction at Hyderabad, Telangana (the proprietor's
 * principal place of business). See the matching note in
 * app/(dashboard)/privacy/page.tsx for the three regimes these pages are
 * written to.
 *
 * Deliberately NOT claimed anywhere below: an uptime SLA, a support
 * response time beyond the grievance-redressal commitment, or any
 * channel this service cannot actually deliver today -- advertising a
 * capability that does not work would be an unfair trade practice under
 * the Consumer Protection Act, 2019, not merely over-promising.
 */
export default function TermsOfServicePage() {
  return (
    <div className="flex flex-1 flex-col bg-ds-bg px-6 py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-ds-text-primary">Terms of Service</h1>
          <p className="text-sm text-ds-text-muted">Last updated: 2026-10-19</p>
        </div>

        <Section title="Agreement">
          <p>
            These terms form a binding agreement between <strong>Waves Web Studio</strong>, a sole
            proprietorship registered in India (GSTIN 36BYQPT2686E1ZR) with its principal place of
            business at Plot No. 19, Venkatramana Colony, Phase-1, Street-2, Dammaiguda, Hyderabad,
            Telangana 500083, India (&quot;Waves AI Pilot,&quot; &quot;we,&quot; &quot;us&quot;), and
            the business or person creating a Waves AI Pilot account (&quot;customer,&quot;
            &quot;you&quot;).
          </p>
          <p>
            By creating an account or using Waves AI Pilot, you confirm that you are at least 18 years
            old, that you have authority to enter into this agreement on behalf of the business you
            represent, and that you agree to these terms.
          </p>
        </Section>

        <Section title="What Waves AI Pilot does">
          <p>
            Waves AI Pilot lets a business configure an AI sales employee grounded in that
            business&apos;s own products, services, FAQs, and approved knowledge, to talk with
            prospects through a chat widget the business embeds on its own site, qualify leads, book
            appointment requests, and hand off to a human when needed.
          </p>
          <p>
            Additional messaging channels may be available depending on your plan and on your own
            accounts with third-party platforms. Where a channel requires credentials or approvals
            from a third party such as Meta, your use of that channel depends on that third
            party&apos;s own terms, review processes, and availability, which are outside our control.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            You are responsible for keeping your sign-in credentials confidential, for the actions of
            every team member you invite, and for assigning each of them an appropriate role. Tell us
            promptly if you believe an account has been accessed without authorization.
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
              widget collects a visitor&apos;s personal contact details, for publishing your own
              privacy notice to those visitors, and for how your team subsequently uses the lead data
              Waves AI Pilot surfaces to you. In data protection terms you are the Data Fiduciary for
              your visitors&apos; data and we are your Data Processor — see the{" "}
              <Link href="/privacy" className="font-medium text-ds-accent hover:text-ds-accent-strong">
                Privacy Policy
              </Link>
              .
            </li>
            <li>
              You must not attempt to access another customer&apos;s data, account, or conversations;
              probe, scan, or load-test the service without our written consent; resell or white-label
              the service without a separate agreement; or use it to send unsolicited bulk messages in
              breach of applicable law or a platform&apos;s own rules.
            </li>
            <li>
              You must not use the service to deceive a prospect about whether they are talking to a
              human or to an AI.
            </li>
          </ul>
        </Section>

        <Section title="AI output">
          <p>
            AI-generated answers, lead qualification labels, scores, suggested tags, and summaries are
            automated signals, not verified facts and not professional advice. Waves AI Pilot is
            designed to answer only from your approved content and to decline when it does not know
            something, but it may still be wrong.
          </p>
          <p>
            You are responsible for reviewing AI output before relying on it for decisions that
            matter. An appointment the AI records is always a <em>request</em> pending your own
            confirmation, never a confirmed booking, and the AI never sends a follow-up message on
            your behalf without a member of your team choosing to send it.
          </p>
        </Section>

        <Section title="Fees, taxes and payment">
          <p>
            Paid plans and their inclusions are set out on our{" "}
            <Link href="/pricing" className="font-medium text-ds-accent hover:text-ds-accent-strong">
              Pricing
            </Link>{" "}
            page. Fees are stated in Indian Rupees and are exclusive of GST, which is charged
            additionally at the applicable rate and shown on your invoice. Subscriptions renew
            automatically for successive periods until cancelled.
          </p>
          <p>
            If a payment fails we may retry it and may suspend access to paid features until payment
            succeeds. We will tell you before suspending. We may change our prices, and will give you
            at least 30 days&apos; notice by email before a change affects your renewal; your
            continued use after that date is acceptance of the new price.
          </p>
        </Section>

        <Section title="Cancellation and refunds">
          <p>
            You may cancel at any time, and cancellation takes effect at the end of your current paid
            period. Fees already paid are not refundable. The full terms, including the narrow
            exceptions where we do issue a refund, are set out in our{" "}
            <Link href="/refunds" className="font-medium text-ds-accent hover:text-ds-accent-strong">
              Cancellation and Refunds Policy
            </Link>
            , which forms part of these terms.
          </p>
        </Section>

        <Section title="Availability and usage limits">
          <p>
            We aim for the service to be reliably available but do not guarantee uninterrupted uptime,
            and we do not offer a contractual service level agreement on any plan described on our
            Pricing page. We may carry out maintenance that briefly interrupts the service, and will
            try to schedule it outside Indian business hours where we can.
          </p>
          <p>
            To keep the service fair and sustainable, each customer&apos;s AI usage is subject to rate
            limits and a monthly quota appropriate to their plan. If a quota is reached, the AI widget
            degrades gracefully — a visitor is told a person will follow up, and the conversation is
            flagged for your team — rather than failing silently or fabricating an answer. We will
            tell you when you are approaching your quota so you can upgrade if you want to.
          </p>
        </Section>

        <Section title="Your content and our service">
          <p>
            You keep all rights in the business content, knowledge, and conversation data associated
            with your account. You grant us only the licence we need to host, process, and display
            that content in order to operate the service for you — including sending relevant parts of
            it to the AI provider named in our Privacy Policy in order to generate a response. We do
            not use your content to train or fine-tune any general-purpose AI model.
          </p>
          <p>
            We keep all rights in the Waves AI Pilot software, interface, and documentation. Nothing
            here transfers any of it to you.
          </p>
        </Section>

        <Section title="Data and deletion">
          <p>
            Our handling of your data is described in the{" "}
            <Link href="/privacy" className="font-medium text-ds-accent hover:text-ds-accent-strong">
              Privacy Policy
            </Link>
            . You can export and permanently delete your account&apos;s data from the dashboard at any
            time, or ask us to do it for you using the contact details below. After an account is
            closed we retain data only for the short recovery window and the statutory tax-record
            period described in that policy.
          </p>
        </Section>

        <Section title="Termination">
          <p>
            You may stop using Waves AI Pilot at any time. We may suspend or terminate an account for
            material breach of these terms — including unlawful use, non-payment, or attempts to access
            another customer&apos;s data — and will give you notice and a reasonable chance to fix the
            problem first, except where the breach is serious enough that immediate suspension is
            necessary to protect the service or another customer.
          </p>
          <p>
            If we discontinue the service entirely, we will give you at least 30 days&apos; notice and
            a window to export your data.
          </p>
        </Section>

        <Section title="Disclaimer and liability">
          <p>
            To the extent permitted by law, Waves AI Pilot is provided &quot;as is,&quot; without
            warranties of any kind, express or implied, including any implied warranty of
            merchantability, fitness for a particular purpose, or non-infringement.
          </p>
          <p>
            To the maximum extent permitted by law, Waves Web Studio is not liable for indirect,
            incidental, special, or consequential damages, or for lost profits, lost revenue, lost
            business, or lost or corrupted data, arising from your use of the service. Our total
            aggregate liability arising out of or relating to this agreement is limited to the total
            fees you actually paid us in the twelve months immediately before the event giving rise to
            the claim.
          </p>
          <p>
            Nothing in these terms excludes or limits any liability that cannot lawfully be excluded or
            limited, including liability for fraud or for death or personal injury caused by
            negligence. If you are a consumer within the meaning of the Consumer Protection Act, 2019,
            nothing here affects the rights that Act gives you.
          </p>
        </Section>

        <Section title="Indemnity">
          <p>
            You will indemnify us against third-party claims arising from content you upload, from your
            use of the service in breach of these terms or of applicable law, or from your failure to
            obtain a consent you were responsible for obtaining from a visitor.
          </p>
        </Section>

        <Section title="Grievance redressal">
          <p>
            For any complaint about the service, contact our Grievance Officer. Complaints are
            acknowledged within <strong>48 hours</strong> and redressed within{" "}
            <strong>one month</strong> of receipt.
          </p>
          <div className="flex flex-col gap-1 rounded-ds-sm border border-ds-border bg-ds-surface p-4">
            <p className="font-medium text-ds-text-primary">Tarun Valluri</p>
            <p>Proprietor and Grievance Officer, Waves Web Studio</p>
            <p>
              Email:{" "}
              <a
                href="mailto:support@waveswebstudio.in"
                className="font-medium text-ds-accent hover:text-ds-accent-strong"
              >
                support@waveswebstudio.in
              </a>
            </p>
            <p>
              Phone:{" "}
              <a href="tel:+917981596249" className="font-medium text-ds-accent hover:text-ds-accent-strong">
                +91 79815 96249
              </a>
            </p>
          </div>
        </Section>

        <Section title="Governing law and jurisdiction">
          <p>
            These terms are governed by the laws of India. The courts at Hyderabad, Telangana have
            exclusive jurisdiction over any dispute arising out of or relating to these terms or the
            service. Before starting proceedings, both of us will try in good faith to resolve the
            dispute by discussion for 30 days.
          </p>
        </Section>

        <Section title="General">
          <p>
            These terms, together with the Privacy Policy and the Cancellation and Refunds Policy, are
            the entire agreement between us about the service. If any provision is held unenforceable,
            the rest stays in force. We may assign this agreement to a successor entity — for example
            if the proprietorship is later incorporated as a company — and will tell you if we do. Our
            not enforcing a provision on one occasion is not a waiver of it.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            We will update the &quot;Last updated&quot; date above when these terms change and, for
            material changes, give you at least 30 days&apos; notice by email before they take effect.
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
