import Link from "next/link";
import type { ReactNode } from "react";
import { Minus } from "lucide-react";
import {
  GST_RATE_PERCENT,
  ORDERED_PLANS,
  TRIAL_DAYS,
  formatPaiseAsInr,
  formatReplyQuota,
} from "@/lib/plans";
import { channelLaunchSwitchesFromEnv, describeLaunchedTrialChannels, entitlementConfigFromEnv } from "@/lib/entitlement-rules";
import { launchedMetaChannelNames, planChannelsLabel, trialVsStarterNote } from "@/lib/plan-channel-copy";
import { PageHero } from "@/components/site/feature-block";
import { PlanCards, type PlanCardData } from "@/components/site/plan-cards";
import { FaqList, type Faq } from "@/components/site/faq";
import { CtaBand } from "@/components/site/cta-band";
import { Check, Reveal, Section, SectionHeading } from "@/components/site/primitives";

export const metadata = {
  title: "Pricing | Waves AI Pilot",
  description:
    "Waves AI Pilot plans: Starter, Growth and Scale, priced by AI replies per month, GST included. 14-day free trial on every channel, no card required.",
  alternates: { canonical: "/pricing" },
};

// Rendered per request so the advertised trial limit is the CONFIGURED one
// (TRIAL_REPLY_QUOTA), i.e. exactly what lib/entitlement-rules.ts enforces.
export const dynamic = "force-dynamic";

/**
 * Required by Razorpay's merchant-activation website check ("Pricing
 * details"), and referenced by the fee clause in /terms.
 *
 * Nov 2026 site redesign: visual only. Every figure still comes from
 * `lib/plans.ts` (what `lib/usage-limit.ts` enforces), every price is
 * GST-INCLUSIVE (decided 2026-10-21), the trial is described from the
 * configured limit, and a Meta channel switched off for launch is shown as
 * "coming soon", never sold as available (Consumer Protection Act, 2019).
 * The comparison table below restates each plan's own feature list from
 * lib/plans.ts row by row; if a plan's features change there, change the
 * matching row here.
 */

type Cell = boolean | string;

export default function PricingPage() {
  const { trialReplyQuota } = entitlementConfigFromEnv();
  const launch = channelLaunchSwitchesFromEnv();
  const trialChannels = describeLaunchedTrialChannels(launch);
  const metaNames = launchedMetaChannelNames(launch);
  const starterNote = trialVsStarterNote(metaNames);
  const featureLabel = (feature: string): string => {
    if (feature.startsWith("WhatsApp") && !launch.whatsapp) return `${feature.replace(" *", "")} (coming soon)`;
    if (feature.startsWith("Instagram") && !launch.instagram) return `${feature.replace(" *", "")} (coming soon)`;
    return feature;
  };
  const soon = (on: boolean): Cell => (on ? true : "Coming soon");

  const cards: PlanCardData[] = ORDERED_PLANS.map((plan) => ({
    key: plan.key,
    name: plan.name,
    tagline: plan.tagline,
    featured: plan.featured,
    monthly: formatPaiseAsInr(plan.monthlyPricePaise),
    annual: formatPaiseAsInr(plan.annualPricePaise),
    annualPerMonth: formatPaiseAsInr(Math.round(plan.annualPricePaise / 12 / 100) * 100),
    quota: formatReplyQuota(plan.monthlyReplyQuota),
    seats: plan.seatsLabel,
    channels: planChannelsLabel(plan.key, metaNames),
    features: plan.features.map(featureLabel),
  }));

  const [starter, growth, scale] = ORDERED_PLANS;
  const ROWS: { group: string; rows: [string, Cell, Cell, Cell][] }[] = [
    {
      group: "Usage",
      rows: [
        ["AI replies per month", starter.monthlyReplyQuota.toLocaleString("en-IN"), growth.monthlyReplyQuota.toLocaleString("en-IN"), scale.monthlyReplyQuota.toLocaleString("en-IN")],
        ["Team members", starter.seatsLabel.split(" ")[0], growth.seatsLabel.split(" ")[0], scale.seatsLabel.split(" ")[0]],
      ],
    },
    {
      group: "Channels",
      rows: [
        ["Website chat widget", true, true, true],
        ["WhatsApp Business messaging *", false, soon(launch.whatsapp), soon(launch.whatsapp)],
        ["Instagram direct messages *", false, soon(launch.instagram), soon(launch.instagram)],
      ],
    },
    {
      group: "AI sales agent",
      rows: [
        ["Answers from products, services and FAQs", true, true, true],
        ["Lead capture, scoring and qualification", true, true, true],
        ["Human handoff and live takeover", true, true, true],
        ["Product and service recommendations with photos", false, true, true],
        ["Appointment booking with availability rules", false, true, true],
      ],
    },
    {
      group: "Knowledge",
      rows: [
        ["Knowledge documents", "Up to 25", "Up to 200", "Unlimited"],
        ["Pasted text", true, true, true],
        ["File upload and website import", false, true, true],
      ],
    },
    {
      group: "Sales tools",
      rows: [
        ["Full funnel analytics with CSV export", false, true, true],
        ["Customer profiles, tags and segments", false, true, true],
        ["Business hours, team assignment and SLA routing", false, true, true],
        ["Automation workflows with delays and conditions", false, false, true],
        ["AI Sales Copilot daily priorities and briefs", false, false, true],
        ["Outbound webhooks on qualified leads", false, false, true],
      ],
    },
    {
      group: "Admin & support",
      rows: [
        ["Consent notice and 24-month data retention", true, true, true],
        ["Role-based access across four permission tiers", false, false, true],
        ["Audit log of sensitive actions", false, false, true],
        ["Support", "Email", "Email", "Priority email & phone"],
      ],
    },
  ];

  const FAQS: Faq[] = [
    {
      q: "How does the free trial work?",
      a: (
        <>
          <p>
            Every new business starts with a free trial. No card is needed. It lasts {TRIAL_DAYS} days or{" "}
            {trialReplyQuota.toLocaleString("en-IN")} AI replies, whichever comes first, and includes {trialChannels}.
          </p>
          {starterNote ? <p className="mt-3 font-medium text-ds-text-primary">{starterNote}</p> : null}
          <p className="mt-3">
            When the trial ends, your AI stops replying to prospects until you choose a plan — nothing is charged
            automatically. There is one free trial per person and one per organisation, including if the business is
            deleted and set up again or a new organisation is created.
          </p>
        </>
      ),
    },
    {
      q: "What counts as an AI reply?",
      a: (
        <>
          <p>
            An AI reply is one answer your AI employee generates for a prospect. Messages your own team sends during a
            human takeover do not count, and neither do messages you send yourself while testing in the sandbox.
          </p>
          <p className="mt-3">
            If you reach your monthly quota, your widget does not break and it never invents an answer: the visitor is
            told that a person will follow up, and the conversation is flagged for your team. We email you when you have
            used half of your replies, and again as you get closer, so you can upgrade if you want to. Quotas reset at the
            start of each billing period.
          </p>
        </>
      ),
    },
    {
      q: "How does billing work?",
      a: (
        <>
          <p>
            Plans are billed monthly or annually in advance, in Indian Rupees. The price you see includes{" "}
            {GST_RATE_PERCENT}% GST, so that is the total you are charged. We issue a GST invoice for every payment to the
            email address on your account, showing the taxable value and the GST contained in the price. You can upgrade
            at any time and we charge only the difference for the rest of your period; downgrades take effect at your
            next renewal.
          </p>
          <p className="mt-3">
            You can cancel any time from your dashboard and keep access until the end of the period you have paid for.
            Fees already paid are not refundable — the full terms, including the situations where we do refund, are in our{" "}
            <Link href="/refunds" className="site-link">
              Cancellation and Refunds Policy
            </Link>
            .
          </p>
        </>
      ),
    },
    {
      q: "Need more replies, more seats or different terms?",
      a: (
        <p>
          Email{" "}
          <a href="mailto:support@waveswebstudio.in" className="site-link">
            support@waveswebstudio.in
          </a>{" "}
          or call{" "}
          <a href="tel:+917981596249" className="site-link">
            +91 79815 96249
          </a>
          . Our full business details are on the{" "}
          <Link href="/contact" className="site-link">
            Contact
          </Link>{" "}
          page.
        </p>
      ),
    },
  ];

  return (
    <main className="flex flex-1 flex-col">
      <PageHero
        eyebrow="Pricing"
        title="Simple plans that grow with your sales."
        lead={
          <>
            Pay for the AI replies you need. Start with a {TRIAL_DAYS}-day free trial — no card required, up to{" "}
            {trialReplyQuota.toLocaleString("en-IN")} AI replies, on {trialChannels}. Cancel any time.
          </>
        }
      />

      <section className="px-5 pb-8 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1200px]">
          <PlanCards plans={cards} />
          <p className="mt-8 text-center text-[13.5px] text-ds-text-muted">
            All prices are in Indian Rupees and inclusive of {GST_RATE_PERCENT}% GST — the price you see is the total you
            pay. Annual billing gives you two months free.
          </p>
          <div className="mx-auto mt-6 max-w-[860px] rounded-[20px] border border-ds-border bg-ds-surface p-6 text-[14px] leading-relaxed text-ds-text-secondary">
            <p className="mb-3 font-medium text-ds-text-primary">* About WhatsApp and Instagram</p>
            <>
          <p>
            <strong>WhatsApp</strong> messaging on the Growth and Scale plans works through the official Meta WhatsApp
            Business Platform, using <em>your own</em> WhatsApp Business account. You will need a Meta Business account and
            a phone number dedicated to it; we guide you through the setup and there is no extra charge from us. Meta may
            charge you separately for conversations under its own pricing.
          </p>
          <p className="mt-3">
            <strong>Instagram</strong> direct messaging on the Growth and Scale plans uses <em>your own</em> Instagram
            professional account, linked to a Facebook Page. Starter includes neither WhatsApp nor Instagram.
          </p>
          {!launch.whatsapp || !launch.instagram ? (
            <p className="mt-3">
              {!launch.whatsapp && !launch.instagram ? "WhatsApp and Instagram are" : !launch.whatsapp ? "WhatsApp is" : "Instagram is"}{" "}
              <strong>coming soon</strong>: we&apos;re waiting for Meta&apos;s approval. They switch on for Growth, Scale
              and trial accounts as soon as it arrives.
            </p>
          ) : null}
        </>
          </div>
        </div>
      </section>

      <Section labelledBy="compare-heading">
        <SectionHeading align="center" eyebrow="Compare" id="compare-heading" title="Every feature, plan by plan." />
        <Reveal className="mt-12 overflow-x-auto rounded-[24px] border border-ds-border bg-ds-surface">
          <table className="w-full min-w-[720px] border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-ds-border">
                <th scope="col" className="w-[40%] px-6 py-5 font-label text-[11px] font-medium uppercase tracking-[0.16em] text-ds-text-muted">
                  Feature
                </th>
                {ORDERED_PLANS.map((p) => (
                  <th key={p.key} scope="col" className={`px-6 py-5 text-[16px] font-medium ${p.featured ? "bg-ds-lime-soft/60" : ""}`}>
                    {p.name}
                    <span className="block text-[13px] font-normal text-ds-text-muted">{formatPaiseAsInr(p.monthlyPricePaise)} / mo</span>
                  </th>
                ))}
              </tr>
            </thead>
            {ROWS.map((g) => (
              <tbody key={g.group}>
                <tr>
                  <th colSpan={4} scope="colgroup" className="bg-ds-surface-soft px-6 py-2.5 font-label text-[11px] font-medium uppercase tracking-[0.16em] text-ds-text-muted">
                    {g.group}
                  </th>
                </tr>
                {g.rows.map(([label, ...cells]) => (
                  <tr key={label} className="border-t border-ds-border">
                    <th scope="row" className="px-6 py-3.5 font-normal text-ds-text-secondary">
                      {label}
                    </th>
                    {cells.map((c, i) => (
                      <td key={i} className={`px-6 py-3.5 ${ORDERED_PLANS[i].featured ? "bg-ds-lime-soft/40" : ""}`}>
                        <CellMark value={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </Reveal>
      </Section>

      <Section className="bg-ds-surface" labelledBy="pfaq-heading">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-4">
            <p className="site-eyebrow">Billing FAQ</p>
            <h2 id="pfaq-heading" className="site-h2 mt-5">
              Trial, quotas and billing.
            </h2>
          </Reveal>
          <Reveal delay={0.08} className="lg:col-span-8">
            <FaqList items={FAQS} />
          </Reveal>
        </div>
      </Section>

      <div className="pt-20 lg:pt-28">
        <CtaBand />
      </div>
    </main>
  );
}

function CellMark({ value }: { value: Cell }): ReactNode {
  if (value === true)
    return (
      <>
        <Check className="!mt-0" />
        <span className="sr-only">Included</span>
      </>
    );
  if (value === false) return <Minus className="size-4 text-ds-border-strong" aria-label="Not included" />;
  return <span className="text-ds-text-primary">{value}</span>;
}
