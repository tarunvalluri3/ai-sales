import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";
import { ProfileForm } from "./profile-form";

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

      {isAdmin ? (
        <section className="flex w-full max-w-lg flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <ProfileForm
            initialName={business.name}
            initialDescription={business.description ?? ""}
            initialContactEmail={business.contact_email ?? ""}
            initialContactPhone={business.contact_phone ?? ""}
            initialWebsite={business.website ?? ""}
          />
        </section>
      ) : (
        <div className="flex w-full max-w-lg flex-col gap-3">
          <dl className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
            <div className="flex flex-col gap-0.5">
              <dt className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">
                Business name
              </dt>
              <dd className="text-sm text-ds-text-primary">{business.name}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">
                Description
              </dt>
              <dd className="text-sm text-ds-text-primary">{business.description ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">
                Contact email
              </dt>
              <dd className="text-sm text-ds-text-primary">{business.contact_email ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">
                Contact phone
              </dt>
              <dd className="text-sm text-ds-text-primary">{business.contact_phone ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">
                Website
              </dt>
              <dd className="text-sm text-ds-text-primary">{business.website ?? "—"}</dd>
            </div>
          </dl>
          <p className="text-sm text-ds-text-muted">
            Ask your organization admin to make changes to the business profile.
          </p>
        </div>
      )}
    </div>
  );
}
