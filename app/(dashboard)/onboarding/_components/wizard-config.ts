import type { OnboardingStep } from "@/lib/supabase/types";

/**
 * The 6 stages shown on the wizard's progress rail. `account`/`verify`
 * are deliberately not stages here -- see lib/onboarding-steps.ts's own
 * comment: Clerk's hosted sign-up already requires a verified email
 * before a session exists, so by the time this page renders there is
 * nothing left to do for either of them.
 */
export type WizardStageKey = "business" | "train" | "persona" | "channels" | "plan" | "review";

export type TrainSubStep = "knowledge" | "products" | "faqs";

export const WIZARD_STAGES: ReadonlyArray<{
  key: WizardStageKey;
  label: string;
  subtitle: string;
}> = [
  { key: "business", label: "Your business", subtitle: "Tell us who you are" },
  { key: "train", label: "Train your agent", subtitle: "Knowledge, products & FAQs" },
  { key: "persona", label: "Personality", subtitle: "How your agent sounds" },
  { key: "channels", label: "Channels", subtitle: "Where prospects can chat" },
  { key: "plan", label: "Plan & billing", subtitle: "Choose how you pay" },
  { key: "review", label: "Test & go live", subtitle: "Publish your agent" },
];

/** Maps a real `OnboardingStep` (lib/onboarding-steps.ts) onto the rail's 6 stages. */
export function stageForStep(step: OnboardingStep): WizardStageKey {
  switch (step) {
    case "account":
    case "verify":
    case "business":
      return "business";
    case "knowledge":
    case "products":
    case "faqs":
      return "train";
    case "persona":
      return "persona";
    case "channels":
      return "channels";
    case "plan":
      return "plan";
    case "review":
    case "live":
      return "review";
  }
}

export function isTrainSubStep(step: OnboardingStep): step is TrainSubStep {
  return step === "knowledge" || step === "products" || step === "faqs";
}

const STEP_ORDER: OnboardingStep[] = [
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

export function stepIndex(step: OnboardingStep): number {
  return STEP_ORDER.indexOf(step);
}

export function isOnboardingStep(value: string | undefined): value is OnboardingStep {
  return typeof value === "string" && (STEP_ORDER as string[]).includes(value);
}

/** 1-indexed position among the 6 rail stages, for the "Step X of 6" eyebrow. */
export function stageNumber(step: OnboardingStep): number {
  const key = stageForStep(step);
  return WIZARD_STAGES.findIndex((s) => s.key === key) + 1;
}
