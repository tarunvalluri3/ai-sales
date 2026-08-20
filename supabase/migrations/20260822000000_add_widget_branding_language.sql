-- Phase 25a: widget branding (accent color, logo, welcome text, CTA copy,
-- placement) and language selection. All business-wide settings (one
-- widget "look" per business, not per widget_key) -- mirrors the existing
-- business-profile-fields pattern (20260813140000), not the per-key
-- widget_keys table (Phase 24 rotation/origins remain per-key; branding
-- is not a rotation concern).
--
-- widget_welcome_text / widget_welcome_text_closed: independently
-- optional so a business can set only one, or neither (falls back to
-- lib/widget-i18n.ts's localized default greeting for the resolved
-- language) -- "office-hours-aware greeting" per docs/phases.md Phase 25.
-- widget_position: dashboard-configured default: the embed snippet's own
-- data-position attribute (public/widget-loader.js) can still override
-- it per-embed; this column only drives what the dashboard's own
-- generated snippet suggests.
alter table public.businesses
  add column widget_accent_color text,
  add column widget_logo_url text,
  add column widget_welcome_text text,
  add column widget_welcome_text_closed text,
  add column widget_cta_text text,
  add column widget_position text not null default 'bottom-right',
  add column widget_language text not null default 'en';

alter table public.businesses
  add constraint businesses_widget_accent_color_format
    check (widget_accent_color is null or widget_accent_color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint businesses_widget_position_check
    check (widget_position in ('bottom-right', 'bottom-left')),
  add constraint businesses_widget_language_check
    check (widget_language in ('en', 'es', 'fr', 'de', 'pt', 'hi'));

-- Same mechanism as widget_allowed_origin/business-profile fields: the
-- existing businesses_update_own_org RLS policy (Phase 11) already
-- permits UPDATE on org-matched rows at the row level; this column-level
-- GRANT is what actually lets `authenticated` touch these columns.
-- org:admin-only enforcement happens at the application layer.
grant update (
  widget_accent_color,
  widget_logo_url,
  widget_welcome_text,
  widget_welcome_text_closed,
  widget_cta_text,
  widget_position,
  widget_language
) on public.businesses to authenticated;
