import Link from "next/link";
import { ContactLines } from "../_components/contact-lines";

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
          <p className="text-sm text-ds-text-muted">Last updated: 2026-11-03</p>
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
            details, our customer is responsible for obtaining consent. On the{" "}
            <strong>website chat widget only</strong>, our widget presents a standalone consent notice
            before contact details are stored, and a visitor who does not consent can still use the
            chat without their contact details being saved.
          </p>
          <p>
            That notice does not apply to Instagram or WhatsApp. On those channels the person chose to
            message the business first, and no widget notice is shown. The customer business is the
            Data Fiduciary for those conversations and is responsible for its own privacy notice to
            the people who message it.
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
              <strong>Google (Gemini)</strong> — the only AI provider we use. It generates AI
              responses and embeddings from the conversation and the business&apos;s approved
              knowledge. Message content, including messages received over Instagram, is sent to
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
              <strong>Razorpay</strong> — payment processing for our subscription plans and one-time
              payments. Card, UPI and bank details, and the contact details entered at checkout, go
              directly to Razorpay; we do not see or store card or bank details. We receive the payment
              records we need for billing and tax invoices, such as the amount, status and Razorpay
              payment and subscription identifiers.
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

        <Section title="Instagram and other Meta platforms">
          <p>
            A customer can connect its Instagram professional account to Waves AI Pilot by logging
            in with Facebook (&quot;Instagram API with Facebook Login&quot;) and choosing the Facebook
            Page that is linked to its Instagram account. This section describes exactly what we
            receive and do through that connection.
          </p>
          <p>
            <strong>What we access, and which permission gives it.</strong>
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <code>instagram_basic</code> — the connected account&apos;s Instagram ID and
              username, so we can show the customer which account is connected and match incoming
              messages to the right business.
            </li>
            <li>
              <code>instagram_manage_messages</code> — the text of direct messages people
              send to the connected account, each sender&apos;s Instagram-scoped ID and each
              message&apos;s ID, and the ability to send replies from that account. We do not receive
              the sender&apos;s name or profile details. We do not store attachments: for a
              non-text message we keep only a note that one arrived.
            </li>
            <li>
              <code>pages_show_list</code> — the list of Facebook Pages the person manages, so they
              can choose the Page linked to their Instagram account.
            </li>
            <li>
              <code>pages_manage_metadata</code> — lets us subscribe the chosen Page to our app so
              Meta delivers that Instagram account&apos;s messages to us, and unsubscribe it when the
              customer disconnects.
            </li>
            <li>
              <code>pages_read_engagement</code> — the chosen Page&apos;s name and ID and the
              Instagram account linked to it, which Meta requires to read the Page.
            </li>
            <li>
              <code>business_management</code> — lets the login reach Pages and Instagram accounts
              that the customer manages through a Meta business portfolio. We use it for nothing else.
            </li>
            <li>
              <strong>Access token</strong> — the Facebook Page access token Meta issues for the
              chosen Page, plus the IDs that identify the connection (the Facebook Page ID and name and
              the app-scoped Facebook user ID of the person who connected). The token is stored
              encrypted in a restricted database table that no customer or visitor can read, used only
              to receive and send Instagram messages for that account, and never written to our logs.
              It is kept until the customer disconnects Instagram, removes our app, or deletes the
              business.
            </li>
          </ul>
          <p>
            We do not access the account&apos;s or the Page&apos;s posts, media, comments, followers, or
            insights, and we never post anything.
          </p>
          <p>
            <strong>Why.</strong> Only to receive direct messages sent to the connected business
            account, generate AI replies grounded in that business&apos;s own approved knowledge, and
            let its staff take over a conversation.
          </p>
          <p>
            <strong>What we never do.</strong> Data we receive from Meta is never sold, never used for
            advertising or profiling, never used to train or fine-tune any AI model, and never shared
            with another business. Message text is sent to our AI provider, Google (Gemini), solely to
            produce the reply, and to no one else except the service providers listed above that host
            the data.
          </p>
          <p>
            <strong>How long we keep it.</strong> Instagram messages are kept like any other
            conversation: permanently deleted after 24 months of inactivity, or sooner if the customer
            deletes them or its account. The access token is kept only while the account is
            connected, and is deleted when the customer disconnects Instagram, when the customer
            removes our app in Facebook, Instagram or Meta Business Suite, or when the business is
            deleted.
            Disconnecting stops all use of the account at once but does not by itself delete earlier
            conversations. If Meta sends us a data deletion request, we also delete every
            conversation received through that account, the connection record, and the account ID,
            username, Page ID and name, and user IDs.
          </p>
          <p>
            <strong>How to revoke access.</strong> In Facebook, go to Settings → Business
            integrations and remove Waves AI Pilot; or in Meta Business Suite, go to Settings →
            Integrations → Connected apps and remove Waves AI Pilot; or in Instagram, go to Settings →
            Apps and websites and remove Waves AI Pilot; or have the customer disconnect Instagram in
            its dashboard.
            Step-by-step instructions, and how to ask for your data to be deleted, are on our{" "}
            <Link href="/data-deletion" className="font-medium text-ds-accent hover:text-ds-accent-strong">
              Data Deletion Instructions
            </Link>{" "}
            page.
          </p>
          <p>
            We comply with the{" "}
            <a
              href="https://developers.facebook.com/terms/"
              className="font-medium text-ds-accent hover:text-ds-accent-strong"
            >
              Meta Platform Terms
            </a>{" "}
            and{" "}
            <a
              href="https://developers.facebook.com/devpolicy/"
              className="font-medium text-ds-accent hover:text-ds-accent-strong"
            >
              Developer Policies
            </a>
            .
          </p>
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
            <ContactLines />
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
