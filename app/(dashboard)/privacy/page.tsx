import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Waves AI Pilot",
};

/**
 * Written to the three regimes that actually apply to this service
 * (2026-10-19, replacing Phase 22a's deliberate [Legal entity name]/
 * [support email]/[governing jurisdiction] placeholders with the real
 * values the user supplied):
 *
 *   1. IT Act 2000 s.43A + SPDI Rules 2011 -- in force today. Rule 4
 *      requires a published policy stating the types of personal and
 *      sensitive personal data collected, the purpose of collection and
 *      usage, disclosure practices, and reasonable security practices.
 *      Rule 5(9) requires a named Grievance Officer whose name and
 *      designation are published, redressing within one month.
 *   2. Consumer Protection (E-Commerce) Rules 2020 -- legal name,
 *      principal geographic address, website details, customer care
 *      email AND phone, and the grievance officer's name/designation/
 *      contact, all prominently displayed; complaints acknowledged
 *      within 48 hours and redressed within one month.
 *   3. DPDP Act 2023 + DPDP Rules 2025 -- notified 13 Nov 2025,
 *      substantive Data Fiduciary obligations and penalties from
 *      13 May 2027. Written to it now rather than retrofitted later:
 *      standalone plain-language notice, published grievance contact,
 *      breach notification, and a stated ceiling on rights requests.
 *
 * Every factual claim about data flows below describes this codebase
 * only -- the 24-month inactivity deletion job, Sentry header
 * scrubbing, per-business knowledge isolation, and the usage-quota
 * degrade are all real, implemented behavior, not aspirational copy.
 */
export default function PrivacyPolicyPage() {
  return (
    <div className="flex flex-1 flex-col bg-ds-bg px-6 py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-ds-text-primary">Privacy Policy</h1>
          <p className="text-sm text-ds-text-muted">Last updated: 2026-10-19</p>
        </div>

        <Section title="Who this policy covers">
          <p>
            This policy is published by <strong>Waves Web Studio</strong>, a sole proprietorship
            registered in India (GSTIN 36BYQPT2686E1ZR), which operates the Waves AI Pilot service
            (&quot;Waves AI Pilot,&quot; &quot;we,&quot; &quot;us&quot;).
          </p>
          <p>
            It applies to (1) businesses that create a Waves AI Pilot account (&quot;customers&quot;)
            and their team members, and (2) prospects who chat with a customer&apos;s AI sales widget
            on the customer&apos;s own website or messaging channel (&quot;visitors&quot;).
          </p>
          <p>
            Our registered address, phone number, and the contact details of the officer who handles
            privacy questions and grievances are set out under &quot;Grievance Officer&quot; below and
            on our <Link href="/contact" className="font-medium text-ds-accent hover:text-ds-accent-strong">Contact</Link> page.
          </p>
        </Section>

        <Section title="Our role: when we decide, and when our customer decides">
          <p>
            This distinction matters for who you should contact about your data, so we state it
            plainly rather than leaving it implied.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>For customer account data</strong> — the name, email, and organization
              membership of the people who sign in to Waves AI Pilot — we decide the purposes of
              processing. Under India&apos;s DPDP Act we are the <strong>Data Fiduciary</strong> for
              this data (the equivalent of a &quot;controller&quot;).
            </li>
            <li>
              <strong>For visitor conversation data</strong> — the messages a prospect exchanges with
              a business&apos;s AI employee, and any contact details they share — the{" "}
              <strong>customer business decides</strong> why that data is collected and what happens
              to it afterwards. That business is the Data Fiduciary; we act as its{" "}
              <strong>Data Processor</strong>, processing the data on its instructions in order to
              operate the service.
            </li>
          </ul>
          <p>
            In practice this means: if you are a prospect who chatted with a business&apos;s AI
            employee and you want your data accessed, corrected, or deleted, that request is properly
            addressed to <strong>that business</strong>. You may also write to us at the address below
            and we will either action it or pass it to the business responsible and tell you we have
            done so.
          </p>
        </Section>

        <Section title="What personal data we collect">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Account data:</strong> name, email address, and organization membership,
              collected and managed through our authentication provider, Clerk.
            </li>
            <li>
              <strong>Business content you provide:</strong> your business profile, products,
              services, FAQs, business hours, and any knowledge documents, files, or website
              addresses you supply for your AI employee to draw on.
            </li>
            <li>
              <strong>Conversation data:</strong> messages exchanged between a visitor and your AI
              employee or your staff, and any contact details — name, email address, phone number —
              that a visitor chooses to share during a conversation, together with the page or channel
              the conversation started from.
            </li>
            <li>
              <strong>Operational and diagnostic data:</strong> AI response timing and token counts
              (used to monitor cost, performance, and usage quotas), rate-limiting counters, an audit
              record of sensitive staff actions, and error reports captured by our error-tracking
              provider, Sentry, with authentication cookies and similar sensitive headers stripped
              before the report is sent.
            </li>
          </ul>
          <p>
            We do not operate advertising networks, we do not sell personal data, and we do not use
            your business content or your visitors&apos; conversations to train or fine-tune any
            general-purpose AI model.
          </p>
        </Section>

        <Section title="Sensitive personal data">
          <p>
            We do not ask for, and the service is not designed to collect, sensitive personal data or
            information as defined under the SPDI Rules — such as passwords in plain form, financial
            account details, health or medical records, biometric information, or data about sexual
            orientation. Passwords are handled entirely by Clerk and are never visible to us.
          </p>
          <p>
            Because a visitor types freely into a chat window, a visitor could volunteer such
            information unprompted. We ask customers not to configure their AI employee to solicit it,
            and a visitor should not share it in a chat. If you believe sensitive information was
            captured in a conversation, contact the Grievance Officer below and we will have it
            removed.
          </p>
        </Section>

        <Section title="Why we collect it, and on what basis">
          <p>
            Business content and knowledge documents are used only to ground that business&apos;s own
            AI employee&apos;s answers — never shared with, or used to answer, another business&apos;s
            prospects. Conversation data is used to operate the chat, qualify leads for the customer,
            and let the customer&apos;s staff take over a conversation when a human is needed.
            Operational data is used to monitor reliability and cost, enforce usage quotas, and detect
            and prevent abuse.
          </p>
          <p>
            For account data, we process on the basis of performing the contract you entered into when
            you created an account, and to meet our own legal and tax obligations. For visitor contact
            details, our customer is responsible for obtaining consent; our widget presents a
            standalone consent notice before contact details are stored, and a visitor who does not
            consent can still use the chat without their contact details being saved.
          </p>
        </Section>

        <Section title="Who processes data on our behalf">
          <p>
            We use the following service providers. Each processes data only to deliver the function
            described, under its own terms and security commitments.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Clerk</strong> — authentication and organization membership.
            </li>
            <li>
              <strong>Supabase</strong> — database storage for all application and conversation data,
              isolated per business at the database level.
            </li>
            <li>
              <strong>Google (Gemini)</strong> — generates AI responses and embeddings from the
              conversation and the business&apos;s approved knowledge. Message content is sent to
              Gemini in order to produce a response.
            </li>
            <li>
              <strong>Sentry</strong> — error and performance tracking, with sensitive headers
              stripped before events are sent.
            </li>
            <li>
              <strong>Resend</strong> — delivery of transactional and notification email to customers.
            </li>
            <li>
              <strong>Vercel</strong> — application hosting and request logging.
            </li>
            <li>
              <strong>Meta Platforms</strong> — only where a customer connects WhatsApp or Instagram,
              in order to receive and send messages on those channels.
            </li>
          </ul>
        </Section>

        <Section title="Transfers outside India">
          <p>
            Our service providers listed above operate globally, so personal data may be stored or
            processed on infrastructure located outside India, including in the European Union and the
            United States. Where that happens, we rely on the provider&apos;s own contractual data
            protection commitments. India&apos;s DPDP Act permits transfer outside India except to
            territories the Central Government restricts by notification; we will stop using a
            provider in a restricted territory if one is notified.
          </p>
        </Section>

        <Section title="How we protect it">
          <p>
            We maintain reasonable security practices and procedures proportionate to the data we
            hold, as required by Section 43A of the Information Technology Act, 2000 and the SPDI
            Rules, 2011. In concrete terms: all traffic is encrypted in transit over HTTPS; data is
            encrypted at rest by our database provider; each business&apos;s data is isolated at the
            database level by row-level security policies, and that isolation is verified by an
            automated test suite on every change we ship; access to production systems is restricted
            to the proprietor; secrets are held in environment configuration and never committed to
            source control; the public chat endpoint is rate limited per key, per address, and per
            conversation; and error reports are scrubbed of authentication cookies and similar
            sensitive headers before being sent to our error tracker.
          </p>
          <p>
            No system is perfectly secure. We do not claim that ours is.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            A visitor&apos;s conversation — its messages and any contact details captured from it — is
            automatically and permanently deleted after <strong>24 months of inactivity</strong>, by a
            scheduled process rather than a manual one.
          </p>
          <p>
            Business account data (business profile, products, services, FAQs, knowledge documents) is
            retained for as long as the customer&apos;s account is active, plus a short period after
            account closure to allow recovery from accidental deletion. Records we are required to
            keep for tax and accounting purposes — invoices and payment records — are retained for the
            period Indian law requires, which is longer than the periods above and applies even after
            an account is closed.
          </p>
          <p>
            A customer or visitor may request earlier deletion at any time. See &quot;Your
            rights&quot; below.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Subject to applicable law, you may ask us to give you access to the personal data we hold
            about you, correct or complete it if it is inaccurate, export it in a portable form, or
            erase it. You may withdraw a consent you previously gave, and you may nominate another
            person to exercise these rights on your behalf in the event of your death or incapacity.
            Withdrawing consent does not undo processing that already lawfully happened.
          </p>
          <p>
            A customer can export and permanently delete their entire account&apos;s data from the
            dashboard without contacting us. For anything else, write to the Grievance Officer below.
            We will verify that the request genuinely comes from you before acting on it — this
            protects you, not us.
          </p>
          <p>
            <strong>We will acknowledge your request within 48 hours and complete it within 30
            days.</strong> Where a request is complex and genuinely needs longer, we will tell you why
            before the 30 days are up. India&apos;s DPDP Rules permit up to 90 days; we are committing
            to the shorter period.
          </p>
        </Section>

        <Section title="Grievance Officer">
          <p>
            In accordance with Rule 5(9) of the SPDI Rules, 2011 and the grievance-redressal
            requirements of the Consumer Protection (E-Commerce) Rules, 2020, the following officer
            handles privacy questions, data rights requests, and complaints about this service:
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
            <p className="pt-1">
              Plot No. 19, Venkatramana Colony, Phase-1, Street-2,
              <br />
              Dammaiguda, Hyderabad, Telangana 500083, India
            </p>
          </div>
          <p>
            Complaints are acknowledged within <strong>48 hours</strong> and redressed within{" "}
            <strong>one month</strong> of receipt. If you are not satisfied with how we handled your
            complaint, you may escalate it to the Data Protection Board of India once that forum is
            operational, or to the consumer forum with jurisdiction over your matter.
          </p>
        </Section>

        <Section title="Children">
          <p>
            Waves AI Pilot is a business tool and is not directed at children. We do not knowingly
            create accounts for anyone under 18, and customers should not configure an AI employee to
            collect personal data from children. If we learn that we hold a child&apos;s personal data
            without the verifiable consent of a parent or lawful guardian, we will delete it.
          </p>
        </Section>

        <Section title="If something goes wrong">
          <p>
            If a personal data breach affects you, we will inform you in plain language — what
            happened, what it may mean for you, what we have done about it, and what you can do — and
            we will notify the Data Protection Board of India where the law requires it.
          </p>
        </Section>

        <Section title="Cookies and local storage">
          <p>
            We use cookies strictly necessary to keep a signed-in customer authenticated; these are
            set by Clerk and we do not use them to track you across other websites. The chat widget
            stores a small identifier in your browser&apos;s local storage so that you can return to
            your own recent conversations on that site. We do not use advertising or analytics
            cookies.
          </p>
        </Section>

        <Section title="Governing law">
          <p>
            This policy is governed by the laws of India. The courts at Hyderabad, Telangana have
            exclusive jurisdiction over any dispute arising out of it.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We will update the &quot;Last updated&quot; date above when this policy changes and, for
            material changes, take reasonable steps to notify customers by email before the change
            takes effect.
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
