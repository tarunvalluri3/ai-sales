import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";
import { ProfileForm } from "./profile-form";
import { DangerZone } from "./danger-zone";
import { Lock, Store } from "lucide-react";
import { Card, PageHeader } from "../_components/ui";

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
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader icon={Store} title="Business profile" description="What your AI sales employee tells prospects about who you are." />

      <Card className="">
        <ProfileForm
          initialName={business.name}
          initialBusinessType={business.business_type}
          initialDescription={business.description ?? ""}
          initialContactEmail={business.contact_email ?? ""}
          initialContactPhone={business.contact_phone ?? ""}
          initialWebsite={business.website ?? ""}
          canEdit={isAdmin}
        />
      </Card>

      {isAdmin ? <DangerZone businessName={business.name} /> : null}

      <p className="flex items-center gap-3 px-2 text-sm text-ds-text-secondary">
        <Lock className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Only organisation admins can edit this profile.
      </p>
    </div>
  );
}
