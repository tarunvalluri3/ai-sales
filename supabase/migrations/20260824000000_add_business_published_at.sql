-- Phase 25c: "test your AI before publishing" onboarding workspace. A
-- business only exists in one of two states now: unpublished (the public
-- /api/chat path fails closed, same as an unknown widget key -- see
-- lib/widget-auth.ts) or published (published_at set, normal service).
--
-- Every business that already exists at migration time is backfilled to
-- published (published_at = created_at) -- they onboarded under the old,
-- always-live flow and are very likely already embedded on a real site;
-- silently taking their live widget offline would be a production
-- regression, not a feature. Only businesses created after this migration
-- start unpublished and must explicitly publish (widget-settings/actions.ts's
-- publishBusinessAction) before their widget key will serve real chat.
alter table public.businesses
  add column published_at timestamptz;

update public.businesses set published_at = created_at where published_at is null;

-- Column-scoped grant, same pattern as every other business-settings
-- field (20260822000000). org:admin-only enforcement happens at the
-- application layer (requireMinRole), not here.
grant update (published_at) on public.businesses to authenticated;

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
    'business.published'
  )
);
