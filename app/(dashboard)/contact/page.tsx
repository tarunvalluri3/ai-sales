import Link from "next/link";

export const metadata = {
  title: "Contact Us | Waves AI Pilot",
};

/**
 * Carries the disclosures the Consumer Protection (E-Commerce) Rules,
 * 2020 require to be displayed prominently: legal name, principal
 * geographic address, website details, customer care contact including
 * a phone number (not just email), and the Grievance Officer's name,
 * designation and contact -- with the 48-hour acknowledgement and
 * one-month redressal commitments stated. Razorpay's activation check
 * also requires a reachable "Contact us" URL.
 *
 * GSTIN is displayed at the user's explicit request (2026-10-19): it is
 * a public business identifier that appears on every invoice anyway,
 * and Razorpay cross-checks the trading name against it during KYC.
 */
export default function ContactPage() {
  return (
    <div className="flex flex-1 flex-col bg-ds-bg px-6 py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-3">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-ds-border-strong px-3 py-1 text-2xs font-medium tracking-wide-ds text-ds-text-secondary uppercase">
            <span className="size-1.5 rounded-full bg-ds-accent" aria-hidden="true" />
            Contact
          </span>
          <h1 className="text-3xl font-semibold text-ds-text-primary">Contact Us</h1>
          <p className="text-sm text-ds-text-muted">
            We are a small, India-based team. A real person reads every message.
          </p>
        </div>

        <Section title="Business details">
          <dl className="flex flex-col gap-3">
            <Row label="Legal name">Waves Web Studio (sole proprietorship)</Row>
            <Row label="Product">Waves AI Pilot</Row>
            <Row label="Proprietor">Tarun Valluri</Row>
            <Row label="GSTIN">36BYQPT2686E1ZR</Row>
            <Row label="Website">
              <a
                href="https://waveswebstudio.in"
                className="font-medium text-ds-accent hover:text-ds-accent-strong"
              >
                waveswebstudio.in
              </a>
            </Row>
            <Row label="Principal place of business">
              Plot No. 19, Venkatramana Colony, Phase-1, Street-2,
              <br />
              Dammaiguda, Hyderabad, Telangana 500083,
              <br />
              India
            </Row>
          </dl>
          <p className="text-2xs text-ds-text-muted">
            This is our registered and only place of business. We have no branch offices.
          </p>
        </Section>

        <Section title="Customer care">
          <dl className="flex flex-col gap-3">
            <Row label="Email">
              <a
                href="mailto:support@waveswebstudio.in"
                className="font-medium text-ds-accent hover:text-ds-accent-strong"
              >
                support@waveswebstudio.in
              </a>
            </Row>
            <Row label="Phone">
              <a href="tel:+917981596249" className="font-medium text-ds-accent hover:text-ds-accent-strong">
                +91 79815 96249
              </a>
            </Row>
            <Row label="Hours">Monday to Friday, 10:00 to 18:00 IST (UTC+5:30)</Row>
          </dl>
          <p>
            Email is the fastest way to reach us and gives us a record to work from. We reply to
            support email within one working day, and usually sooner.
          </p>
        </Section>

        <Section title="Grievance Officer">
          <p>
            Appointed under Rule 5(9) of the Information Technology (Reasonable Security Practices and
            Procedures and Sensitive Personal Data or Information) Rules, 2011 and the grievance
            redressal requirements of the Consumer Protection (E-Commerce) Rules, 2020. Contact this
            officer for any complaint about the service, a billing dispute, or a request concerning
            your personal data.
          </p>
          <div className="flex flex-col gap-1 rounded-ds-sm border border-ds-border bg-ds-surface p-4 text-sm">
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
            We acknowledge every grievance within <strong>48 hours</strong> of receiving it, and
            redress it within <strong>one month</strong>. When you write, please include your account
            email and — for a billing matter — the invoice or payment reference, so we can look it up
            without a round trip.
          </p>
        </Section>

        <Section title="Where to go for what">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Help using the product, or something looks broken</strong> — email support, and
              tell us what you expected to happen and what happened instead.
            </li>
            <li>
              <strong>Billing, cancellation, or a refund request</strong> — see our{" "}
              <Link href="/refunds" className="font-medium text-ds-accent hover:text-ds-accent-strong">
                Cancellation and Refunds Policy
              </Link>
              , then email the Grievance Officer.
            </li>
            <li>
              <strong>Your personal data — access, correction, export, or deletion</strong> — see{" "}
              <Link href="/privacy" className="font-medium text-ds-accent hover:text-ds-accent-strong">
                Privacy Policy
              </Link>
              . A customer can export and delete everything from the dashboard without asking us.
            </li>
            <li>
              <strong>You chatted with an AI assistant on someone else&apos;s website</strong> — that
              business holds your data and decides what happens to it, so contact them first. Write to
              us if you cannot reach them and we will help.
            </li>
            <li>
              <strong>Security issue or vulnerability</strong> — email support with
              &quot;Security&quot; in the subject line. We will acknowledge within 48 hours and will
              not pursue anyone who reports a genuine issue in good faith.
            </li>
          </ul>
        </Section>

        <Link href="/" className="text-sm font-medium text-ds-accent hover:text-ds-accent-strong">
          ← Back home
        </Link>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="shrink-0 font-medium text-ds-text-primary sm:w-56">{label}</dt>
      <dd className="text-ds-text-secondary">{children}</dd>
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
