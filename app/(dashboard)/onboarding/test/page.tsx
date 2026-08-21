import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { getBusinessForOrg } from "@/lib/business";
import { SandboxChatPanel } from "../../dashboard/_components/sandbox-chat/sandbox-chat-panel";
import { PublishButton } from "../../dashboard/widget-settings/publish-button";

/**
 * Phase 25c "test your AI before publishing": the step onboarding lands
 * on right after a business is created (see ../actions.ts's redirect).
 * A fresh business has zero products/FAQs/knowledge, so this is
 * deliberately not a hard gate -- "Skip for now" goes straight to the
 * dashboard, and publishing can happen later from
 * /dashboard/widget-settings, which reuses these same two components.
 */
export default async function OnboardingTestPage() {
  const { orgId } = await requireBusinessContext();
  const business = await getBusinessForOrg(orgId);

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-ds-bg px-6 py-10">
      <div className="flex w-full max-w-xl flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Try out your AI</h1>
        <p className="text-sm text-ds-text-secondary">
          Your business is set up. Before you publish, ask your AI a few questions a prospect might
          ask -- add products, services, or knowledge first if you want it to have something to draw
          from.
        </p>
      </div>

      <div className="flex w-full max-w-xl flex-col gap-4">
        <SandboxChatPanel />
        <PublishButton isPublished={business?.published_at != null} />

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link
            href="/dashboard/products"
            className="font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            Add products &amp; knowledge first
          </Link>
          <Link
            href="/dashboard"
            className="text-ds-text-muted transition-colors hover:text-ds-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            Skip for now
          </Link>
        </div>
      </div>
    </div>
  );
}
