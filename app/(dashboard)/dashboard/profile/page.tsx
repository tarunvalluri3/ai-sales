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
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Business profile</h1>

      {isAdmin ? (
        <ProfileForm
          initialName={business.name}
          initialDescription={business.description ?? ""}
          initialContactEmail={business.contact_email ?? ""}
          initialContactPhone={business.contact_phone ?? ""}
          initialWebsite={business.website ?? ""}
        />
      ) : (
        <div className="flex w-full max-w-lg flex-col gap-3">
          <dl className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4">
            <div>
              <dt className="text-sm font-medium text-zinc-900">Business name</dt>
              <dd className="text-sm text-zinc-600">{business.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-zinc-900">Description</dt>
              <dd className="text-sm text-zinc-600">{business.description ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-zinc-900">Contact email</dt>
              <dd className="text-sm text-zinc-600">{business.contact_email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-zinc-900">Contact phone</dt>
              <dd className="text-sm text-zinc-600">{business.contact_phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-zinc-900">Website</dt>
              <dd className="text-sm text-zinc-600">{business.website ?? "—"}</dd>
            </div>
          </dl>
          <p className="text-sm text-zinc-600">
            Ask your organization admin to make changes to the business profile.
          </p>
        </div>
      )}
    </div>
  );
}
