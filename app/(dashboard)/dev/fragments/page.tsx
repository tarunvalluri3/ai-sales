import { AnalyticsMini } from "@/components/marketing/fragments/analytics-mini";
import { BookingCard } from "@/components/marketing/fragments/booking-card";
import { BusinessSetup } from "@/components/marketing/fragments/business-setup";
import { GroundedAnswer } from "@/components/marketing/fragments/grounded-answer";
import { HandoffInbox } from "@/components/marketing/fragments/handoff-inbox";
import { HeroConversation } from "@/components/marketing/fragments/hero-conversation";
import { KnowledgeSources } from "@/components/marketing/fragments/knowledge-sources";
import { Qualification } from "@/components/marketing/fragments/qualification";

/**
 * Temporary review page for the landing-page redesign's product fragments,
 * in isolation, before they're assembled into the real sections. Not linked
 * from anywhere -- delete once the redesign ships.
 */
export default function FragmentsDevPage() {
  return (
    <div className="flex flex-1 flex-col gap-16 bg-ds-bg px-6 py-16">
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="text-xl font-semibold text-ds-text-primary">Marketing fragments — review</h1>
        <p className="mt-1 text-sm text-ds-text-secondary">
          Each fragment below, in isolation, at its natural width. Not routed anywhere else.
        </p>
      </div>

      <FragmentSlot title="HeroConversation">
        <HeroConversation />
      </FragmentSlot>

      <FragmentSlot title="GroundedAnswer" width="narrow">
        <GroundedAnswer />
      </FragmentSlot>

      <FragmentSlot title="BusinessSetup" width="narrow">
        <BusinessSetup />
      </FragmentSlot>

      <FragmentSlot title="KnowledgeSources" width="narrow">
        <KnowledgeSources />
      </FragmentSlot>

      <FragmentSlot title="Qualification" width="narrow">
        <Qualification />
      </FragmentSlot>

      <FragmentSlot title="HandoffInbox" width="narrow">
        <HandoffInbox />
      </FragmentSlot>

      <FragmentSlot title="AnalyticsMini" width="narrow">
        <AnalyticsMini />
      </FragmentSlot>

      <FragmentSlot title="BookingCard" width="narrow">
        <BookingCard />
      </FragmentSlot>
    </div>
  );
}

function FragmentSlot({
  title,
  width = "wide",
  children,
}: {
  title: string;
  width?: "wide" | "narrow";
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <span className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">{title}</span>
      <div className={`border-t border-dashed border-ds-border pt-6 ${width === "narrow" ? "max-w-sm" : ""}`}>
        {children}
      </div>
    </div>
  );
}
