import Link from "next/link";

export const metadata = {
  title: "Cancellation and Refunds | Waves AI Pilot",
};

/**
 * Required by Razorpay for merchant activation (its automated website
 * check looks for a reachable "Cancellation and Refunds policy" URL),
 * and by the grievance-redressal expectations of the Consumer
 * Protection (E-Commerce) Rules, 2020.
 *
 * Stance chosen by the user 2026-10-19: no refunds, cancel any time,
 * subscription runs to the end of the paid period. The three narrow
 * exceptions below are deliberate -- a blanket "no refunds under any
 * circumstances" is both poor practice and unlikely to survive a
 * consumer forum where the customer genuinely received nothing.
 */
export default function RefundsPolicyPage() {
  return (
    <div className="flex flex-1 flex-col bg-ds-bg px-6 py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-ds-text-primary">
            Cancellation and Refunds Policy
          </h1>
          <p className="text-sm text-ds-text-muted">Last updated: 2026-10-19</p>
        </div>

        <Section title="Summary">
          <p>
            You can cancel your Waves AI Pilot subscription at any time, from your dashboard, without
            contacting us and without a cancellation fee. Your plan stays active until the end of the
            period you have already paid for, and then stops. We do not refund fees already paid,
            except in the specific situations listed below.
          </p>
        </Section>

        <Section title="How to cancel">
          <p>
            Cancel from your account settings in the dashboard, or email{" "}
            <a
              href="mailto:support@waveswebstudio.in"
              className="font-medium text-ds-accent hover:text-ds-accent-strong"
            >
              support@waveswebstudio.in
            </a>{" "}
            from the address registered on the account and we will action it for you. We will confirm
            your cancellation by email, including the date your access ends.
          </p>
        </Section>

        <Section title="What happens when you cancel">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Your subscription is not renewed, and no further payment is taken.
            </li>
            <li>
              Your plan and all its features stay fully available until the end of the current paid
              period — cancelling does not cut your access off immediately.
            </li>
            <li>
              After that date, your account moves to a read-only state. You can still sign in, view
              your data, and export it.
            </li>
            <li>
              Your chat widget stops responding to new visitors, so we recommend removing the embed
              snippet from your website before your period ends.
            </li>
            <li>
              Your data is retained as described in our{" "}
              <Link href="/privacy" className="font-medium text-ds-accent hover:text-ds-accent-strong">
                Privacy Policy
              </Link>
              . You can delete it permanently yourself at any time, and we recommend exporting
              anything you want to keep first.
            </li>
          </ul>
        </Section>

        <Section title="Refunds">
          <p>
            Subscription fees are charged for a period of access, and that access is made available to
            you immediately and continuously for the whole period. For that reason fees already paid
            are <strong>not refundable</strong>, including where you cancel part-way through a period,
            where you have not used the service, or where you have used less than your plan&apos;s
            quota. We do not pro-rate a partially used period.
          </p>
          <p>We will, however, issue a refund in these situations:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Duplicate or incorrect charge.</strong> If you were charged twice for the same
              period, or charged an amount that does not match the plan you selected, we refund the
              excess in full.
            </li>
            <li>
              <strong>Charge after cancellation.</strong> If a renewal was taken after you had already
              cancelled, we refund it in full.
            </li>
            <li>
              <strong>Sustained failure that we could not fix.</strong> If the service is materially
              unavailable or unusable for a prolonged period during your paid term, you report it to
              us, and we are unable to resolve it, we will refund the affected portion of your fee. We
              will assess this fairly and in good faith against our own error and uptime records.
            </li>
          </ul>
        </Section>

        <Section title="Free trial">
          <p>
            Where we offer a free trial, you are not charged during it and you can cancel before it
            ends without paying anything. We will remind you by email before a trial converts into a
            paid subscription. If a trial converts and you did not intend it to, tell us within 7 days
            and we will cancel and refund that first payment in full.
          </p>
        </Section>

        <Section title="Plan changes">
          <p>
            You can upgrade at any time; the higher plan takes effect immediately and we charge the
            difference for the remainder of your current period. You can downgrade at any time; the
            lower plan takes effect at your next renewal, and we do not refund the difference for the
            current period.
          </p>
        </Section>

        <Section title="How refunds are paid">
          <p>
            An approved refund is processed to the original payment method through our payment
            gateway. We initiate it within <strong>7 working days</strong> of approving your request.
            How long it then takes to appear on your statement depends on your bank or card issuer,
            and is typically a further 5 to 10 working days. The GST contained in a refunded amount is
            refunded with it.
          </p>
        </Section>

        <Section title="Requesting a refund or raising a complaint">
          <p>
            Email the Grievance Officer below with your account email, the invoice or payment
            reference, and what you would like us to do. We acknowledge every request within{" "}
            <strong>48 hours</strong> and resolve it within <strong>one month</strong> of receipt.
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
          <p>
            If you are not satisfied with our decision, nothing in this policy affects your right to
            approach the consumer forum with jurisdiction over your matter under the Consumer
            Protection Act, 2019.
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
