import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";
import { computeOnboardingProgress, ROUTE_FOR_STEP } from "@/lib/onboarding-steps";
import type { OnboardingStep } from "@/lib/supabase/types";
import { listProductsForBusiness } from "@/lib/products";
import { listFaqsForBusiness } from "@/lib/faqs";
import { listKnowledgeDocumentsForBusiness } from "@/lib/knowledge";
import { listWidgetKeysForBusiness } from "@/lib/widget-keys";
import { getWhatsappConnectionForBusiness } from "@/lib/whatsapp";
import { getInstagramConnectionForBusiness } from "@/lib/instagram";
import { getEntitlementForBusiness, getBillingIdentityForBusiness, channelNotEntitledMessage } from "@/lib/subscription";
import { checkReplyQuota } from "@/lib/usage-limit";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { ORDERED_PLANS, GST_RATE_PERCENT } from "@/lib/plans";
import { SUPPLIER } from "@/lib/invoice-config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadReadinessReport, getFaqGeneratedDocStatuses } from "@/lib/onboarding-readiness-data";
import { WizardShell, type StageStatus } from "./_components/wizard-shell";
import { OnboardingPreviewProvider } from "./_components/preview-context";
import { WIZARD_STAGES, isOnboardingStep, stageForStep, type WizardStageKey } from "./_components/wizard-config";
import { BusinessStep } from "./_components/steps/business-step";
import { TrainKnowledgeStep } from "./_components/steps/train-knowledge-step";
import { TrainProductsStep } from "./_components/steps/train-products-step";
import { TrainFaqsStep } from "./_components/steps/train-faqs-step";
import { PersonaStep } from "./_components/steps/persona-step";
import { ChannelsStep } from "./_components/steps/channels-step";
import { PlanStep } from "./_components/steps/plan-step";
import { ReviewStep } from "./_components/steps/review-step";

/**
 * The guided `/onboarding` wizard (2026-10-29 redesign, STATE.md). Every
 * setup step a business needs -- knowledge, products, FAQs, persona,
 * channels, plan, publish -- now lives inside this one shell instead of
 * on separate dashboard pages, resuming at `?step=` via the real
 * `onboarding_step` guard (lib/onboarding-steps.ts, unchanged).
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const context = await requireAuthContext();
  if (!context.orgId) {
    redirect("/session-tasks/choose-organization");
  }

  const business = await getBusinessForOrg(context.orgId);

  if (business?.published_at) {
    redirect("/dashboard");
  }

  if (context.orgRole !== "org:admin") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-ds-bg text-center">
        <p className="text-sm text-ds-text-secondary">
          Ask your organization admin to finish setting up this business.
        </p>
      </div>
    );
  }

  if (!business) {
    return (
      <OnboardingPreviewProvider
        seed={{
          businessName: "",
          description: null,
          greeting: null,
          firstProductName: null,
          firstFaqQuestion: null,
          firstFaqAnswer: null,
          essentialsDone: 0,
          essentialsTotal: 9,
        }}
      >
        <WizardShell
          activeStage="business"
          stageStatus={Object.fromEntries(
            WIZARD_STAGES.map((s) => [s.key, s.key === "business" ? "current" : "upcoming"]),
          ) as Record<WizardStageKey, StageStatus>}
          stageHref={Object.fromEntries(WIZARD_STAGES.map((s) => [s.key, "/onboarding"])) as Record<
            WizardStageKey,
            string
          >}
          eyebrow="Step 1 of 6 · Your business"
          heading="Let's set up your AI sales employee"
          description="Tell us who you are -- this becomes your agent's identity."
          footer={null}
        >
          <BusinessStep business={null} />
        </WizardShell>
      </OnboardingPreviewProvider>
    );
  }

  const businessId = business.id;
  const progress = await computeOnboardingProgress(business);

  const { step: stepParam } = await searchParams;
  const requested = isOnboardingStep(stepParam) ? stepParam : null;
  const activeStep: OnboardingStep =
    requested && stepIndexAllowed(requested, progress.currentStep) ? requested : progress.currentStep;

  const [
    products,
    faqs,
    knowledgeDocuments,
    faqDocStatuses,
    widgetKeys,
    whatsapp,
    instagram,
    entitlement,
    readiness,
    requestHeaders,
  ] = await Promise.all([
    listProductsForBusiness(businessId),
    listFaqsForBusiness(businessId),
    listKnowledgeDocumentsForBusiness(businessId),
    getFaqGeneratedDocStatuses(businessId),
    listWidgetKeysForBusiness(businessId),
    getWhatsappConnectionForBusiness(businessId),
    getInstagramConnectionForBusiness(businessId),
    getEntitlementForBusiness(businessId),
    loadReadinessReport(businessId, business),
    headers(),
  ]);

  const appOrigin = `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;
  const metCount = readiness.items.filter((i) => i.status === "met").length;

  const previewSeed = {
    businessName: business.name,
    description: business.description,
    greeting: business.widget_welcome_text,
    firstProductName: products[0]?.name ?? null,
    firstFaqQuestion: faqs[0]?.question ?? null,
    firstFaqAnswer: faqs[0]?.answer ?? null,
    essentialsDone: metCount,
    essentialsTotal: readiness.items.length,
  };

  const activeStage = stageForStep(activeStep);
  const stageStatus: Record<WizardStageKey, StageStatus> = Object.fromEntries(
    WIZARD_STAGES.map((s) => {
      if (s.key === activeStage) return [s.key, "current"];
      const stepsForStage = ONBOARDING_STEP_FOR_STAGE[s.key];
      const done = stepsForStage.every((step) => progress.completion[step]);
      return [s.key, done ? "done" : "upcoming"];
    }),
  ) as Record<WizardStageKey, StageStatus>;
  const stageHref: Record<WizardStageKey, string> = {
    business: ROUTE_FOR_STEP.business,
    train: ROUTE_FOR_STEP.knowledge,
    persona: ROUTE_FOR_STEP.persona,
    channels: ROUTE_FOR_STEP.channels,
    plan: ROUTE_FOR_STEP.plan,
    review: ROUTE_FOR_STEP.review,
  };

  const { eyebrow, heading, description, content, footer } = await (async () => {
    switch (activeStep) {
      case "business":
        return {
          eyebrow: "Step 1 of 6 · Your business",
          heading: "Let's set up your AI sales employee",
          description: "This becomes your agent's identity.",
          content: <BusinessStep business={business} />,
          footer: null,
        };
      case "knowledge":
        return {
          eyebrow: "Step 2 of 6 · Train your agent · 1/3",
          heading: "Add what your agent should know",
          description: "Import your website, upload documents, or write it yourself.",
          content: <TrainKnowledgeStep documents={knowledgeDocuments} />,
          footer: null,
        };
      case "products":
        return {
          eyebrow: "Step 2 of 6 · Train your agent · 2/3",
          heading: "What do you sell?",
          description: "Add at least one product or service your agent can talk about.",
          content: <TrainProductsStep products={products} />,
          footer: null,
        };
      case "faqs":
        return {
          eyebrow: "Step 2 of 6 · Train your agent · 3/3",
          heading: "Common questions, answered",
          description: "Add at least 3 FAQs so your agent can answer confidently.",
          content: <TrainFaqsStep faqs={faqs} docStatusByFaqId={faqDocStatuses} />,
          footer: null,
        };
      case "persona":
        return {
          eyebrow: "Step 3 of 6 · Personality",
          heading: "How should your agent sound?",
          description: "Pick a tone and write the greeting prospects see first.",
          content: <PersonaStep business={business} />,
          footer: null,
        };
      case "channels":
        return {
          eyebrow: "Step 4 of 6 · Channels",
          heading: "Where can prospects chat with you?",
          description: "Connect at least one channel -- your website widget is always included.",
          content: (
            <ChannelsStep
              widgetKeys={widgetKeys}
              appOrigin={appOrigin}
              widgetLanguage={business.widget_language}
              publishedAt={business.published_at}
              whatsapp={whatsapp}
              instagram={instagram}
              whatsappEntitled={entitlement.channels.whatsapp}
              instagramEntitled={entitlement.channels.instagram}
              whatsappUpgradeMessage={channelNotEntitledMessage("whatsapp", entitlement)}
              instagramUpgradeMessage={channelNotEntitledMessage("instagram", entitlement)}
            />
          ),
          footer: null,
        };
      case "plan":
        return {
          eyebrow: "Step 5 of 6 · Plan & billing",
          heading: "Choose how you pay",
          description: "Upgrades take effect straight away; downgrades at your next renewal.",
          content: await buildPlanStep(businessId, business.name, entitlement),
          footer: null,
        };
      case "review":
      default: {
        const activeWidgetKey = widgetKeys.find((k) => k.status !== "revoked")?.key ?? null;
        const channelNames = [
          activeWidgetKey ? "your website" : null,
          whatsapp ? "WhatsApp" : null,
          instagram ? "Instagram" : null,
        ].filter((v): v is string => v != null);
        return {
          eyebrow: "Step 6 of 6 · Test & go live",
          heading: "Ready to go live?",
          description: "Review what's set up, test your agent, then publish.",
          content: (
            <ReviewStep
              report={readiness}
              isPublished={business.published_at != null}
              hasActiveKey={widgetKeys.some((k) => k.status !== "revoked")}
              hasPrivacyPolicyUrl={Boolean(business.privacy_policy_url)}
              businessName={business.name}
              channelSummary={channelNames.length > 0 ? channelNames.join(" and ") : "no channel yet"}
              checklistRows={[
                { label: "Business profile", href: "/onboarding", done: progress.completion.business, summary: business.description ? "Set up" : "Incomplete" },
                { label: "Knowledge", href: "/onboarding?step=knowledge", done: progress.completion.knowledge, summary: `${knowledgeDocuments.length} source${knowledgeDocuments.length === 1 ? "" : "s"}` },
                { label: "Products & services", href: "/onboarding?step=products", done: progress.completion.products, summary: `${products.length} item${products.length === 1 ? "" : "s"}` },
                { label: "FAQs", href: "/onboarding?step=faqs", done: progress.completion.faqs, summary: `${faqs.length} FAQ${faqs.length === 1 ? "" : "s"}` },
                { label: "Personality", href: "/onboarding?step=persona", done: progress.completion.persona, summary: business.widget_welcome_text ? "Set up" : "Incomplete" },
                { label: "Channels", href: "/onboarding?step=channels", done: progress.completion.channels, summary: channelNames.length > 0 ? channelNames.join(", ") : "None yet" },
                { label: "Plan & billing", href: "/onboarding?step=plan", done: progress.completion.plan, summary: entitlement.planName },
              ]}
              activeWidgetKey={activeWidgetKey}
              appOrigin={appOrigin}
            />
          ),
          footer: null,
        };
      }
    }
  })();

  return (
    <OnboardingPreviewProvider seed={previewSeed}>
      <WizardShell
        activeStage={activeStage}
        stageStatus={stageStatus}
        stageHref={stageHref}
        eyebrow={eyebrow}
        heading={heading}
        description={description}
        footer={footer}
      >
        {content}
      </WizardShell>
    </OnboardingPreviewProvider>
  );
}

const ONBOARDING_STEP_FOR_STAGE: Record<WizardStageKey, OnboardingStep[]> = {
  business: ["business"],
  train: ["knowledge", "products", "faqs"],
  persona: ["persona"],
  channels: ["channels"],
  plan: ["plan"],
  review: ["review"],
};

/** A step can only be requested if it's already reached (completed stages + the current one) -- matches the rail's "upcoming stages aren't clickable" rule. */
function stepIndexAllowed(requested: OnboardingStep, currentStep: OnboardingStep): boolean {
  const order: OnboardingStep[] = [
    "account",
    "verify",
    "business",
    "knowledge",
    "products",
    "faqs",
    "persona",
    "channels",
    "plan",
    "review",
    "live",
  ];
  return order.indexOf(requested) <= order.indexOf(currentStep);
}

async function buildPlanStep(
  businessId: string,
  businessName: string,
  entitlement: Awaited<ReturnType<typeof getEntitlementForBusiness>>,
) {
  const supabase = createServerSupabaseClient();
  const [quota, identity] = await Promise.all([
    checkReplyQuota(supabase, businessId),
    getBillingIdentityForBusiness(businessId),
  ]);
  const configured = isRazorpayConfigured();
  const identityDefaults = {
    name: identity?.name ?? businessName,
    address: identity?.address ?? "",
    stateCode: identity?.stateCode ?? "",
    gstin: identity?.gstin ?? "",
  };

  return (
    <PlanStep
      configured={configured}
      entitlement={{
        planKey: entitlement.planKey,
        planName: entitlement.planName,
        status: entitlement.status,
        grandfathered: entitlement.grandfathered,
        isTrial: entitlement.isTrial,
        serving: entitlement.serving,
        notServingReason: entitlement.notServingReason,
        periodStart: entitlement.periodStart,
        periodEnd: entitlement.periodEnd,
        trialEndsAt: entitlement.trialEndsAt,
        cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
        scheduledPlanKey: entitlement.scheduledPlanKey,
        billingInterval: entitlement.billingInterval,
        hasPaymentMethod: entitlement.hasPaymentMethod,
        pastDueSince: entitlement.pastDueSince,
        graceUntil: entitlement.graceUntil,
      }}
      usage={{ repliesUsed: quota.repliesUsed, replyQuota: quota.replyQuota, degraded: quota.degraded }}
      identity={identityDefaults}
      plans={ORDERED_PLANS.map((p) => ({
        key: p.key,
        name: p.name,
        monthlyPricePaise: p.monthlyPricePaise,
        annualPricePaise: p.annualPricePaise,
        monthlyReplyQuota: p.monthlyReplyQuota,
        seatsLabel: p.seatsLabel,
      }))}
      gstRatePercent={GST_RATE_PERCENT}
      supplierStateName={SUPPLIER.stateName}
    />
  );
}
