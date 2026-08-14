import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const context = await requireAuthContext();

  if (!context.orgId) {
    redirect("/session-tasks/choose-organization");
  }

  const business = await getBusinessForOrg(context.orgId);
  if (business) {
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

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-ds-bg px-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Set up your business</h1>
        <p className="text-sm text-ds-text-secondary">
          This becomes your AI sales employee&apos;s identity — you can add products, services, and knowledge next.
        </p>
      </div>
      <OnboardingForm />
    </div>
  );
}
