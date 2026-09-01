-- Phase 25e: AI-suggested prefilled questions shown as clickable chips on
-- the widget's greeting screen (Chatbase-style). Generated on demand from
-- the business's own products/services/FAQs (dashboard/widget-settings's
-- new "Generate with AI" action, Gemini via lib/widget-suggested-questions.ts)
-- but held as a plain business-wide setting here, only ever written by the
-- dashboard's own save action after the owner reviews/edits the AI's
-- suggestions -- never written by the AI pipeline itself, same
-- "AI proposes, human approves before it's live" shape as Stage 2's
-- catalog-extraction review, applied to a much lower-stakes field (widget
-- UI copy, not a business fact the AI answers with).
alter table public.businesses
  add column widget_suggested_questions jsonb;

alter table public.businesses
  add constraint businesses_widget_suggested_questions_shape
    check (
      widget_suggested_questions is null
      or (
        jsonb_typeof(widget_suggested_questions) = 'array'
        and jsonb_array_length(widget_suggested_questions) <= 6
      )
    );

-- Same column-scoped grant pattern as every other widget-settings field
-- (20260822000000). org:admin-only enforcement happens at the
-- application layer (requireMinRole), not here.
grant update (widget_suggested_questions) on public.businesses to authenticated;

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
    'widget_suggested_questions.updated'
  )
);
