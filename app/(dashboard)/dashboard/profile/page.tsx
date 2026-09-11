import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";
import { ProfileForm } from "./profile-form";
import { DangerZone } from "./danger-zone";

export default async function ProfilePage() {
  const context = await requireAuthContext();

  if (!context.orgId) {
    redirect("/session-tasks/choose-organization");
  }

  const business = await getBusinessForOrg(context.orgId);
  if (!business) {
    redirect("/onboarding");
  }

  const isAdmin = context.orgRole === "org:admin";

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Business profile</h1>
        <p className="text-sm text-ds-text-secondary">
          This is what your AI sales employee tells prospects about who you are.
        </p>
      </div>

      <section className="flex w-full max-w-lg flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <ProfileForm
          initialName={business.name}
          initialBusinessType={business.business_type}
          initialDescription={business.description ?? ""}
          initialContactEmail={business.contact_email ?? ""}
          initialContactPhone={business.contact_phone ?? ""}
          initialWebsite={business.website ?? ""}
          canEdit={isAdmin}
        />
      </section>

      {isAdmin ? <DangerZone businessName={business.name} /> : null}
    </div>
  );
}
