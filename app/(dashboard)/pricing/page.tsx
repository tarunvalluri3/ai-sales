import Link from "next/link";

export const metadata = {
  title: "Pricing | Waves AI Pilot",
};

/**
 * Required by Razorpay's merchant-activation website check ("Pricing
 * details"), and referenced by the fee clause in /terms.
 *
 * PRICE POINTS AND QUOTAS ARE A FIRST PROPOSAL, 2026-10-19 -- the user
 * asked for "standard pricing and plans ... industry standards" rather
 * than supplying figures. They are deliberately all defined in the
 * PLANS array below so changing one is a single-line edit.
 *
 * The quotas are anchored to this app's own measured token usage, not
 * guessed: STATE.md's Phase 21 live verification recorded a real chat
 * turn at input_tokens 3741 + output_tokens 275, i.e. ~4,000 tokens per
 * AI reply. So 1,000 replies ~= 4M tokens, 3,000 ~= 12M, 10,000 ~= 40M.
 * Those token figures are what AI_MONTHLY_TOKEN_LIMIT would be set to
 * per plan once Phase 17 (billing) introduces per-plan entitlements --
 * today that env var is a single global value for every tenant, so the
 * quota column here is a commitment the code cannot yet enforce
 * per-plan. Do not treat this page as evidence that it can.
 *
 * Channel honesty (Consumer Protection Act, 2019 -- advertising a
 * capability that cannot be delivered is an unfair trade practice):
 * WhatsApp genuinely works but requires the customer's own Meta
 * credentials, so it carries a footnote rather than a bare tick.
 * Instagram cannot work for a customer's account until Meta App Review
 * and Business Verification clear, so it is listed as limited release
 * and is NOT included in any paid plan's feature list.
 */

type Plan = {
  name: string;
  tagline: string;
  monthly: number;
  annual: number;
  featured: boolean;
  quota: string;
  seats: string;
  features: string[];
};

const PLANS: Plan[] = [
  {
    name: "Starter",
    tagline: "For a single website, getting your first AI-qualified leads.",
    monthly: 1499,
    annual: 14990,
    featured: false,
    quota: "1,000 AI replies / month",
    seats: "1 team member",
    features: [
      "AI sales employee on your website",
      "Products, services and FAQs",
      "Knowledge from pasted text (up to 25 documents)",
      "Lead capture, scoring and qualification",
      "Human handoff and live takeover",
      "Consent notice and 24-month data retention",
      "Email support",
    ],
  },
  {
    name: "Growth",
    tagline: "For a team that wants recommendations, bookings and WhatsApp.",
    monthly: 3999,
    annual: 39990,
    featured: true,
    quota: "3,000 AI replies / month",
    seats: "3 team members",
    features: [
      "Everything in Starter",
      "WhatsApp Business messaging *",
      "Product and service recommendations with photos",
      "Appointment booking with availability rules",
      "Knowledge from file upload and website import (up to 200 documents)",
      "Full funnel analytics with CSV export",
      "Customer profiles, tags and segments",
      "Business hours, team assignment and SLA routing",
    ],
  },
  {
    name: "Scale",
    tagline: "For a sales team running automation at volume.",
    monthly: 9999,
    annual: 99990,
    featured: false,
    quota: "10,000 AI replies / month",
    seats: "10 team members",
    features: [
      "Everything in Growth",
      "Automation workflows with delays and conditions",
      "AI Sales Copilot daily priorities and briefs",
      "Outbound webhooks on qualified leads",
      "Unlimited knowledge documents",
      "Role-based access across four permission tiers",
      "Audit log of sensitive actions",
      "Priority email and phone support",
    ],
  },
];

const inr = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export default function PricingPage() {
  return (
    <div className="flex flex-1 flex-col bg-ds-bg px-6 py-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 text-center">
          <h1 className="text-3xl font-semibold text-ds-text-primary">Pricing</h1>
          <p className="text-sm leading-relaxed text-ds-text-secondary">
            One AI sales employee, grounded in your own business. Start with a 14-day free trial — no
            card required. Cancel any time.
          </p>
          <p className="text-2xs text-ds-text-muted">
            All prices are in Indian Rupees and exclusive of GST, charged additionally at 18%. Annual
            billing gives you two months free.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col gap-5 rounded-ds-lg border p-6 ${
                plan.featured
                  ? "border-ds-accent bg-ds-surface-elevated"
                  : "border-ds-border bg-ds-surface"
              }`}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-ds-text-primary">{plan.name}</h2>
                  {plan.featured ? (
                    <span className="rounded-ds-sm bg-ds-accent-soft-bg px-2 py-0.5 text-2xs font-semibold text-ds-accent">
                      Most popular
                    </span>
                  ) : null}
                </div>
                <p className="text-sm leading-relaxed text-ds-text-secondary">{plan.tagline}</p>
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-3xl font-semibold text-ds-text-primary">
                  {inr(plan.monthly)}
                  <span className="text-sm font-normal text-ds-text-muted"> / month</span>
                </p>
                <p className="text-2xs text-ds-text-muted">
                  or {inr(plan.annual)} / year — two months free
                </p>
              </div>

              <div className="flex flex-col gap-1 border-y border-ds-border py-3 text-sm">
                <p className="font-medium text-ds-text-primary">{plan.quota}</p>
                <p className="text-ds-text-secondary">{plan.seats}</p>
              </div>

              <ul className="flex flex-1 flex-col gap-2 text-sm text-ds-text-secondary">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span aria-hidden="true" className="text-ds-accent">
                      ✓
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/sign-up"
                className={`rounded-ds-sm px-5 py-2.5 text-center text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
                  plan.featured
                    ? "bg-ds-accent text-ds-accent-on hover:bg-ds-accent-strong"
                    : "border border-ds-border-strong text-ds-text-primary hover:border-ds-accent"
                }`}
              >
                Start free trial
              </Link>
            </div>
          ))}
        </div>

        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
          <Section title="* About WhatsApp and Instagram">
            <p>
              <strong>WhatsApp</strong> messaging on the Growth and Scale plans works through the
              official Meta WhatsApp Business Platform, using <em>your own</em> WhatsApp Business
              account and credentials. You will need a Meta Business account and a phone number
              dedicated to it; we guide you through the setup and there is no extra charge from us.
              Meta may charge you separately for conversations under its own pricing.
            </p>
            <p>
              <strong>Instagram</strong> direct messaging is built and in limited release, but it
              requires approval from Meta before it can serve an account we do not ourselves manage.
              That approval is outside our control, so Instagram is{" "}
              <strong>not included in any plan above</strong>. Ask us about it and we will tell you
              honestly where it stands.
            </p>
          </Section>

          <Section title="What counts as an AI reply">
            <p>
              An AI reply is one answer your AI employee generates for a prospect. Messages your own
              team sends during a human takeover do not count, and neither do messages you send
              yourself while testing in the sandbox.
            </p>
            <p>
              If you reach your monthly quota, your widget does not break and it never invents an
              answer: the visitor is told that a person will follow up, and the conversation is
              flagged for your team. We will email you before you get there so you can upgrade if you
              want to. Quotas reset at the start of each calendar month.
            </p>
          </Section>

          <Section title="Billing">
            <p>
              Plans are billed monthly or annually in advance, in Indian Rupees, plus 18% GST. We
              issue a GST invoice for every payment to the email address on your account. You can
              upgrade at any time and we charge only the difference for the rest of your period;
              downgrades take effect at your next renewal.
            </p>
            <p>
              You can cancel any time from your dashboard and keep access until the end of the period
              you have paid for. Fees already paid are not refundable — the full terms, including the
              situations where we do refund, are in our{" "}
              <Link href="/refunds" className="font-medium text-ds-accent hover:text-ds-accent-strong">
                Cancellation and Refunds Policy
              </Link>
              .
            </p>
          </Section>

          <Section title="Questions, or need something different?">
            <p>
              If you need more replies, more seats, or terms these plans do not cover, email{" "}
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
              . Our full business details are on the{" "}
              <Link href="/contact" className="font-medium text-ds-accent hover:text-ds-accent-strong">
                Contact
              </Link>{" "}
              page.
            </p>
          </Section>

          <Link href="/" className="text-sm font-medium text-ds-accent hover:text-ds-accent-strong">
            ← Back home
          </Link>
        </div>
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
