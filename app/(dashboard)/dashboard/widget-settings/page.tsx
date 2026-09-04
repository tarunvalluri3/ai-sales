import { headers } from "next/headers";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listWidgetKeysForBusiness } from "@/lib/widget-keys";
import { getBusinessForOrg } from "@/lib/business";
import { WidgetKeyList } from "./widget-key-list";
import { CreateWidgetKeyForm } from "./create-widget-key-form";
import { WidgetBrandingForm } from "./widget-branding-form";
import { SuggestedQuestionsForm } from "./suggested-questions-form";
import { AiCapabilitiesForm } from "./ai-capabilities-form";
import { PublishButton } from "./publish-button";
import { WidgetInstallGuide } from "./widget-install-guide";
import { SandboxChatPanel } from "../_components/sandbox-chat/sandbox-chat-panel";
import { PermissionNotice } from "../_components/state-views";

export default async function WidgetSettingsPage() {
  const { businessId, orgId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:admin");
  const [widgetKeys, business, requestHeaders] = await Promise.all([
    listWidgetKeysForBusiness(businessId),
    getBusinessForOrg(orgId),
    headers(),
  ]);
  // widget-loader.js is served from this same app, so the snippet's script
  // src is always this request's own origin -- resolved server-side (no
  // NEXT_PUBLIC_APP_URL) so both the guide and the key list can render it
  // without a client-only effect or a hydration mismatch.
  const appOrigin = `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Chat widget</h1>
        <p className="max-w-2xl text-sm text-ds-text-secondary">
          Your AI sales employee talks to prospects through a small chat panel embedded on your
          website. Each widget key identifies your business and carries its own list of allowed
          origins — the exact site(s) it may be embedded on. Rotate a key by creating a new one,
          updating your embedded snippet, confirming it works, then revoking the old key.
        </p>
      </div>

      <WidgetInstallGuide widgetKeys={widgetKeys} appOrigin={appOrigin} />

      <PublishButton isPublished={business?.published_at != null} canEdit={canEdit} />

      <SandboxChatPanel />

      {canEdit ? <CreateWidgetKeyForm /> : <PermissionNotice />}

      <WidgetKeyList widgetKeys={widgetKeys} appOrigin={appOrigin} canEdit={canEdit} />

      <WidgetBrandingForm
        initialAccentColor={business?.widget_accent_color ?? ""}
        initialLogoUrl={business?.widget_logo_url ?? ""}
        initialWelcomeText={business?.widget_welcome_text ?? ""}
        initialWelcomeTextClosed={business?.widget_welcome_text_closed ?? ""}
        initialCtaText={business?.widget_cta_text ?? ""}
        initialPosition={business?.widget_position ?? "bottom-right"}
        initialLanguage={business?.widget_language ?? "en"}
        canEdit={canEdit}
      />

      <SuggestedQuestionsForm initialQuestions={business?.widget_suggested_questions ?? []} canEdit={canEdit} />

      <AiCapabilitiesForm
        initialRecommendProductsEnabled={business?.recommend_products_enabled ?? false}
        initialAppointmentsEnabled={business?.appointments_enabled ?? false}
        initialAppointmentSlotMinutes={business?.appointment_slot_minutes ?? 30}
        canEdit={canEdit}
      />
    </div>
  );
}
