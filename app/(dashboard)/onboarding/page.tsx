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
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-zinc-600">
          Ask your organization admin to finish setting up this business.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-2xl font-semibold text-zinc-900">Set up your business</h1>
      <OnboardingForm />
    </div>
  );
}
