import { headers } from "next/headers";
import Link from "next/link";
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

      <section className="flex flex-col gap-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide-ds text-ds-text-muted">
          1. Set up your widget
        </h2>
        <WidgetInstallGuide
          widgetKeys={widgetKeys}
          appOrigin={appOrigin}
          publishedAt={business?.published_at ?? null}
        />
        {/* Create + manage are one continuous task (create a key, then see
           it appear below) -- grouped tighter than the gap-6 that separates
           this cluster from the install guide above, so proximity signals
           the relationship instead of every block reading as equally related. */}
        <div className="flex flex-col gap-3">
          {canEdit ? <CreateWidgetKeyForm /> : <PermissionNotice />}
          <WidgetKeyList
            widgetKeys={widgetKeys}
            appOrigin={appOrigin}
            widgetLanguage={business?.widget_language ?? "en"}
            canEdit={canEdit}
          />
        </div>
      </section>

      {business?.published_at == null ? (
        <section className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <p className="text-sm font-medium text-ds-text-primary">Not published yet</p>
          <p className="max-w-xl text-sm text-ds-text-secondary">
            Readiness, testing and publishing now happen in the guided setup wizard, not here.
          </p>
          <Link
            href="/onboarding?step=review"
            className="self-start rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            Go to Test &amp; go live
          </Link>
        </section>
      ) : null}

      <section className="flex flex-col gap-6 border-t border-ds-border pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide-ds text-ds-text-muted">2. Customize</h2>
        <WidgetBrandingForm
          initialAccentColor={business?.widget_accent_color ?? ""}
          initialLogoUrl={business?.widget_logo_url ?? ""}
          initialWelcomeText={business?.widget_welcome_text ?? ""}
          initialWelcomeTextClosed={business?.widget_welcome_text_closed ?? ""}
          initialCtaText={business?.widget_cta_text ?? ""}
          initialPosition={business?.widget_position ?? "bottom-right"}
          initialLanguage={business?.widget_language ?? "en"}
          initialPrivacyPolicyUrl={business?.privacy_policy_url ?? ""}
          canEdit={canEdit}
        />

        <SuggestedQuestionsForm initialQuestions={business?.widget_suggested_questions ?? []} canEdit={canEdit} />

        <AiCapabilitiesForm
          initialRecommendProductsEnabled={business?.recommend_products_enabled ?? false}
          initialAppointmentsEnabled={business?.appointments_enabled ?? false}
          initialAppointmentSlotMinutes={business?.appointment_slot_minutes ?? 30}
          canEdit={canEdit}
        />
      </section>
    </div>
  );
}
