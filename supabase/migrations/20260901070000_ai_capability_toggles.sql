-- Replaces the exclusive `ai_conversion_goal` enum ('generate_leads' |
-- 'recommend_products') with an independent boolean, matching how
-- appointments_enabled (Phase C) already works. request_callback (lead
-- capture) was never actually gated by this enum -- it's unconditionally
-- bound in lib/rag.ts regardless -- so the enum only ever toggled
-- recommend_products on/off. Dropped cleanly rather than deprecated:
-- nothing will ever read the old column again once this ships, so keeping
-- it around is just a footgun for a future reader, unlike price/price_amount
-- (Phase B1) where both columns stayed independently meaningful.

alter table public.businesses
  add column recommend_products_enabled boolean not null default false;

update public.businesses
  set recommend_products_enabled = (ai_conversion_goal = 'recommend_products');

alter table public.businesses drop column ai_conversion_goal;

grant update (recommend_products_enabled) on public.businesses to authenticated;

alter table public.audit_log drop constraint audit_log_action_check;

alter table public.audit_log add constraint audit_log_action_check check (
  action in (
    'conversation.control_changed',
    'conversation.attention_dismissed',
    'knowledge.deleted',
    'knowledge.published',
    'knowledge.unpublished',
    'widget_key.created',
    'widget_key.origins_updated',
    'widget_key.revoked',
    'webhook_endpoint.created',
    'webhook_endpoint.deleted',
    'business_hours.updated',
    'widget_branding.updated',
    'business.published',
    'widget_suggested_questions.updated',
    'ai_conversion_goal.updated',
    'appointment_settings.updated',
    'appointment.confirmed',
    'appointment.declined',
    'appointment.cancelled',
    'ai_capabilities.updated'
  )
);
