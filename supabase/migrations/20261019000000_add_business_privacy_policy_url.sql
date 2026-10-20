-- The widget's consent notice (app/(widget)/widget/embed/_components/
-- composer.tsx) linked to a relative '/privacy', which -- because the
-- widget iframe is served from THIS app's origin -- always resolved to
-- Waves AI Pilot's own privacy policy, never the customer business's.
--
-- That is the wrong page to put in front of a prospect. For visitor
-- conversation data the customer business is the Data Fiduciary (it
-- decides why the contact details are collected) and this app is only
-- its Data Processor -- exactly as app/(dashboard)/privacy/page.tsx now
-- states in words. The notice a prospect consents against should
-- therefore be the customer's own policy. This column is what lets each
-- business supply it; the widget falls back to '/privacy' only when it
-- is unset, so no existing embed breaks.
--
-- Deliberately NOT named widget_privacy_policy_url, unlike the Phase 25a
-- widget_* branding columns it is edited alongside: this is a
-- business-level legal fact (same category as contact_email/website from
-- 20260813140000), not widget chrome, and a later non-widget use -- an
-- email footer, say -- would read oddly through a widget_ prefix. It is
-- surfaced in the Branding & language card purely because that is where
-- the widget's prospect-facing copy and the publish gate already live.
--
-- The '^https://' check duplicates lib/schemas/business.ts's Zod
-- refinement on purpose, matching the businesses_widget_accent_color_format
-- precedent (20260822000000): both values end up rendered directly into
-- markup (an href here, a CSS custom property there), so neither relies
-- on the application layer alone. http:// is rejected rather than
-- upgraded -- the consent notice renders inside an https page, so a
-- plaintext link would be a mixed-content and trust problem, and silently
-- rewriting a business's own URL would be worse than refusing it.
alter table public.businesses
  add column privacy_policy_url text;

alter table public.businesses
  add constraint businesses_privacy_policy_url_format
    check (privacy_policy_url is null or privacy_policy_url ~ '^https://');

-- Same mechanism as the widget branding columns (20260822000000) and the
-- business-profile fields: the existing businesses_update_own_org RLS
-- policy (Phase 11) already permits UPDATE on org-matched rows at the row
-- level; this column-level GRANT is what actually lets `authenticated`
-- touch the column. org:admin-only enforcement happens at the application
-- layer, in updateWidgetBrandingAction.
grant update (privacy_policy_url) on public.businesses to authenticated;
