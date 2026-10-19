import Link from "next/link";

export const metadata = {
  title: "Service Delivery | Waves AI Pilot",
};

/**
 * Razorpay's merchant-activation website check looks for a "Shipping
 * policy" URL. Waves AI Pilot ships nothing physical, so inventing
 * courier timelines would be a fabricated business fact. This page
 * instead states honestly how a purely digital service is delivered,
 * which is what the check is actually for -- setting a customer's
 * expectation of when they get what they paid for.
 *
 * The route is /shipping so the gateway's expected URL resolves; the
 * visible heading says "Service Delivery", which is what it is.
 */
export default function ShippingPolicyPage() {
  return (
    <div className="flex flex-1 flex-col bg-ds-bg px-6 py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-ds-text-primary">
            Service Delivery and Shipping Policy
          </h1>
          <p className="text-sm text-ds-text-muted">Last updated: 2026-10-19</p>
        </div>

        <Section title="Nothing is shipped">
          <p>
            Waves AI Pilot is a software-as-a-service product delivered entirely over the internet.
            There is no physical product, no packaging, and no courier. We do not ship goods, and no
            shipping charge is ever added to your invoice.
          </p>
        </Section>

        <Section title="How and when your service is delivered">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Immediately on payment.</strong> Access to your plan is activated automatically
              as soon as your payment is confirmed by our payment gateway — normally within a few
              seconds, and in any case within 24 hours. No manual provisioning step is involved.
            </li>
            <li>
              <strong>Delivered to your account.</strong> Your plan is attached to the Waves AI Pilot
              account you paid from. You access it by signing in at our website; there is nothing to
              download or install on your own servers.
            </li>
            <li>
              <strong>Confirmation by email.</strong> We email a payment confirmation and a GST
              invoice to the address registered on your account.
            </li>
            <li>
              <strong>Your widget.</strong> To put your AI employee on your own website, you copy a
              small embed snippet from your dashboard and paste it into your site. That step is yours
              to carry out, and your dashboard includes a guided walkthrough and a sandbox where you
              can test your AI before publishing it.
            </li>
          </ul>
        </Section>

        <Section title="Service area">
          <p>
            Waves AI Pilot is available to businesses anywhere with an internet connection. Our
            dashboard is in English; the chat widget your visitors see supports English, Hindi,
            Spanish, French, German, and Portuguese.
          </p>
        </Section>

        <Section title="If your access does not activate">
          <p>
            If you have paid and your plan has not activated within 24 hours, contact us and we will
            fix it or refund you. Email{" "}
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
            , quoting your payment reference. We acknowledge within 48 hours.
          </p>
          <p>
            See also our{" "}
            <Link href="/refunds" className="font-medium text-ds-accent hover:text-ds-accent-strong">
              Cancellation and Refunds Policy
            </Link>
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
