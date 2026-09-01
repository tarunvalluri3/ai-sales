-- Phase 25g "AI sales agent, not chatbot" (STATE.md), Phase B1: budget-aware,
-- image-backed catalog recommendations. products/services gain three
-- optional fields on top of the existing free-text name/description/price:
-- image_url (a photo to show alongside a recommendation -- entered by hand
-- here, or auto-filled by the PDF-catalog pipeline, Phase B2), category
-- (free text, not a fixed enum -- categories vary too much per business
-- vertical to enumerate), and price_amount (a real numeric price used for
-- budget filtering/sorting -- kept *alongside* the existing free-text
-- `price` column, not replacing it, since some businesses will always want
-- "Contact for pricing"-style display; price_amount is populated only when
-- the owner -- or the extraction pipeline -- has an actual number).
alter table public.products
  add column image_url text,
  add column category text,
  add column price_amount numeric(12,2);

alter table public.services
  add column image_url text,
  add column category text,
  add column price_amount numeric(12,2);

alter table public.products
  add constraint products_image_url_length check (image_url is null or char_length(image_url) <= 2048),
  add constraint products_category_length check (category is null or char_length(category) <= 60);

alter table public.services
  add constraint services_image_url_length check (image_url is null or char_length(image_url) <= 2048),
  add constraint services_category_length check (category is null or char_length(category) <= 60);

-- No new grant statement needed: products/services already grant
-- `authenticated` full table-level SELECT/INSERT/UPDATE/DELETE (not
-- column-scoped, unlike businesses' settings columns), which already
-- covers these three new columns.

-- Per-business AI "conversion goal" -- an explicit dashboard setting
-- (never auto-inferred), gating whether the new recommend_products tool
-- is bound for a business at all and how the system prompt's closing CTA
-- is phrased (lib/rag.ts). Defaults to the existing lead-generation
-- behavior for every business, including ones that predate this column.
alter table public.businesses
  add column ai_conversion_goal text not null default 'generate_leads'
    check (ai_conversion_goal in ('generate_leads', 'recommend_products'));

grant update (ai_conversion_goal) on public.businesses to authenticated;

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
    'ai_conversion_goal.updated'
  )
);
