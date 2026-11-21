import { headers } from "next/headers";
import Link from "next/link";
import { Info, Monitor, RefreshCw } from "lucide-react";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listWidgetKeysForBusiness } from "@/lib/widget-keys";
import { getBusinessForOrg } from "@/lib/business";
import { WidgetKeyList } from "./widget-key-list";
import { CreateWidgetKeyForm } from "./create-widget-key-form";
import { WidgetBrandingForm } from "./widget-branding-form";
import { SuggestedQuestionsForm } from "./suggested-questions-form";
import { AiCapabilitiesForm } from "./ai-capabilities-form";
import { WidgetInstallGuide } from "./widget-install-guide";
import { PermissionNotice } from "../_components/state-views";
import { Card, InfoBanner, PageHeader, btnPrimary } from "../_components/ui";

const TABS = [
  { id: "appearance", label: "Appearance", description: "Make your AI sales employee feel at home on your website." },
  { id: "questions", label: "Suggested questions", description: "Help visitors start a useful conversation." },
  { id: "capabilities", label: "AI capabilities", description: "Choose how your AI helps prospects take the next step." },
  { id: "install", label: "Installation & keys", description: "Connect your website to your AI sales employee." },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default async function WidgetSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { businessId, businessName, orgId, orgRole, published } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:admin");
  const [widgetKeys, business, requestHeaders, params] = await Promise.all([
    listWidgetKeysForBusiness(businessId),
    getBusinessForOrg(orgId),
    headers(),
    searchParams,
  ]);
  // widget-loader.js is served from this same app, so the snippet's script
  // src is always this request's own origin -- resolved server-side (no
  // NEXT_PUBLIC_APP_URL) so both the guide and the key list can render it
  // without a client-only effect or a hydration mismatch.
  const appOrigin = `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;
  const activeWidgetKeyCount = widgetKeys.filter((key) => key.status !== "revoked").length;

  // A business that has not published yet lands on the install steps (that
  // is the page's whole job until then); afterwards Appearance leads.
  const fallbackTab: TabId = published ? "appearance" : "install";
  const activeTab: TabId = TABS.find((tab) => tab.id === params.tab)?.id ?? fallbackTab;
  const tabMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
  const savedQuestions = business?.widget_suggested_questions ?? [];

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader icon={Monitor} title="Widget settings" description={tabMeta.description} />

      <nav aria-label="Widget settings sections" className="dx-tabs">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={`/dashboard/widget-settings?tab=${tab.id}`}
            aria-current={tab.id === activeTab ? "page" : undefined}
            className="dx-tab px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {!published ? (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-medium text-ds-text-primary">Not published yet</h2>
            <p className="dx-subtitle">Readiness, testing and publishing now happen in the guided setup wizard, not here.</p>
          </div>
          <Link href="/onboarding?step=review" className={btnPrimary}>
            Go to Test &amp; go live
          </Link>
        </Card>
      ) : null}

      {activeTab === "appearance" ? (
        <WidgetBrandingForm
          businessName={businessName}
          initialAgentName={business?.agent_name ?? null}
          initialAgentAvatarUrl={business?.agent_avatar_url ?? null}
          initialAccentColor={business?.widget_accent_color ?? ""}
          initialLogoUrl={business?.widget_logo_url ?? ""}
          initialWelcomeText={business?.widget_welcome_text ?? ""}
          initialWelcomeTextClosed={business?.widget_welcome_text_closed ?? ""}
          initialCtaText={business?.widget_cta_text ?? ""}
          initialPosition={business?.widget_position ?? "bottom-right"}
          initialLanguage={business?.widget_language ?? "en"}
          initialPrivacyPolicyUrl={business?.privacy_policy_url ?? ""}
          suggestedQuestions={savedQuestions}
          isPublished={published}
          activeKeyCount={activeWidgetKeyCount}
          canEdit={canEdit}
        />
      ) : null}

      {activeTab === "questions" ? (
        <SuggestedQuestionsForm
          initialQuestions={savedQuestions}
          businessName={businessName}
          accentColor={business?.widget_accent_color ?? ""}
          logoUrl={business?.widget_logo_url ?? ""}
          greeting={business?.widget_welcome_text ?? ""}
          language={business?.widget_language ?? "en"}
          isPublished={published}
          activeKeyCount={activeWidgetKeyCount}
          canEdit={canEdit}
        />
      ) : null}

      {activeTab === "capabilities" ? (
        <AiCapabilitiesForm
          initialRecommendProductsEnabled={business?.recommend_products_enabled ?? false}
          initialAppointmentsEnabled={business?.appointments_enabled ?? false}
          initialAppointmentSlotMinutes={business?.appointment_slot_minutes ?? 30}
          isPublished={published}
          activeKeyCount={activeWidgetKeyCount}
          canEdit={canEdit}
        />
      ) : null}

      {activeTab === "install" ? (
        <>
          <InfoBanner icon={Info} tone="neutral">
            Widget keys connect your website to your business. Allowed origins control where each key can be used.
          </InfoBanner>
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
            <WidgetInstallGuide
              widgetKeys={widgetKeys}
              appOrigin={appOrigin}
              isPublished={published}
              activeKeyCount={activeWidgetKeyCount}
            />
            {/* Create + manage are one continuous task (create a key, then see
                it appear in the list), so they share a card. */}
            <Card className="flex flex-col gap-4">
              <h2 className="dx-title">Widget keys</h2>
              <WidgetKeyList
                widgetKeys={widgetKeys}
                appOrigin={appOrigin}
                widgetLanguage={business?.widget_language ?? "en"}
                canEdit={canEdit}
              />
              {canEdit ? <CreateWidgetKeyForm /> : <PermissionNotice />}
              <p className="flex items-start gap-3 text-sm text-ds-text-secondary">
                <RefreshCw className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                To rotate a key: create a new one, replace your snippet, then revoke the old key.
              </p>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
