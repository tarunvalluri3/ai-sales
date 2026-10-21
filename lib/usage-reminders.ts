import "server-only";
import type { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";
import { getAppUrl } from "@/lib/app-url";
import { renderBrandedEmail } from "@/lib/email-template";
import { sendEmail } from "@/lib/email-sender";
import { GST_RATE_PERCENT, ORDERED_PLANS, formatPaiseAsInr, type PlanDefinition } from "@/lib/plans";
import type { ReplyQuotaStatus } from "@/lib/usage-limit";

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * The quota reminder emails: 50% of the plan's AI replies, then every 10%
 * after it, then a distinct upgrade email at 100%. Phase 17a (STATE.md).
 *
 * **Each threshold fires at most once per billing period**, and that is a
 * database guarantee rather than a careful ordering of awaits: the row in
 * `usage_reminder_sends` is inserted *first*, and the email is sent only
 * if that insert actually created the row. A burst of turns crossing 50%
 * together, two regions serving the same business, or a function restart
 * replaying work all collide on the composite primary key and produce one
 * email. The ledger is keyed by the period start, so it resets itself
 * every billing period with no sweeper.
 *
 * **Sent inside `after()` on the turn, not from the daily cron** -- a
 * deliberate choice, and the less tidy of the two. A business on Starter
 * can go from 50% to 100% inside an afternoon; a daily cron would mail
 * "you've used 50%" the next morning, by which time the AI has already
 * stopped and the email is a post-mortem rather than a warning. The whole
 * point of the 50/60/70/80/90 ladder is that it arrives while there is
 * still something to do about it. The costs of doing it per turn are real
 * but small: `after()` runs after the response is serialized, so the
 * prospect waits on nothing, and the only extra work on a turn that does
 * *not* cross a threshold is an integer comparison -- the percentage comes
 * from the count the quota check already made (see
 * `ReplyQuotaStatus.repliesUsed`), never a second query. The cron keeps
 * its existing job and gains nothing here.
 *
 * Both emails go to the **business**, so they keep the Waves AI Pilot
 * lockup and leave through lib/email-sender.ts, which owns suppression,
 * the from-address and reply routing.
 */

export const USAGE_REMINDER_THRESHOLDS = [50, 60, 70, 80, 90, 100] as const;
export type UsageReminderThreshold = (typeof USAGE_REMINDER_THRESHOLDS)[number];

/**
 * The highest threshold `repliesUsed` has reached, or null below 50%.
 *
 * Only the highest one is ever sent. A turn that jumps a business from 45%
 * to 72% sends the 70% email and nothing else: the 50% and 60% warnings
 * are strictly weaker statements of the same fact, and usage only ever
 * goes up within a period, so neither can become the highest later. 100%
 * requires actually reaching the quota, not merely rounding to it.
 */
export function thresholdReached(repliesUsed: number, replyQuota: number): UsageReminderThreshold | null {
  if (replyQuota <= 0) return null;
  if (repliesUsed >= replyQuota) return 100;
  const percent = (repliesUsed / replyQuota) * 100;
  let reached: UsageReminderThreshold | null = null;
  for (const threshold of USAGE_REMINDER_THRESHOLDS) {
    if (threshold < 100 && percent >= threshold) reached = threshold;
  }
  return reached;
}

/** The plan to sell next. Null on the largest plan, where the answer is "talk to us". */
function nextPlanUp(currentPlanKey: string): PlanDefinition | null {
  const index = ORDERED_PLANS.findIndex((plan) => plan.key === currentPlanKey);
  if (index < 0) return ORDERED_PLANS[0] ?? null;
  return ORDERED_PLANS[index + 1] ?? null;
}

/** Customers are India-only for v1, so dates are shown in IST. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function planPriceLine(plan: PlanDefinition): string {
  return `${formatPaiseAsInr(plan.monthlyPricePaise)} / month + ${GST_RATE_PERCENT}% GST`;
}

/**
 * Claims the threshold for this period. Returns true only if this call is
 * the one that created the row -- i.e. only one caller anywhere ever gets
 * true for a given (business, period, threshold).
 *
 * A unique-violation (23505) means somebody already sent it, which is a
 * normal outcome and not an error. Any other error returns false *without*
 * sending: we would rather miss one reminder than mail a business the same
 * warning on every turn because the ledger was unreadable.
 */
async function claimThreshold(
  supabase: ServiceClient,
  businessId: string,
  periodStart: string,
  threshold: UsageReminderThreshold,
): Promise<boolean> {
  const { error } = await supabase.from("usage_reminder_sends").insert({
    business_id: businessId,
    period_start: periodStart,
    threshold_percent: threshold,
  });

  if (!error) return true;
  if (error.code === "23505") return false;
  logEvent("usage_reminder_claim_failed", businessId, { threshold }, "error");
  return false;
}

/**
 * Sends the reminder for the threshold this turn crossed, if any.
 *
 * Never throws -- called from `after()` on a path whose real job is
 * already done. Call it with the count *including* the turn that just
 * happened (the quota check's `repliesUsed` plus one when the turn wrote
 * an `ai_response_metrics` row), which is what the callers do.
 */
export async function sendUsageReminderIfDue(
  supabase: ServiceClient,
  businessId: string,
  status: ReplyQuotaStatus,
  repliesUsed: number,
): Promise<void> {
  // A percentage derived from a count that failed to read is not a
  // measurement, and this is the one place in the quota path that acts on
  // the number rather than just letting a turn through.
  if (status.degraded) return;

  const threshold = thresholdReached(repliesUsed, status.replyQuota);
  if (threshold === null) return;

  const { data: business, error } = await supabase
    .from("businesses")
    .select("name, contact_email")
    .eq("id", businessId)
    .maybeSingle();

  if (error || !business) {
    logEvent("usage_reminder_business_read_failed", businessId, { threshold }, "error");
    return;
  }

  // Checked before claiming, not after: a business that has not set a
  // contact email yet should still get this warning once it does, rather
  // than having the threshold silently burned while it was unreachable.
  if (!business.contact_email) {
    logEvent("usage_reminder_skipped_no_contact_email", businessId, { threshold });
    return;
  }

  if (!(await claimThreshold(supabase, businessId, status.entitlement.periodStart, threshold))) return;

  const { subject, email } =
    threshold === 100
      ? buildLimitReachedEmail(business.name, status, repliesUsed)
      : buildApproachingLimitEmail(business.name, status, repliesUsed, threshold);

  const outcome = await sendEmail({ to: business.contact_email, subject, email });

  logEvent(
    outcome === "sent" ? "usage_reminder_sent" : `usage_reminder_${outcome}`,
    businessId,
    { threshold, repliesUsed, replyQuota: status.replyQuota, planKey: status.entitlement.planKey },
    outcome === "failed" ? "error" : "info",
  );
}

/**
 * The 50-90% warning. States the numbers, says plainly what happens at
 * 100%, and offers the upgrade without pressing -- a business comfortably
 * inside its plan should not be nagged, just informed.
 */
function buildApproachingLimitEmail(
  businessName: string,
  status: ReplyQuotaStatus,
  repliesUsed: number,
  threshold: UsageReminderThreshold,
) {
  const { entitlement, replyQuota } = status;
  const remaining = Math.max(replyQuota - repliesUsed, 0);
  const planLabel = entitlement.isTrial
    ? "your 14-day free trial"
    : `your ${entitlement.planName} plan`;

  return {
    subject: `${threshold}% of your AI replies used - ${businessName}`,
    email: renderBrandedEmail({
      heading: `You've used ${threshold}% of your AI replies`,
      paragraphs: [
        `Your AI sales employee has answered ${repliesUsed.toLocaleString("en-IN")} of the ${replyQuota.toLocaleString("en-IN")} replies included in ${planLabel} this period.`,
        "At 100% it stops replying. Prospects are told that someone from your team will follow up and the conversation is flagged in your dashboard, so nothing on your site breaks and nothing gets invented -- but those enquiries wait on a person instead.",
        "If you look like running out before the period ends, moving up a plan takes effect straight away.",
      ],
      facts: [
        { label: "Plan", value: entitlement.isTrial ? "Free trial" : entitlement.planName },
        { label: "Replies used", value: `${repliesUsed.toLocaleString("en-IN")} of ${replyQuota.toLocaleString("en-IN")}` },
        { label: "Replies left", value: remaining.toLocaleString("en-IN") },
        { label: "Period ends", value: formatDate(entitlement.periodEnd) },
      ],
      cta: { label: "See plans", url: `${getAppUrl()}/pricing` },
      footnote: `Sent once at 50% and again at each 10% after it, to the contact email for ${businessName}.`,
    }),
  };
}

/**
 * The 100% email: the upgrade prompt, written as sales copy.
 *
 * It leads with what the AI achieved rather than with an error, because
 * that is the honest framing -- a business that used its whole quota got
 * every reply it paid for -- and because "your service has stopped" is a
 * worse opening for the one email in this product whose job is to sell
 * something. It is still completely specific about what prospects see
 * right now, since a business must never have to guess whether its site
 * is broken.
 */
function buildLimitReachedEmail(businessName: string, status: ReplyQuotaStatus, repliesUsed: number) {
  const { entitlement, replyQuota } = status;
  const upgrade = nextPlanUp(entitlement.isTrial ? "" : entitlement.planKey);

  const paragraphs = [
    entitlement.isTrial
      ? `Your free trial's ${replyQuota.toLocaleString("en-IN")} AI replies are used up -- ${repliesUsed.toLocaleString("en-IN")} prospect conversations your AI sales employee handled for ${businessName} without anyone on your team touching them.`
      : `Your AI sales employee has answered all ${replyQuota.toLocaleString("en-IN")} replies included in your ${entitlement.planName} plan this period. That is ${replyQuota.toLocaleString("en-IN")} prospect conversations it handled for ${businessName} without anyone on your team touching them.`,
    "It has paused for now. Prospects who message are told that someone from your team will follow up, and every one of those conversations is flagged in your dashboard -- your site is not broken and your AI is not inventing answers. Those enquiries are simply waiting on a person again.",
  ];

  if (upgrade) {
    paragraphs.push(
      `${upgrade.name} switches it straight back on with ${upgrade.monthlyReplyQuota.toLocaleString("en-IN")} replies a month, at ${planPriceLine(upgrade)}. Upgrades apply immediately and you pay only the difference for the rest of your period.`,
    );
  } else {
    paragraphs.push(
      `You are on ${entitlement.planName}, our largest published plan. Reply to this email or call us and we will put together the volume you actually need.`,
    );
  }

  paragraphs.push(
    entitlement.isTrial
      ? "Either way, nothing you have set up goes anywhere -- your knowledge, products and conversations are all exactly where you left them."
      : `Your quota resets on ${formatDate(entitlement.periodEnd)} either way.`,
  );

  const facts = [
    { label: "Plan", value: entitlement.isTrial ? "Free trial" : entitlement.planName },
    { label: "Replies used", value: `${repliesUsed.toLocaleString("en-IN")} of ${replyQuota.toLocaleString("en-IN")}` },
    ...(upgrade
      ? [
          { label: `${upgrade.name} gives you`, value: `${upgrade.monthlyReplyQuota.toLocaleString("en-IN")} replies / month` },
          { label: `${upgrade.name} costs`, value: planPriceLine(upgrade) },
        ]
      : []),
    ...(entitlement.isTrial ? [] : [{ label: "Resets on", value: formatDate(entitlement.periodEnd) }]),
  ];

  return {
    subject: entitlement.isTrial
      ? `Your trial replies are used up - switch ${businessName}'s AI back on`
      : `Your AI replies are used up - switch ${businessName}'s AI back on`,
    email: renderBrandedEmail({
      heading: upgrade
        ? "Your AI employee is in demand. Give it more room."
        : "Your AI employee is in demand. Let's talk volume.",
      paragraphs,
      facts,
      cta: {
        label: upgrade ? `Upgrade to ${upgrade.name}` : "See plans",
        url: `${getAppUrl()}/pricing`,
      },
      footnote: `Sent once per billing period to the contact email for ${businessName}.`,
    }),
  };
}
