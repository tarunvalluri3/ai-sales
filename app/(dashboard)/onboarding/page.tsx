import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";
import { computeOnboardingProgress, ONBOARDING_STEPS, ROUTE_FOR_STEP } from "@/lib/onboarding-steps";
import type { OnboardingStep } from "@/lib/supabase/types";
import { listServicesForBusiness } from "@/lib/services";
import { listProductsForBusiness } from "@/lib/products";
import { listFaqsForBusiness } from "@/lib/faqs";
import { listKnowledgeDocumentsForBusiness } from "@/lib/knowledge";
import { summarizeSavedHours } from "@/lib/business-hours-summary";
import { sanitizeAccentColor } from "@/lib/widget-colors";
import { listBusinessHours } from "@/lib/business-hours";
import { listWidgetKeysForBusiness } from "@/lib/widget-keys";
import { getWhatsappConnectionForBusiness } from "@/lib/whatsapp";
import { getEmbeddedSignupClientConfig } from "@/lib/whatsapp-embedded-signup";
import { websiteOrigin } from "@/lib/schemas/onboarding-website";
import { getInstagramConnectionForBusiness, getInstagramPendingSelection } from "@/lib/instagram";
import { getEntitlementForBusiness, getBillingIdentityForBusiness, channelNotEntitledMessage, channelAllowed } from "@/lib/subscription";
import { checkReplyQuota } from "@/lib/usage-limit";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { ORDERED_PLANS, GST_RATE_PERCENT, TRIAL_DAYS } from "@/lib/plans";
import { channelLaunchSwitchesFromEnv, describeLaunchedTrialChannels, entitlementConfigFromEnv } from "@/lib/entitlement-rules";
import { connectedMetaChannelsFrom } from "@/lib/connected-meta-channels";
import { launchedMetaChannelNames, type ConnectedMetaChannels } from "@/lib/plan-channel-copy";
import { SUPPLIER } from "@/lib/invoice-config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadReadinessReport, getFaqGeneratedDocStatuses } from "@/lib/onboarding-readiness-data";
import { countReadinessItems, evaluateReadiness } from "@/lib/onboarding-readiness";
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
import { isAgentPublished } from "@/lib/agent-published";

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
  searchParams: Promise<{ step?: string; select?: string }>;
}) {
  const context = await requireAuthContext();
  if (!context.orgId) {
    redirect("/session-tasks/choose-organization");
  }

  const business = await getBusinessForOrg(context.orgId);
  const { step: stepParam, select } = await searchParams;

  // A published agent belongs on the dashboard -- except on the review step,
  // which shows the "Your agent is live" confirmation right after Publish
  // (the publish action re-renders this page) and then continues to the
  // dashboard on its own (ReviewStep).
  if (business && isAgentPublished(business) && stepParam !== "review") {
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
    const organizationId = context.orgId;
    const [organization, user] = await Promise.all([
      clerkClient().then((clerk) => clerk.organizations.getOrganization({ organizationId })),
      currentUser(),
    ]);
    const startingReadiness = evaluateReadiness({
      name: "", businessType: "", description: null, contactEmail: null, contactPhone: null,
      website: null, privacyPolicyUrl: null, appointmentsEnabled: true, alreadyPublished: false,
      knowledgeSources: [], faqs: [], catalogItems: [], openBusinessHoursDayCount: 0,
      businessHoursConfirmed: false, dismissedItemKeys: [],
    });
    return (
      <OnboardingPreviewProvider
        seed={{
          agentName: null,
          agentAvatarUrl: null,
          businessName: organization.name,
          description: null,
          greeting: null,
          firstProductName: null,
          firstFaqQuestion: null,
          firstFaqAnswer: null,
          ...countReadinessItems(startingReadiness.items),
          published: false,
          accent: null,
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
          description="Tell us who you are — this becomes your agent's identity."
          footer={null}
        >
          <BusinessStep business={null} readinessItems={startingReadiness.items} initialName={organization.name} initialEmail={user?.primaryEmailAddress?.emailAddress ?? ""} />
        </WizardShell>
      </OnboardingPreviewProvider>
    );
  }

  const businessId = business.id;
  const progress = await computeOnboardingProgress(business);

  const requested = isOnboardingStep(stepParam) ? stepParam : null;
  const activeStep: OnboardingStep =
    requested && stepIndexAllowed(requested, progress.currentStep)
      ? requested
      : stepIndexAllowed(business.onboarding_step, progress.currentStep) &&
          ONBOARDING_STEPS.indexOf(business.onboarding_step) >= ONBOARDING_STEPS.indexOf("business")
        ? business.onboarding_step
        : progress.currentStep;

  const [
    products,
    services,
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
    listServicesForBusiness(businessId),
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
  const counts = countReadinessItems(readiness.items);

  const previewSeed = {
    businessName: business.name,
    agentName: business.agent_name,
    agentAvatarUrl: business.agent_avatar_url,
    description: business.description,
    greeting: business.widget_welcome_text,
    firstProductName: products[0]?.name ?? services[0]?.name ?? null,
    firstFaqQuestion: faqs[0]?.question ?? null,
    firstFaqAnswer: faqs[0]?.answer ?? null,
    ...counts,
    published: isAgentPublished(business),
    accent: sanitizeAccentColor(business.widget_accent_color),
  };

  const activeStage = stageForStep(activeStep);
  const stageStatus: Record<WizardStageKey, StageStatus> = Object.fromEntries(
    WIZARD_STAGES.map((s) => {
      if (s.key === activeStage) return [s.key, "current"];
      const stepsForStage = ONBOARDING_STEP_FOR_STAGE[s.key];
      const done = stepsForStage.every((step) =>
        progress.completion[step] && stepIndexAllowed(step, business.onboarding_step),
      );
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
          content: <BusinessStep business={business} readinessItems={readiness.items} hours={await listBusinessHours(businessId)} />,
          footer: null,
        };
      case "knowledge":
        return {
          eyebrow: "Step 2 of 6 · Train your agent · 1/3",
          heading: "Add what your agent should know",
          description: "Import your website, upload documents, or write it yourself.",
          content: <TrainKnowledgeStep documents={knowledgeDocuments} agentPublished={isAgentPublished(business)} />,
          footer: null,
        };
      case "products":
        return {
          eyebrow: "Step 2 of 6 · Train your agent · 2/3",
          heading: "What do you sell?",
          description: "Add at least one product or service your agent can talk about.",
          content: <TrainProductsStep products={products} services={services} industry={business.business_type} currency={business.currency} />,
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
          content: <PersonaStep business={business} hoursSummary={summarizeSavedHours(await listBusinessHours(businessId), business.timezone ?? "UTC")} />,
          footer: null,
        };
      case "channels": {
        const instagramEntitled = channelAllowed(entitlement, "instagram");
        const accounts = typeof select === "string" && instagramEntitled ? await getInstagramPendingSelection(businessId, select) : null;
        return {
          eyebrow: "Step 4 of 6 · Channels",
          heading: "Where can prospects chat with you?",
          description: "Set up your website widget. You can also connect WhatsApp or Instagram if your plan includes them.",
          content: (
            <ChannelsStep
              widgetKeys={widgetKeys}
              appOrigin={appOrigin}
              website={websiteOrigin(business.website)}
              embeddedSignup={channelAllowed(entitlement, "whatsapp") ? getEmbeddedSignupClientConfig() : null}
              instagramSelection={typeof select === "string" ? { selectionId: select, accounts } : undefined}
              isPublished={isAgentPublished(business)}
              whatsapp={whatsapp}
              instagram={instagram}
              whatsappEntitled={channelAllowed(entitlement, "whatsapp")}
              instagramEntitled={instagramEntitled}
              whatsappUpgradeMessage={channelNotEntitledMessage("whatsapp", entitlement)}
              instagramUpgradeMessage={channelNotEntitledMessage("instagram", entitlement)}
            />
          ),
          footer: null,
        };
      }
      case "plan":
        return {
          eyebrow: "Step 5 of 6 · Plan & billing",
          heading: entitlement.isTrial && entitlement.serving ? "Start free — no card needed" : "Choose a plan",
          description:
            entitlement.isTrial && entitlement.serving
              ? "Your free trial is already active. Choose a paid plan now or any time before it ends."
              : "Upgrades take effect straight away; downgrades at your next renewal.",
          content: await buildPlanStep(businessId, business.name, entitlement, connectedMetaChannelsFrom(whatsapp, instagram)),
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
        const live = isAgentPublished(business);
        const quota = entitlement.isTrial ? await checkReplyQuota(createServerSupabaseClient(), businessId) : null;
        const trialEnd = entitlement.trialEndsAt
          ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: business.timezone ?? "UTC" }).format(new Date(entitlement.trialEndsAt))
          : null;
        const catalogCount = products.length + services.length;
        const planSummary = quota && trialEnd
          ? `Free trial · ends ${trialEnd} · ${quota.repliesUsed} of ${quota.replyQuota} replies used`
          : entitlement.planName;
        return {
          eyebrow: "Step 6 of 6 · Test & go live",
          heading: live ? "You're live" : "Ready to go live?",
          description: live ? "Your agent is answering prospects now." : "Review what's set up, test your agent, then publish.",
          content: (
            <ReviewStep
              report={readiness}
              counts={counts}
              isPublished={live}
              hasActiveKey={widgetKeys.some((k) => k.status !== "revoked")}
              hasPrivacyPolicyUrl={Boolean(business.privacy_policy_url)}
              businessName={business.name}
              channelSummary={channelNames.length > 0 ? channelNames.join(" and ") : "no channel yet"}
              checklistRows={[
                { label: "Business profile", href: "/onboarding", done: progress.completion.business, summary: business.description ? "Set up" : "Incomplete" },
                { label: "Knowledge", href: "/onboarding?step=knowledge", done: progress.completion.knowledge, summary: `${knowledgeDocuments.length} source${knowledgeDocuments.length === 1 ? "" : "s"}` },
                { label: "Products & services", href: "/onboarding?step=products", done: progress.completion.products, summary: `${catalogCount} item${catalogCount === 1 ? "" : "s"}` },
                { label: "FAQs", href: "/onboarding?step=faqs", done: progress.completion.faqs, summary: `${faqs.length} FAQ${faqs.length === 1 ? "" : "s"}` },
                { label: "Personality", href: "/onboarding?step=persona", done: progress.completion.persona, summary: business.widget_welcome_text ? "Set up" : "Incomplete" },
                { label: "Channels", href: "/onboarding?step=channels", done: progress.completion.channels, summary: channelNames.length > 0 ? channelNames.join(", ") : "None yet" },
                { label: "Plan & billing", href: "/onboarding?step=plan", done: progress.completion.plan, summary: planSummary },
              ]}
              activeWidgetKey={activeWidgetKey}
              appOrigin={appOrigin}
              recommendedDetails={{
                website: business.website,
                privacyPolicyUrl: business.privacy_policy_url,
              }}
              openingHours={{
                hours: await listBusinessHours(businessId),
                slaMinutes: business.sla_minutes ?? null,
                timezone: business.timezone ?? "UTC",
              }}
            />
          ),
          footer: null,
        };
      }
    }
  })();

  return (
    <OnboardingPreviewProvider key={activeStep} seed={previewSeed}>
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
  return ONBOARDING_STEPS.indexOf(requested) <= ONBOARDING_STEPS.indexOf(currentStep);
}

async function buildPlanStep(
  businessId: string,
  businessName: string,
  entitlement: Awaited<ReturnType<typeof getEntitlementForBusiness>>,
  connectedChannels: ConnectedMetaChannels,
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
        noSubscription: entitlement.noSubscription,
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
      trialReplyQuota={entitlementConfigFromEnv().trialReplyQuota}
      trialDays={TRIAL_DAYS}
      trialChannels={describeLaunchedTrialChannels(channelLaunchSwitchesFromEnv())}
      metaChannelNames={launchedMetaChannelNames(channelLaunchSwitchesFromEnv())}
      connectedChannels={connectedChannels}
    />
  );
}
