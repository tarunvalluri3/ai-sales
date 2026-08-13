import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";

export default async function DashboardPage() {
  const context = await requireAuthContext();

  if (!context.orgId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-zinc-600">
          Select or create an organization to continue.
        </p>
      </div>
    );
  }

  const business = await getBusinessForOrg(context.orgId);
  if (!business) {
    redirect("/onboarding");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-2xl font-semibold text-zinc-900">{business.name}</h1>
    </div>
  );
}
