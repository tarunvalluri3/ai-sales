import Link from "next/link";
import {
  GST_RATE_PERCENT,
  ORDERED_PLANS,
  TRIAL_DAYS,
  formatPaiseAsInr,
  formatReplyQuota,
} from "@/lib/plans";
import { channelLaunchSwitchesFromEnv, describeLaunchedTrialChannels, entitlementConfigFromEnv } from "@/lib/entitlement-rules";
import { MicroChip } from "@/components/marketing/fragments/_shared";

export const metadata = {
  title: "Pricing | Waves AI Pilot",
};

// Rendered per request so the advertised trial limit is the CONFIGURED one
// (TRIAL_REPLY_QUOTA), i.e. exactly what lib/entitlement-rules.ts enforces.
export const dynamic = "force-dynamic";

/**
 * Required by Razorpay's merchant-activation website check ("Pricing
 * details"), and referenced by the fee clause in /terms.
 *
 * PRICE POINTS AND QUOTAS WERE CONFIRMED BY THE USER 2026-10-21 (Phase
 * 17a) -- Starter ₹1,499 / 1,000 replies, Growth ₹3,999 / 3,000, Scale
 * ₹9,999 / 10,000. They were a proposal from 2026-10-19 until then.
 *
 * **Every price on this page is GST-INCLUSIVE** (decided 2026-10-21): the
 * figure shown is the total charged, with 18% GST contained in it, and the
 * annual figures (ten months' gross, "two months free") are inclusive too.
 * This is a legal-accuracy matter -- the page must not promise a tax
 * treatment we do not apply. If this ever flips back to exclusive, every
 * "inclusive" sentence below, /terms and lib/usage-reminders.ts change
 * together.
 *
 * **This page no longer holds its own numbers.** Every figure rendered
 * below comes from `lib/plans.ts`, which is also what `lib/usage-limit.ts`
 * enforces against -- so the advertised quota and the enforced quota are
 * now literally the same value, and that file's compile-time assertions
 * make changing one without the other a `npm run typecheck` failure. The
 * old warning here ("the quota column is a commitment the code cannot yet
 * enforce per-plan") is resolved: quotas are counted in AI replies, per
 * plan, over the business's own billing period.
 *
 * The quotas themselves are still anchored to this app's measured usage
 * rather than guessed: Phase 21's live verification recorded a real chat
 * turn at input_tokens 3741 + output_tokens 275, i.e. ~4,000 tokens per AI
 * reply, so the three plans correspond to roughly 4M / 12M / 40M tokens a
 * month.
 *
 * Channel honesty (Consumer Protection Act, 2019): WhatsApp and Instagram
 * are on Growth and Scale (owner decision 2026-11-03: same plan access), both
 * using the customer's own Meta accounts, so they carry a footnote rather
 * than a bare tick. The free trial (no card, all three channels, one per
 * organisation) is described from lib/plans.ts + the configured trial limit,
 * the same values lib/entitlement-rules.ts enforces.
 */

export default function PricingPage() {
  const { trialReplyQuota } = entitlementConfigFromEnv();
  // Item 7: a channel switched off for launch is shown as "coming soon", never
  // sold as available -- the same switch the server enforces.
  const launch = channelLaunchSwitchesFromEnv();
  const trialChannels = describeLaunchedTrialChannels(launch);
  const featureLabel = (feature: string): string => {
    if (feature.startsWith("WhatsApp") && !launch.whatsapp) return `${feature.replace(" *", "")} (coming soon)`;
    if (feature.startsWith("Instagram") && !launch.instagram) return `${feature.replace(" *", "")} (coming soon)`;
    return feature;
  };
  return (
    <div className="flex flex-1 flex-col bg-ds-bg px-6 py-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-ds-border-strong px-3 py-1 text-2xs font-medium tracking-wide-ds text-ds-text-secondary uppercase">
            <span className="size-1.5 rounded-full bg-ds-accent" aria-hidden="true" />
            Pricing
          </span>
          <h1 className="text-3xl font-semibold text-ds-text-primary">Pricing</h1>
          <p className="text-sm leading-relaxed text-ds-text-secondary">
            One AI sales employee, grounded in your own business. Start with a {TRIAL_DAYS}-day free
            trial — no card required, up to {trialReplyQuota.toLocaleString("en-IN")} AI replies, on{" "}
            {trialChannels}. Cancel any time.
          </p>
          <p className="text-2xs text-ds-text-muted">
            All prices are in Indian Rupees and inclusive of {GST_RATE_PERCENT}% GST — the price you
            see is the total you pay. Annual billing gives you two months free.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {ORDERED_PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`flex flex-col gap-5 rounded-ds-lg border p-6 ${
                plan.featured
                  ? "border-ds-accent bg-ds-surface-elevated"
                  : "border-ds-border bg-ds-surface"
              }`}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-ds-text-primary">{plan.name}</h2>
                  {plan.featured ? <MicroChip tone="accent">Most popular</MicroChip> : null}
                </div>
                <p className="text-sm leading-relaxed text-ds-text-secondary">{plan.tagline}</p>
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-3xl font-semibold text-ds-text-primary">
                  {formatPaiseAsInr(plan.monthlyPricePaise)}
                  <span className="text-sm font-normal text-ds-text-muted">
                    {" "}
                    / month, incl. GST
                  </span>
                </p>
                <p className="text-2xs text-ds-text-muted">
                  or {formatPaiseAsInr(plan.annualPricePaise)} / year, incl. GST — two months free
                </p>
              </div>

              <div className="flex flex-col gap-1 border-y border-ds-border py-3 text-sm">
                <p className="font-medium text-ds-text-primary">
                  {formatReplyQuota(plan.monthlyReplyQuota)}
                </p>
                <p className="text-ds-text-secondary">{plan.seatsLabel}</p>
              </div>

              <ul className="flex flex-1 flex-col gap-2 text-sm text-ds-text-secondary">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span aria-hidden="true" className="text-ds-accent">
                      ✓
                    </span>
                    <span>{featureLabel(feature)}</span>
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
          <Section title="Free trial">
            <p>
              Every new business starts with a free trial. No card is needed. It lasts {TRIAL_DAYS} days
              or {trialReplyQuota.toLocaleString("en-IN")} AI replies, whichever comes first, and includes{" "}
              {trialChannels}.
            </p>
            <p>
              When the trial ends, your AI stops replying to prospects until you choose a plan — nothing
              is charged automatically. There is one free trial per person and one per organisation,
              including if the business is deleted and set up again or a new organisation is created.
            </p>
          </Section>

          <Section title="* About WhatsApp and Instagram">
            <p>
              <strong>WhatsApp</strong> messaging on the Growth and Scale plans works through the
              official Meta WhatsApp Business Platform, using <em>your own</em> WhatsApp Business
              account. You will need a Meta Business account and a phone number dedicated to it; we
              guide you through the setup and there is no extra charge from us. Meta may charge you
              separately for conversations under its own pricing.
            </p>
            <p>
              <strong>Instagram</strong> direct messaging on the Growth and Scale plans uses{" "}
              <em>your own</em> Instagram professional account, linked to a Facebook Page. Starter
              includes neither WhatsApp nor Instagram.
            </p>
            {!launch.whatsapp || !launch.instagram ? (
              <p>
                {!launch.whatsapp && !launch.instagram
                  ? "WhatsApp and Instagram are"
                  : !launch.whatsapp
                    ? "WhatsApp is"
                    : "Instagram is"}{" "}
                <strong>coming soon</strong>: we&apos;re waiting for Meta&apos;s approval. They switch on for
                Growth, Scale and trial accounts as soon as it arrives.
              </p>
            ) : null}
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
              flagged for your team. We email you when you have used half of your replies, and again
              as you get closer, so you can upgrade if you want to. Quotas reset at the start of each
              billing period.
            </p>
          </Section>

          <Section title="Billing">
            <p>
              Plans are billed monthly or annually in advance, in Indian Rupees. The price you see
              includes {GST_RATE_PERCENT}% GST, so that is the total you are charged. We issue a GST
              invoice for every payment to the email address on your account, showing the taxable
              value and the GST contained in the price. You can upgrade at any time and we charge
              only the difference for the rest of your period; downgrades take effect at your next
              renewal.
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
